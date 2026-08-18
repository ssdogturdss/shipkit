import { pipelineConfigsTable } from "@workspace/db";
import { isHeaderSafeToken } from "./secrets";
import { resolveGithubCaller } from "./github";
import {
  actionableHttpError,
  makeAppStoreJwt,
  decryptConfig,
  type DecryptedConfig,
} from "./pipeline";

/**
 * Read-only credential checks used by the "Test connection" button. Each
 * function pings one service the way the matching pipeline stage does, but
 * never triggers a build, commit, or submission — it only confirms the saved
 * credentials are valid and the target resource is reachable. The actionable
 * messages mirror the ones the pipeline surfaces on failure.
 */

export type ConnectionTestStatus = "ok" | "error" | "skipped";

export interface ConnectionTestResult {
  service: "github" | "eas" | "appstore";
  status: ConnectionTestStatus;
  message: string;
}

/** Verify the GitHub repo and branch are reachable with the configured access. */
async function testGithubConnection(config: DecryptedConfig): Promise<ConnectionTestResult> {
  const githubToken = config.githubToken?.trim() || null;
  if (githubToken && !isHeaderSafeToken(githubToken)) {
    return {
      service: "github",
      status: "error",
      message:
        "GitHub token contains invalid characters (often a hidden symbol picked up while copying). Edit this pipeline and re-paste it as plain text.",
    };
  }

  const resolved = await resolveGithubCaller(githubToken);
  if (!resolved) {
    return {
      service: "github",
      status: "skipped",
      message:
        "No GitHub access configured — connect your GitHub account, add a personal access token, or set the SHIPKIT_GITHUB_TOKEN secret. Code Sync will run in test mode.",
    };
  }

  try {
    const repoPath = `/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}`;
    const repoRes = await resolved.caller(repoPath);
    if (!repoRes.ok) {
      return { service: "github", status: "error", message: actionableHttpError("github", repoRes.status, await repoRes.text()) };
    }

    const branchRes = await resolved.caller(`${repoPath}/branches/${encodeURIComponent(config.githubBranch)}`);
    if (!branchRes.ok) {
      return {
        service: "github",
        status: "error",
        message:
          branchRes.status === 404
            ? `Branch "${config.githubBranch}" was not found in ${config.githubOwner}/${config.githubRepo}. Check the branch name in Settings.`
            : actionableHttpError("github", branchRes.status, await branchRes.text()),
      };
    }

    const via = resolved.mode === "connection" ? "your connected GitHub account" : "the configured personal access token";
    return {
      service: "github",
      status: "ok",
      message: `Repo ${config.githubOwner}/${config.githubRepo} and branch "${config.githubBranch}" are reachable via ${via}.`,
    };
  } catch (err) {
    return { service: "github", status: "error", message: `GitHub check failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Verify the EAS token is valid and the project slug exists on its account. */
async function testEasConnection(config: DecryptedConfig): Promise<ConnectionTestResult> {
  const easToken = config.easToken?.trim() || null;
  if (!easToken) {
    return {
      service: "eas",
      status: "skipped",
      message:
        "No EAS token saved — EAS Build will run in test mode. Add a token in Settings or set the SHIPKIT_EAS_TOKEN secret to enable real builds.",
    };
  }
  if (!isHeaderSafeToken(easToken)) {
    return {
      service: "eas",
      status: "error",
      message:
        "EAS access token contains invalid characters (often a hidden symbol picked up while copying). Edit this pipeline and re-paste it as plain text.",
    };
  }

  try {
    // Expo has no public REST API — the real API is GraphQL. Look up the
    // authenticated actor's accounts and their apps, then confirm one has the
    // configured slug. This is read-only and does not consume build quota.
    const query =
      "query { meActor { __typename " +
      "... on Robot { accounts { name apps(limit: 50, offset: 0) { slug } } } " +
      "... on UserActor { username accounts { name apps(limit: 50, offset: 0) { slug } } } } }";
    const res = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${easToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      return { service: "eas", status: "error", message: actionableHttpError("eas", res.status, await res.text()) };
    }

    const body = (await res.json()) as {
      data?: { meActor?: { accounts?: Array<{ name: string; apps?: Array<{ slug: string }> }> } };
      errors?: Array<{ message: string }>;
    };
    if (body.errors?.length) {
      return { service: "eas", status: "error", message: `Expo rejected the EAS token: ${body.errors[0].message}` };
    }

    const actor = body.data?.meActor;
    if (!actor) {
      return {
        service: "eas",
        status: "error",
        message:
          "Expo rejected the EAS access token — it may be invalid or expired. Create a new token at expo.dev/settings/access-tokens, then re-paste it in Settings.",
      };
    }

    const accounts = actor.accounts ?? [];
    // Note: only the first 50 apps per account are checked; ample for typical accounts.
    const owner = accounts.find((a) => (a.apps ?? []).some((p) => p.slug === config.easProjectSlug));
    if (!owner) {
      const accountNames = accounts.map((a) => a.name).join(", ") || "(none)";
      return {
        service: "eas",
        status: "error",
        message: `EAS token is valid, but no project with slug "${config.easProjectSlug}" was found on its account(s): ${accountNames}. Check the slug in Settings (slugs are case-sensitive), or run "eas init" in your app once to create it.`,
      };
    }

    return {
      service: "eas",
      status: "ok",
      message: `EAS token is valid and project "${config.easProjectSlug}" was found on account "${owner.name}".`,
    };
  } catch (err) {
    return { service: "eas", status: "error", message: `EAS check failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Verify the App Store Connect API key works and the bundle ID resolves to an app. */
async function testAppStoreConnection(config: DecryptedConfig): Promise<ConnectionTestResult> {
  if (!config.appStoreKeyId || !config.appStoreIssuerId || !config.appStorePrivateKey) {
    return {
      service: "appstore",
      status: "skipped",
      message:
        "App Store Connect credentials not complete — App Store Submit will run in test mode. Add the Key ID, Issuer ID, and .p8 private key in Settings, or set the SHIPKIT_APP_STORE_KEY_ID / SHIPKIT_APP_STORE_ISSUER_ID / SHIPKIT_APP_STORE_PRIVATE_KEY secrets, to enable real submission.",
    };
  }

  let jwt: string;
  try {
    jwt = makeAppStoreJwt(config.appStoreKeyId, config.appStoreIssuerId, config.appStorePrivateKey);
  } catch (err) {
    return {
      service: "appstore",
      status: "error",
      message: `Couldn't sign the App Store Connect request — check the .p8 private key is the full, unmodified file contents. (${err instanceof Error ? err.message : String(err)})`,
    };
  }

  try {
    const bundleId = config.appStoreBundleId ?? config.appStoreAppleId;
    const res = await fetch(`https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`, {
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      return { service: "appstore", status: "error", message: actionableHttpError("appstore", res.status, await res.text()) };
    }

    const data = (await res.json()) as { data?: Array<{ id: string; attributes?: { name?: string } }> };
    const app = data.data?.[0];
    if (!app) {
      return {
        service: "appstore",
        status: "error",
        message: `Connected to App Store Connect, but no app was found with bundle ID "${bundleId}". Check the Bundle ID in Settings.`,
      };
    }

    return {
      service: "appstore",
      status: "ok",
      message: `Connected to App Store Connect — found app "${app.attributes?.name ?? app.id}".`,
    };
  } catch (err) {
    return { service: "appstore", status: "error", message: `App Store Connect check failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Run all three read-only credential checks for a config row (raw, still
 * encrypted). Checks run in parallel since they are independent.
 */
export async function runConnectionTests(
  rawConfig: typeof pipelineConfigsTable.$inferSelect,
): Promise<ConnectionTestResult[]> {
  const config = decryptConfig(rawConfig);
  return Promise.all([
    testGithubConnection(config),
    testEasConnection(config),
    testAppStoreConnection(config),
  ]);
}
