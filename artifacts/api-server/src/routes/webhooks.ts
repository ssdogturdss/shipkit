import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pipelineConfigsTable, pipelineRunsTable } from "@workspace/db";
import { startPipelineRun } from "../lib/pipeline";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** True when an error is a Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

// ShipKit's own Code Sync stage pushes a marker commit. The webhook must ignore
// these so a pipeline's own push can never re-trigger itself (infinite loop).
const SYNC_COMMIT_MARKER = "chore: shipkit sync";
const SYNC_FILE = ".shipkit/sync.json";

interface PushCommit {
  message?: string;
  added?: string[];
  removed?: string[];
  modified?: string[];
}

interface PushPayload {
  ref?: string;
  deleted?: boolean;
  head_commit?: PushCommit | null;
  commits?: PushCommit[];
  repository?: { name?: string; owner?: { login?: string; name?: string } };
}

/** Constant-time comparison of the GitHub `x-hub-signature-256` header. */
function verifySignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True when the push only contains ShipKit's own sync marker commit(s). */
function isShipkitSyncPush(payload: PushPayload): boolean {
  const head = payload.head_commit;
  if (head?.message && head.message.startsWith(SYNC_COMMIT_MARKER)) return true;

  const commits = payload.commits ?? [];
  if (commits.length > 0) {
    const onlySyncFile = commits.every((c) => {
      const files = [...(c.added ?? []), ...(c.removed ?? []), ...(c.modified ?? [])];
      return files.length > 0 && files.every((f) => f === SYNC_FILE);
    });
    if (onlySyncFile) return true;
  }

  return false;
}

// GitHub push webhook — auto-deploys pipelines whose branch received a push.
// Add this URL (…/api/webhooks/github) as a repository webhook with content
// type application/json and the SHIPKIT_GITHUB_WEBHOOK_SECRET as its secret.
router.post("/webhooks/github", async (req, res): Promise<void> => {
  const event = req.headers["x-github-event"];

  // GitHub sends a one-off ping when the webhook is first created.
  if (event === "ping") {
    res.json({ ok: true, pong: true });
    return;
  }

  if (event !== "push") {
    res.json({ ok: true, ignored: `event '${String(event)}' not handled` });
    return;
  }

  const secret = process.env.SHIPKIT_GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    logger.warn("Received GitHub webhook but SHIPKIT_GITHUB_WEBHOOK_SECRET is not set");
    res.status(503).json({ error: "Webhook secret not configured" });
    return;
  }

  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  const signature = req.headers["x-hub-signature-256"];
  if (!rawBody || !verifySignature(secret, rawBody, typeof signature === "string" ? signature : undefined)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const payload = req.body as PushPayload;

  if (payload.deleted) {
    res.json({ ok: true, ignored: "branch deletion" });
    return;
  }

  const ref = payload.ref ?? "";
  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;
  const owner = payload.repository?.owner?.login ?? payload.repository?.owner?.name ?? null;
  const repo = payload.repository?.name ?? null;

  if (!branch || !owner || !repo) {
    res.json({ ok: true, ignored: "not a branch push" });
    return;
  }

  if (isShipkitSyncPush(payload)) {
    logger.info({ owner, repo, branch }, "Ignoring ShipKit's own sync commit");
    res.json({ ok: true, ignored: "shipkit sync commit" });
    return;
  }

  const configs = await db
    .select()
    .from(pipelineConfigsTable)
    .where(
      and(
        eq(pipelineConfigsTable.githubOwner, owner),
        eq(pipelineConfigsTable.githubRepo, repo),
        eq(pipelineConfigsTable.githubBranch, branch),
        eq(pipelineConfigsTable.autoDeployOnPush, true),
      ),
    );

  if (configs.length === 0) {
    res.json({ ok: true, triggered: [], message: "No auto-deploy pipelines match this push" });
    return;
  }

  // GitHub redelivers a webhook with the same X-GitHub-Delivery id when it
  // doesn't get a fast 2xx, and users can manually click "Redeliver". Use that
  // id as an idempotency key so a retry never starts a second deployment.
  const deliveryHeader = req.headers["x-github-delivery"];
  const deliveryId = typeof deliveryHeader === "string" && deliveryHeader.trim() ? deliveryHeader.trim() : null;

  // Find configs already triggered by this exact delivery (idempotency). Without
  // a delivery id we can't dedupe, so fall through and trigger as before.
  const alreadyTriggered = new Set<number>();
  if (deliveryId) {
    const existing = await db
      .select({ configId: pipelineRunsTable.configId })
      .from(pipelineRunsTable)
      .where(eq(pipelineRunsTable.githubDeliveryId, deliveryId));
    for (const row of existing) alreadyTriggered.add(row.configId);
  }

  const triggered: number[] = [];
  const skipped: number[] = [];
  for (const cfg of configs) {
    if (deliveryId && alreadyTriggered.has(cfg.id)) {
      skipped.push(cfg.id);
      logger.info(
        { owner, repo, branch, configId: cfg.id, deliveryId },
        "Skipping duplicate auto-deploy for redelivered GitHub webhook",
      );
      continue;
    }

    try {
      const run = await startPipelineRun(cfg.id, "push", deliveryId);
      triggered.push(run.id);
      logger.info(
        { owner, repo, branch, configId: cfg.id, runId: run.id, deliveryId },
        "Auto-deploy triggered by GitHub push",
      );
    } catch (err) {
      // The (config_id, github_delivery_id) unique index guards against a race
      // where two copies of the same delivery arrive concurrently. A violation
      // means another request already started this run, so treat it as skipped.
      if (deliveryId && isUniqueViolation(err)) {
        skipped.push(cfg.id);
        logger.info(
          { owner, repo, branch, configId: cfg.id, deliveryId },
          "Concurrent duplicate delivery — run already created, skipping",
        );
        continue;
      }
      throw err;
    }
  }

  res.status(202).json({ ok: true, triggered, skipped });
});

export default router;
