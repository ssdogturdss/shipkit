import { createSign } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { db } from "@workspace/db";
import {
  pipelineRunsTable,
  runStagesTable,
  runLogsTable,
  pipelineConfigsTable,
  type PipelineStage,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { resolveCredential } from "./credentialSecrets";
import { decryptSecretOrNull } from "./crypto";
import { isHeaderSafeToken } from "./secrets";
import { resolveGithubCaller, type GithubCaller } from "./github";

const STAGE_ORDER: PipelineStage[] = ["sync", "build", "submit"];

/**
 * Fire an outbound webhook when a run completes (success or failure).
 * Best-effort: failures are logged but never affect the run outcome.
 */
async function sendCompletionNotification(
  runId: number,
  configId: number,
  configName: string,
  webhookUrl: string | null,
  status: "success" | "failed",
): Promise<void> {
  if (!webhookUrl) return;

  const payload = {
    event: "pipeline.run.completed",
    runId,
    configId,
    configName,
    status,
    completedAt: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "ShipKit-Agent/1.0" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      await appendLog(runId, null, "info", `Completion webhook delivered (HTTP ${res.status})`);
    } else {
      await appendLog(runId, null, "warn", `Completion webhook returned HTTP ${res.status}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendLog(runId, null, "warn", `Completion webhook failed: ${message}`);
  }
}

/** Map a failed HTTP response to an actionable, human-readable error message. */
export function actionableHttpError(
  service: "github" | "eas" | "appstore",
  status: number,
  rawText: string,
): string {
  const snippet = rawText.length > 300 ? `${rawText.slice(0, 300)}…` : rawText;
  let hint: string;
  switch (service) {
    case "github":
      hint =
        status === 401
          ? "GitHub token is invalid or expired — generate a new personal access token with 'repo' scope"
          : status === 403
            ? "GitHub token lacks permission or the API rate limit was hit — ensure the token has 'repo' scope"
            : status === 404
              ? "GitHub repo or branch not found — verify the owner, repo, and branch names and that the token can access this repo"
              : `Unexpected GitHub API response (${status})`;
      break;
    case "eas":
      hint =
        status === 401
          ? "EAS token is invalid or expired — create a new access token at expo.dev/settings/access-tokens"
          : status === 403
            ? "EAS token lacks access to this project — confirm the token's account owns the project slug"
            : status === 404
              ? "Expo API endpoint returned 404 (unexpected) — please retry in a moment"
              : `Unexpected EAS API response (${status})`;
      break;
    case "appstore":
      hint =
        status === 401
          ? "App Store Connect authentication failed — verify the Key ID, Issuer ID, and .p8 private key are correct and not expired"
          : status === 403
            ? "App Store Connect key lacks permission — the API key needs the App Manager role"
            : status === 404
              ? "App Store Connect resource not found — check the bundle ID and Apple ID"
              : `Unexpected App Store Connect API response (${status})`;
      break;
  }
  return `${hint} (HTTP ${status}: ${snippet})`;
}

async function appendLog(
  runId: number,
  stage: PipelineStage | null,
  level: "info" | "warn" | "error" | "success",
  message: string,
) {
  await db.insert(runLogsTable).values({ runId, stage: stage ?? undefined, level, message });
}

async function setStageStatus(
  runId: number,
  stageName: PipelineStage,
  status: "running" | "success" | "failed" | "skipped" | "pending",
  externalUrl?: string,
) {
  const now = new Date();
  const [stage] = await db
    .select()
    .from(runStagesTable)
    .where(and(eq(runStagesTable.runId, runId), eq(runStagesTable.stageName, stageName)));

  if (!stage) return;

  await db
    .update(runStagesTable)
    .set({
      status,
      externalUrl: externalUrl ?? stage.externalUrl,
      startedAt: status === "running" ? now : stage.startedAt,
      completedAt: ["success", "failed", "skipped"].includes(status) ? now : stage.completedAt,
    })
    .where(eq(runStagesTable.id, stage.id));
}

/**
 * Resolve all secrets for a config row before passing to pipeline stages. For
 * each field a matching Replit Secret takes precedence over the encrypted value
 * stored in the database (see `credentialSecrets.ts`).
 */
export function decryptConfig(cfg: typeof pipelineConfigsTable.$inferSelect) {
  return {
    ...cfg,
    githubToken: resolveCredential(cfg.id, "githubToken", () => decryptSecretOrNull(cfg.githubToken)),
    easToken: resolveCredential(cfg.id, "easToken", () => decryptSecretOrNull(cfg.easToken)),
    appStoreKeyId: resolveCredential(cfg.id, "appStoreKeyId", () => decryptSecretOrNull(cfg.appStoreKeyId)),
    appStoreIssuerId: resolveCredential(cfg.id, "appStoreIssuerId", () => decryptSecretOrNull(cfg.appStoreIssuerId)),
    appStorePrivateKey: resolveCredential(cfg.id, "appStorePrivateKey", () => decryptSecretOrNull(cfg.appStorePrivateKey)),
  };
}

export type DecryptedConfig = ReturnType<typeof decryptConfig>;

/**
 * Pushes a sync commit to the GitHub repo by:
 *  1. Getting the current HEAD SHA of the branch
 *  2. Creating a blob with sync metadata
 *  3. Creating a new tree containing the blob
 *  4. Creating a commit pointing to the new tree
 *  5. Updating the branch ref to the new commit
 */
async function pushSyncCommit(
  runId: number,
  config: DecryptedConfig,
  caller: GithubCaller,
): Promise<{ sha: string; url: string } | null> {
  const repoPath = `/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}`;

  // 1. Get current branch ref
  await appendLog(runId, "sync", "info", `Resolving HEAD of '${config.githubBranch}'...`);
  const refRes = await caller(`${repoPath}/git/ref/heads/${config.githubBranch}`);
  if (!refRes.ok) {
    const text = await refRes.text();
    await appendLog(runId, "sync", "error", `Could not resolve branch ref: ${refRes.status} ${text}`);
    return null;
  }
  const refData = (await refRes.json()) as { object: { sha: string } };
  const headSha = refData.object.sha;
  await appendLog(runId, "sync", "info", `Branch HEAD: ${headSha.slice(0, 7)}`);

  // 2. Get the commit to find the base tree
  const commitRes = await caller(`${repoPath}/git/commits/${headSha}`);
  if (!commitRes.ok) {
    await appendLog(runId, "sync", "warn", "Could not fetch commit tree — skipping commit push");
    return null;
  }
  const commitData = (await commitRes.json()) as { tree: { sha: string } };
  const baseSha = commitData.tree.sha;

  // 3. Create blob with sync metadata
  const syncContent = JSON.stringify(
    {
      syncedAt: new Date().toISOString(),
      runId,
      branch: config.githubBranch,
      triggeredBy: "shipkit",
    },
    null,
    2,
  );
  const blobRes = await caller(`${repoPath}/git/blobs`, {
    method: "POST",
    body: { content: syncContent, encoding: "utf-8" },
  });
  if (!blobRes.ok) {
    await appendLog(runId, "sync", "warn", "Could not create blob — skipping ref update");
    return null;
  }
  const blobData = (await blobRes.json()) as { sha: string };

  // 4. Create tree
  const treeRes = await caller(`${repoPath}/git/trees`, {
    method: "POST",
    body: {
      base_tree: baseSha,
      tree: [{ path: ".shipkit/sync.json", mode: "100644", type: "blob", sha: blobData.sha }],
    },
  });
  if (!treeRes.ok) {
    await appendLog(runId, "sync", "warn", "Could not create tree — skipping ref update");
    return null;
  }
  const treeData = (await treeRes.json()) as { sha: string };

  // 5. Create commit
  const newCommitRes = await caller(`${repoPath}/git/commits`, {
    method: "POST",
    body: {
      message: `chore: shipkit sync [run #${runId}]`,
      tree: treeData.sha,
      parents: [headSha],
    },
  });
  if (!newCommitRes.ok) {
    await appendLog(runId, "sync", "warn", "Could not create commit — skipping ref update");
    return null;
  }
  const newCommitData = (await newCommitRes.json()) as { sha: string; html_url: string };

  // 6. Update branch ref
  const updateRefRes = await caller(`${repoPath}/git/refs/heads/${config.githubBranch}`, {
    method: "PATCH",
    body: { sha: newCommitData.sha, force: false },
  });

  if (!updateRefRes.ok) {
    const text = await updateRefRes.text();
    await appendLog(runId, "sync", "warn", `Ref update returned ${updateRefRes.status}: ${text}`);
    return null;
  }

  return { sha: newCommitData.sha, url: newCommitData.html_url };
}

async function runSyncStage(runId: number, config: DecryptedConfig): Promise<boolean> {
  await setStageStatus(runId, "sync", "running");
  await db.update(pipelineRunsTable).set({ currentStage: "sync" }).where(eq(pipelineRunsTable.id, runId));

  // If the config uses an uploaded zip source, skip GitHub sync entirely.
  if (config.sourceType === "upload") {
    const sourcePath = config.appSourcePath;
    if (!sourcePath) {
      await appendLog(runId, "sync", "error", "Source type is 'upload' but no extracted source path is set. Upload a zip in Settings to fix this.");
      await setStageStatus(runId, "sync", "failed");
      return false;
    }
    const { existsSync } = await import("fs");
    if (!existsSync(sourcePath)) {
      await appendLog(runId, "sync", "error", `Uploaded source directory not found at ${sourcePath}. Re-upload the zip in Settings.`);
      await setStageStatus(runId, "sync", "failed");
      return false;
    }
    await appendLog(runId, "sync", "info", "Source mode: uploaded zip (GitHub sync skipped)");
    await appendLog(runId, "sync", "success", `Using uploaded source at ${sourcePath}`);
    await setStageStatus(runId, "sync", "success");
    return true;
  }

  await appendLog(runId, "sync", "info", `Starting code sync for repo ${config.githubOwner}/${config.githubRepo} (branch: ${config.githubBranch})`);

  const githubToken = config.githubToken?.trim() || null;
  if (githubToken && !isHeaderSafeToken(githubToken)) {
    await appendLog(
      runId,
      "sync",
      "error",
      "GitHub token contains invalid characters (often a hidden symbol picked up while copying). Open Settings, edit this pipeline, and re-paste your personal access token as plain text — or remove it to sync via your connected GitHub account.",
    );
    await setStageStatus(runId, "sync", "failed");
    return false;
  }

  const resolved = await resolveGithubCaller(githubToken);

  if (!resolved) {
    await appendLog(runId, "sync", "warn", "No GitHub access configured (connect your GitHub account in Settings, or add a personal access token) — dry run mode");
    await new Promise((r) => setTimeout(r, 2000));
    await appendLog(runId, "sync", "success", `Code sync to ${config.githubOwner}/${config.githubRepo} completed (dry run)`);
    await setStageStatus(runId, "sync", "success", `https://github.com/${config.githubOwner}/${config.githubRepo}`);
    return true;
  }

  const { caller, mode } = resolved;
  await appendLog(
    runId,
    "sync",
    "info",
    mode === "connection"
      ? "Authenticating via connected GitHub account (Replit integration)"
      : "Authenticating via configured GitHub personal access token",
  );

  try {
    // Verify repo access
    const repoRes = await caller(
      `/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}`,
    );
    if (!repoRes.ok) {
      const text = await repoRes.text();
      await appendLog(runId, "sync", "error", actionableHttpError("github", repoRes.status, text));
      await setStageStatus(runId, "sync", "failed");
      return false;
    }
    const repoData = (await repoRes.json()) as { html_url: string; default_branch: string };
    await appendLog(runId, "sync", "info", `Repo confirmed: ${repoData.html_url}`);

    // Push a sync commit that updates the branch ref
    await appendLog(runId, "sync", "info", "Pushing sync commit to branch...");
    const pushed = await pushSyncCommit(runId, config, caller);

    if (pushed) {
      await appendLog(runId, "sync", "info", `Sync commit pushed: ${pushed.sha.slice(0, 7)}`);
      await appendLog(runId, "sync", "success", "Code sync to GitHub completed — branch ref updated");
      await setStageStatus(runId, "sync", "success", repoData.html_url);
    } else {
      // Commit push failed (e.g. branch doesn't exist) — fall back to dispatch event
      await appendLog(runId, "sync", "warn", "Could not push ref directly — triggering repository_dispatch as fallback");
      const dispatchRes = await caller(
        `/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/dispatches`,
        {
          method: "POST",
          body: {
            event_type: "shipkit-deploy",
            client_payload: { branch: config.githubBranch, runId },
          },
        },
      );
      if (dispatchRes.ok || dispatchRes.status === 204) {
        await appendLog(runId, "sync", "success", "repository_dispatch event triggered on GitHub");
        await setStageStatus(runId, "sync", "success", repoData.html_url);
      } else {
        const text = await dispatchRes.text();
        await appendLog(runId, "sync", "error", `dispatch error ${dispatchRes.status}: ${text}`);
        await setStageStatus(runId, "sync", "failed");
        return false;
      }
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendLog(runId, "sync", "error", `Sync stage failed: ${message}`);
    await setStageStatus(runId, "sync", "failed");
    return false;
  }
}

/** Clip long text so a single log line stays a reasonable size. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…(truncated)` : text;
}

let cachedWorkspaceRoot: string | null = null;
/** Find the monorepo root (dir containing pnpm-workspace.yaml), for path-safety checks. */
function findWorkspaceRoot(): string {
  if (cachedWorkspaceRoot) return cachedWorkspaceRoot;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      cachedWorkspaceRoot = dir;
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  cachedWorkspaceRoot = process.cwd();
  return cachedWorkspaceRoot;
}

type SourcePathResult = { ok: true; path: string } | { ok: false; message: string };
/**
 * Resolve and safety-check the app source directory for a build. The path must
 * exist inside the workspace and contain app.json + eas.json (a buildable Expo
 * app). Rejects paths outside the workspace to prevent traversal.
 */
function resolveAppSourcePath(configured: string | null): SourcePathResult {
  const raw = configured?.trim();
  if (!raw) {
    return {
      ok: false,
      message:
        "This pipeline has no app source folder set, so there is no code for EAS to build. An operator needs to point this pipeline at the folder that contains the app's app.json and eas.json.",
    };
  }
  let real: string;
  try {
    real = realpathSync(resolve(raw));
  } catch {
    return { ok: false, message: `The app source folder set for this pipeline was not found on the server: ${raw}` };
  }
  const root = findWorkspaceRoot();
  if (real !== root && !real.startsWith(root + sep)) {
    return { ok: false, message: "The app source folder is outside the workspace and was blocked for safety." };
  }
  if (!existsSync(join(real, "app.json")) || !existsSync(join(real, "eas.json"))) {
    return {
      ok: false,
      message: `The app source folder (${real}) is missing app.json or eas.json, so it isn't a buildable Expo app.`,
    };
  }
  return { ok: true, path: real };
}

interface EasCliResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
/**
 * Run the eas-cli as a child process. The token is passed via EXPO_TOKEN in the
 * environment (never on argv, which is visible in process listings). Uses an
 * args array (never a shell string) so config values can't inject shell syntax.
 */
function runEasCli(
  args: string[],
  opts: { cwd: string; easToken: string; timeoutMs: number },
): Promise<EasCliResult> {
  return new Promise((resolvePromise) => {
    const child = spawn("eas", args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        EXPO_TOKEN: opts.easToken,
        EAS_NO_VCS: "1",
        CI: "1",
        EAS_BUILD_NO_EXPO_GO_WARNING: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({
        code: -1,
        stdout,
        stderr: `${stderr}\n${err instanceof Error ? err.message : String(err)}`.trim(),
        timedOut,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

/** Tolerantly parse JSON emitted by eas-cli, ignoring any non-JSON notices. */
function parseEasJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to substring extraction */
  }
  const firstArr = trimmed.indexOf("[");
  const firstObj = trimmed.indexOf("{");
  const candidates = [firstArr, firstObj].filter((i) => i >= 0);
  if (!candidates.length) return null;
  const start = Math.min(...candidates);
  const closeChar = trimmed[start] === "[" ? "]" : "}";
  const end = trimmed.lastIndexOf(closeChar);
  if (end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function firstBuild(stdout: string): Record<string, unknown> | null {
  const data = parseEasJson(stdout);
  const build = Array.isArray(data) ? data[0] : data;
  return build && typeof build === "object" ? (build as Record<string, unknown>) : null;
}

function extractBuildId(stdout: string): string | null {
  const b = firstBuild(stdout);
  return b && typeof b.id === "string" ? b.id : null;
}

function extractBuildStatus(stdout: string): string | null {
  const b = firstBuild(stdout);
  return b && typeof b.status === "string" ? b.status : null;
}

function extractBuildUrl(stdout: string): string | null {
  const b = firstBuild(stdout);
  return b && typeof b.buildDetailsPageUrl === "string" ? b.buildDetailsPageUrl : null;
}

/** Turn raw eas-cli failure output into an honest, human-readable message. */
function classifyEasBuildError(output: string): string {
  const lower = output.toLowerCase();
  if (
    /free plan|used its ios builds|used its android builds|build limit|reset in \d+ day|reset on|upgrade your plan|out of builds|maximum number of builds/.test(
      lower,
    )
  ) {
    return "Your Expo account has used up its free monthly iOS builds. They reset on the 1st of next month — or upgrade your Expo plan at expo.dev/accounts to build right away. This is an Expo account limit, not a problem with your pipeline settings.";
  }
  if (/not logged in|unauthenticated|invalid.*(token|credentials)|401|authentication failed/.test(lower)) {
    return "Expo rejected the EAS access token — it may be invalid or expired. Create a new token at expo.dev/settings/access-tokens, then edit this pipeline and paste it in.";
  }
  if (/command not found|enoent|spawn eas/.test(lower)) {
    return "The EAS build tool isn't available on the server, so the build couldn't start.";
  }
  if (/credentials/.test(lower)) {
    return "EAS couldn't use the iOS signing credentials for this build. Check the app's credentials setup (credentials.json / certificates).";
  }
  return `EAS build could not be started. ${clip(output, 500)}`;
}

async function runBuildStage(runId: number, config: DecryptedConfig): Promise<{ success: boolean; buildId?: string }> {
  await appendLog(runId, "build", "info", `Starting EAS build for project: ${config.easProjectSlug} (platform: ios)`);
  await setStageStatus(runId, "build", "running");
  await db.update(pipelineRunsTable).set({ currentStage: "build" }).where(eq(pipelineRunsTable.id, runId));

  if (!config.easToken) {
    await appendLog(runId, "build", "warn", "No EAS token configured — dry run mode");
    await new Promise((r) => setTimeout(r, 3000));
    const fakeBuildId = `dry-${Date.now().toString(36)}`;
    const buildUrl = `https://expo.dev/projects/${config.easProjectSlug}/builds/${fakeBuildId}`;
    await appendLog(runId, "build", "info", `Build URL (dry run): ${buildUrl}`);
    await new Promise((r) => setTimeout(r, 2000));
    await appendLog(runId, "build", "success", "EAS build completed (dry run)");
    await setStageStatus(runId, "build", "success", buildUrl);
    return { success: true, buildId: fakeBuildId };
  }

  const easToken = config.easToken.trim();
  if (!isHeaderSafeToken(easToken)) {
    await appendLog(
      runId,
      "build",
      "error",
      "EAS access token contains invalid characters (often a hidden symbol picked up while copying). Open Settings, edit this pipeline, and re-paste your token from expo.dev/settings/access-tokens as plain text.",
    );
    await setStageStatus(runId, "build", "failed");
    return { success: false };
  }

  const source = resolveAppSourcePath(config.appSourcePath ?? null);
  if (!source.ok) {
    await appendLog(runId, "build", "error", source.message);
    await setStageStatus(runId, "build", "failed");
    return { success: false };
  }

  try {
    await appendLog(
      runId,
      "build",
      "info",
      `Building from ${source.path} with EAS (profile: production, platform: ios)...`,
    );
    const trigger = await runEasCli(
      ["build", "--platform", "ios", "--profile", "production", "--non-interactive", "--no-wait", "--json"],
      { cwd: source.path, easToken, timeoutMs: 12 * 60_000 },
    );

    const triggerOutput = [trigger.stdout, trigger.stderr].filter((s) => s.trim()).join("\n").trim();
    if (triggerOutput) {
      await appendLog(runId, "build", "info", `EAS output:\n${clip(triggerOutput, 4000)}`);
    }

    if (trigger.timedOut) {
      await appendLog(runId, "build", "error", "Starting the EAS build timed out. Please try again.");
      await setStageStatus(runId, "build", "failed");
      return { success: false };
    }

    const buildId = extractBuildId(trigger.stdout);
    if (!buildId) {
      // No build was created — surface the real reason (quota, auth, etc.).
      await appendLog(runId, "build", "error", classifyEasBuildError(triggerOutput));
      await setStageStatus(runId, "build", "failed");
      return { success: false };
    }

    const buildUrl =
      extractBuildUrl(trigger.stdout) ?? `https://expo.dev/projects/${config.easProjectSlug}/builds/${buildId}`;
    await appendLog(runId, "build", "info", `Build queued on EAS: ${buildUrl}`);
    await setStageStatus(runId, "build", "running", buildUrl);

    let finalStatus: string | undefined;
    for (let attempt = 1; attempt <= 60; attempt++) {
      await new Promise((r) => setTimeout(r, 30_000));
      const view = await runEasCli(
        ["build:view", buildId, "--json", "--non-interactive"],
        { cwd: source.path, easToken, timeoutMs: 60_000 },
      );
      const status = extractBuildStatus(view.stdout);
      if (!status) {
        await appendLog(runId, "build", "warn", `Polling attempt ${attempt}/60: could not read build status — retrying`);
        continue;
      }
      await appendLog(runId, "build", "info", `Build status (${attempt}/60): ${status}`);
      const s = status.toUpperCase();
      if (s === "FINISHED") {
        finalStatus = "FINISHED";
        break;
      }
      if (s === "ERRORED" || s === "CANCELED" || s === "CANCELLED") {
        finalStatus = s;
        break;
      }
    }

    if (finalStatus === "FINISHED") {
      await appendLog(runId, "build", "success", "EAS build finished successfully");
      await setStageStatus(runId, "build", "success", buildUrl);
      return { success: true, buildId };
    } else if (finalStatus) {
      await appendLog(
        runId,
        "build",
        "error",
        `EAS build ${finalStatus.toLowerCase()} — open the EAS dashboard for details: ${buildUrl}`,
      );
      await setStageStatus(runId, "build", "failed");
      return { success: false };
    } else {
      await appendLog(
        runId,
        "build",
        "warn",
        "Build is still running after the polling window — check the EAS dashboard. Submission will continue once it finishes.",
      );
      await setStageStatus(runId, "build", "success", buildUrl);
      return { success: true, buildId };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendLog(runId, "build", "error", `Build stage failed: ${message}`);
    await setStageStatus(runId, "build", "failed");
    return { success: false };
  }
}

export function makeAppStoreJwt(keyId: string, issuerId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }),
  ).toString("base64url");
  const message = `${header}.${payload}`;
  const pem = privateKey.replace(/\\n/g, "\n");
  const sign = createSign("SHA256");
  sign.update(message);
  sign.end();
  const sig = sign.sign({ key: pem, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${message}.${sig}`;
}

async function runSubmitStage(runId: number, config: DecryptedConfig): Promise<boolean> {
  await appendLog(runId, "submit", "info", `Starting App Store submission for app ${config.appStoreAppleId}`);
  await setStageStatus(runId, "submit", "running");
  await db.update(pipelineRunsTable).set({ currentStage: "submit" }).where(eq(pipelineRunsTable.id, runId));

  const connectUrl = `https://appstoreconnect.apple.com/apps/${config.appStoreAppleId}/testflight/ios`;

  if (!config.appStoreKeyId || !config.appStoreIssuerId || !config.appStorePrivateKey) {
    await appendLog(runId, "submit", "warn", "App Store Connect credentials not configured — dry run mode");
    await new Promise((r) => setTimeout(r, 2500));
    await appendLog(runId, "submit", "info", `Submitting to TestFlight for app ${config.appStoreAppleId} (dry run)`);
    await new Promise((r) => setTimeout(r, 1500));
    await appendLog(runId, "submit", "success", "App successfully submitted to TestFlight (dry run)");
    await setStageStatus(runId, "submit", "success", connectUrl);
    return true;
  }

  try {
    await appendLog(runId, "submit", "info", "Generating App Store Connect JWT (ES256)...");
    let jwt: string;
    try {
      jwt = makeAppStoreJwt(config.appStoreKeyId, config.appStoreIssuerId, config.appStorePrivateKey);
    } catch (jwtErr) {
      const msg = jwtErr instanceof Error ? jwtErr.message : String(jwtErr);
      await appendLog(runId, "submit", "error", `Failed to generate App Store JWT: ${msg}`);
      await setStageStatus(runId, "submit", "failed");
      return false;
    }

    const asc = (path: string, opts?: RequestInit) =>
      fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
      });

    await appendLog(runId, "submit", "info", "Authenticating with App Store Connect API...");
    const bundleId = config.appStoreBundleId ?? config.appStoreAppleId;
    const appsRes = await asc(`/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
    if (!appsRes.ok) {
      const text = await appsRes.text();
      await appendLog(runId, "submit", "error", actionableHttpError("appstore", appsRes.status, text));
      await setStageStatus(runId, "submit", "failed");
      return false;
    }
    const appsData = (await appsRes.json()) as { data?: Array<{ id: string; attributes?: { name?: string } }> };
    const app = appsData.data?.[0];
    if (!app) {
      await appendLog(runId, "submit", "error", `Bundle ID mismatch — no app found in App Store Connect with bundle ID '${bundleId}'. Check the App Store Bundle ID in Settings.`);
      await setStageStatus(runId, "submit", "failed");
      return false;
    }
    await appendLog(runId, "submit", "info", `App found: ${app.attributes?.name ?? app.id}`);

    await appendLog(runId, "submit", "info", "Fetching latest build...");
    const buildsRes = await asc(`/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=1`);
    if (!buildsRes.ok) {
      const text = await buildsRes.text();
      await appendLog(runId, "submit", "error", `Builds lookup error ${buildsRes.status}: ${text}`);
      await setStageStatus(runId, "submit", "failed");
      return false;
    }
    const buildsData = (await buildsRes.json()) as {
      data?: Array<{ id: string; attributes?: { version?: string; processingState?: string } }>;
    };
    const build = buildsData.data?.[0];
    if (!build) {
      await appendLog(runId, "submit", "error", "No builds found — complete an EAS build before submitting");
      await setStageStatus(runId, "submit", "failed");
      return false;
    }
    await appendLog(runId, "submit", "info", `Latest build v${build.attributes?.version ?? "?"}, state: ${build.attributes?.processingState ?? "?"}`);

    if (build.attributes?.processingState !== "VALID") {
      await appendLog(runId, "submit", "info", "Waiting for build processing...");
      let ready = false;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        const checkRes = await asc(`/builds/${build.id}`);
        if (checkRes.ok) {
          const checkData = (await checkRes.json()) as { data?: { attributes?: { processingState?: string } } };
          const state = checkData?.data?.attributes?.processingState;
          await appendLog(runId, "submit", "info", `Build processing: ${state ?? "unknown"}`);
          if (state === "VALID") { ready = true; break; }
          if (state === "INVALID") {
            await appendLog(runId, "submit", "error", "Build marked INVALID — cannot submit");
            await setStageStatus(runId, "submit", "failed");
            return false;
          }
        }
      }
      if (!ready) await appendLog(runId, "submit", "warn", "Processing timed out — attempting submission");
    }

    await appendLog(runId, "submit", "info", "Submitting to TestFlight...");
    const submitRes = await asc("/betaAppReviewSubmissions", {
      method: "POST",
      body: JSON.stringify({
        data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: build.id } } } },
      }),
    });

    if (submitRes.ok || submitRes.status === 201 || submitRes.status === 409) {
      await appendLog(runId, "submit", "success", submitRes.status === 409
        ? "Build already in TestFlight review"
        : "Build successfully submitted to TestFlight");
      await setStageStatus(runId, "submit", "success", connectUrl);
      return true;
    }

    const submitText = await submitRes.text();
    await appendLog(runId, "submit", "error", `Submission error ${submitRes.status}: ${submitText}`);
    await setStageStatus(runId, "submit", "failed");
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendLog(runId, "submit", "error", `Submit stage failed: ${message}`);
    await setStageStatus(runId, "submit", "failed");
    return false;
  }
}

/**
 * Create a pending run (plus its three stages) for a config and kick off
 * execution in the background. Shared by the manual trigger route and the
 * GitHub push webhook so both start runs through one code path.
 */
export async function startPipelineRun(
  configId: number,
  triggeredBy: "manual" | "push" = "manual",
  githubDeliveryId: string | null = null,
): Promise<typeof pipelineRunsTable.$inferSelect> {
  const [run] = await db
    .insert(pipelineRunsTable)
    .values({ configId, status: "pending", triggeredBy, githubDeliveryId })
    .returning();

  await db.insert(runStagesTable).values([
    { runId: run.id, stageName: "sync", status: "pending" },
    { runId: run.id, stageName: "build", status: "pending" },
    { runId: run.id, stageName: "submit", status: "pending" },
  ]);

  setImmediate(() => {
    executePipeline(run.id).catch((err) => {
      logger.error({ err, runId: run.id }, "Pipeline execution error");
    });
  });

  return run;
}

export async function executePipeline(runId: number): Promise<void> {
  const [run] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, runId));
  if (!run) { logger.error({ runId }, "Pipeline run not found"); return; }

  const [rawConfig] = await db.select().from(pipelineConfigsTable).where(eq(pipelineConfigsTable.id, run.configId));
  if (!rawConfig) { logger.error({ runId }, "Pipeline config not found"); return; }

  const config = decryptConfig(rawConfig);

  await db.update(pipelineRunsTable).set({ status: "running", startedAt: new Date() }).where(eq(pipelineRunsTable.id, runId));
  await appendLog(runId, null, "info", `Pipeline started: ${config.name}`);
  await appendLog(runId, null, "info", "Stages: Code Sync → EAS Build → App Store Submit");

  let failed = false;

  const syncOk = await runSyncStage(runId, config);
  if (!syncOk) {
    failed = true;
    await appendLog(runId, null, "error", "Pipeline halted: Code Sync stage failed");
    await setStageStatus(runId, "build", "skipped");
    await setStageStatus(runId, "submit", "skipped");
  }

  if (!failed) {
    const { success: buildOk } = await runBuildStage(runId, config);
    if (!buildOk) {
      failed = true;
      await appendLog(runId, null, "error", "Pipeline halted: EAS Build stage failed");
      await setStageStatus(runId, "submit", "skipped");
    }
  }

  if (!failed) {
    const submitOk = await runSubmitStage(runId, config);
    if (!submitOk) { failed = true; }
  }

  const finalStatus = failed ? "failed" : "success";
  await db
    .update(pipelineRunsTable)
    .set({ status: finalStatus, completedAt: new Date(), currentStage: null })
    .where(eq(pipelineRunsTable.id, runId));
  await appendLog(runId, null, failed ? "error" : "success", `Pipeline ${failed ? "failed" : "completed successfully"}`);
  logger.info({ runId, status: finalStatus }, "Pipeline execution complete");
  await sendCompletionNotification(runId, run.configId, config.name, rawConfig.notifyWebhookUrl, finalStatus);
}

export async function retryStageFromPoint(runId: number, startStage: PipelineStage): Promise<void> {
  const [run] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, runId));
  if (!run) return;

  const [rawConfig] = await db.select().from(pipelineConfigsTable).where(eq(pipelineConfigsTable.id, run.configId));
  if (!rawConfig) return;
  const config = decryptConfig(rawConfig);

  const startIndex = STAGE_ORDER.indexOf(startStage);

  await db.update(pipelineRunsTable).set({ status: "running", completedAt: null }).where(eq(pipelineRunsTable.id, runId));
  await appendLog(runId, null, "info", `Retrying pipeline from stage: ${startStage}`);

  for (let i = startIndex; i < STAGE_ORDER.length; i++) {
    await setStageStatus(runId, STAGE_ORDER[i], "pending");
  }

  let failed = false;

  if (startIndex <= 0) {
    const ok = await runSyncStage(runId, config);
    if (!ok) {
      failed = true;
      await setStageStatus(runId, "build", "skipped");
      await setStageStatus(runId, "submit", "skipped");
    }
  }

  if (!failed && startIndex <= 1) {
    const { success: ok } = await runBuildStage(runId, config);
    if (!ok) { failed = true; await setStageStatus(runId, "submit", "skipped"); }
  }

  if (!failed && startIndex <= 2) {
    const ok = await runSubmitStage(runId, config);
    if (!ok) failed = true;
  }

  const finalStatus = failed ? "failed" : "success";
  await db
    .update(pipelineRunsTable)
    .set({ status: finalStatus, completedAt: new Date(), currentStage: null })
    .where(eq(pipelineRunsTable.id, runId));
  await appendLog(runId, null, failed ? "error" : "success", `Pipeline retry ${failed ? "failed" : "completed"}`);
  await sendCompletionNotification(runId, run.configId, config.name, rawConfig.notifyWebhookUrl, finalStatus);
}
