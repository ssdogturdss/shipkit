import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pipelineConfigsTable } from "@workspace/db";
import {
  CreatePipelineConfigBody,
  UpdatePipelineConfigParams,
  UpdatePipelineConfigBody,
  GetPipelineConfigParams,
  DeletePipelineConfigParams,
  TestPipelineConnectionParams,
} from "@workspace/api-zod";
import { encryptSecretOrNull, decryptSecretOrNull } from "../lib/crypto";
import { cleanBearerToken, CredentialFormatError } from "../lib/secrets";
import { runConnectionTests } from "../lib/connectionTests";
import { hasCredentialSecret } from "../lib/credentialSecrets";

const router: IRouter = Router();

function sanitizeConfig(cfg: typeof pipelineConfigsTable.$inferSelect) {
  // A credential counts as present if it is saved on the row OR supplied via a
  // Replit Secret, so the UI status reflects whichever source is in effect.
  const hasGithubToken = !!cfg.githubToken || hasCredentialSecret(cfg.id, "githubToken");
  const hasEasToken = !!cfg.easToken || hasCredentialSecret(cfg.id, "easToken");
  const hasAppStoreKeyId = !!cfg.appStoreKeyId || hasCredentialSecret(cfg.id, "appStoreKeyId");
  const hasAppStoreIssuerId = !!cfg.appStoreIssuerId || hasCredentialSecret(cfg.id, "appStoreIssuerId");
  const hasAppStorePrivateKey = !!cfg.appStorePrivateKey || hasCredentialSecret(cfg.id, "appStorePrivateKey");
  return {
    id: cfg.id,
    name: cfg.name,
    githubOwner: cfg.githubOwner,
    githubRepo: cfg.githubRepo,
    githubBranch: cfg.githubBranch,
    easProjectSlug: cfg.easProjectSlug,
    appStoreAppleId: cfg.appStoreAppleId,
    appStoreBundleId: cfg.appStoreBundleId,
    notifyWebhookUrl: cfg.notifyWebhookUrl,
    autoDeployOnPush: cfg.autoDeployOnPush,
    sourceType: (cfg.sourceType ?? "github") as "github" | "upload",
    hasUploadedSource: !!cfg.uploadedSourcePath,
    hasGithubToken,
    hasEasToken,
    hasAppStoreKey: hasAppStoreKeyId && hasAppStoreIssuerId && hasAppStorePrivateKey,
    createdAt: cfg.createdAt.toISOString(),
    updatedAt: cfg.updatedAt.toISOString(),
  };
}

router.get("/pipeline-configs", async (_req, res): Promise<void> => {
  const configs = await db.select().from(pipelineConfigsTable).orderBy(pipelineConfigsTable.createdAt);
  res.json(configs.map(sanitizeConfig));
});

router.post("/pipeline-configs", async (req, res): Promise<void> => {
  const parsed = CreatePipelineConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { githubToken, easToken, appStoreKeyId, appStoreIssuerId, appStorePrivateKey, appStoreBundleId, notifyWebhookUrl, ...rest } = parsed.data;

  try {
    const [cfg] = await db.insert(pipelineConfigsTable).values({
      ...rest,
      githubToken: encryptSecretOrNull(cleanBearerToken(githubToken, "GitHub token")),
      easToken: encryptSecretOrNull(cleanBearerToken(easToken, "EAS access token")),
      appStoreKeyId: encryptSecretOrNull(cleanBearerToken(appStoreKeyId, "App Store Key ID")),
      appStoreIssuerId: encryptSecretOrNull(cleanBearerToken(appStoreIssuerId, "App Store Issuer ID")),
      appStorePrivateKey: encryptSecretOrNull(appStorePrivateKey?.trim() ? appStorePrivateKey.trim() : null),
      appStoreBundleId: appStoreBundleId ?? null,
      notifyWebhookUrl: notifyWebhookUrl?.trim() ? notifyWebhookUrl.trim() : null,
    }).returning();
    res.status(201).json(sanitizeConfig(cfg));
  } catch (err) {
    if (err instanceof CredentialFormatError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.get("/pipeline-configs/:id", async (req, res): Promise<void> => {
  const params = GetPipelineConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cfg] = await db.select().from(pipelineConfigsTable).where(eq(pipelineConfigsTable.id, params.data.id));
  if (!cfg) {
    res.status(404).json({ error: "Pipeline config not found" });
    return;
  }

  res.json(sanitizeConfig(cfg));
});

router.patch("/pipeline-configs/:id", async (req, res): Promise<void> => {
  const params = UpdatePipelineConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePipelineConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  const d = parsed.data;
  try {
    if (d.name !== undefined) updateData.name = d.name;
    if (d.githubOwner !== undefined) updateData.githubOwner = d.githubOwner;
    if (d.githubRepo !== undefined) updateData.githubRepo = d.githubRepo;
    if (d.githubBranch !== undefined) updateData.githubBranch = d.githubBranch;
    if (d.githubToken !== undefined) updateData.githubToken = encryptSecretOrNull(cleanBearerToken(d.githubToken, "GitHub token"));
    if (d.easProjectSlug !== undefined) updateData.easProjectSlug = d.easProjectSlug;
    if (d.easToken !== undefined) updateData.easToken = encryptSecretOrNull(cleanBearerToken(d.easToken, "EAS access token"));
    if (d.appStoreAppleId !== undefined) updateData.appStoreAppleId = d.appStoreAppleId;
    if (d.appStoreBundleId !== undefined) updateData.appStoreBundleId = d.appStoreBundleId;
    if (d.notifyWebhookUrl !== undefined) updateData.notifyWebhookUrl = d.notifyWebhookUrl?.trim() ? d.notifyWebhookUrl.trim() : null;
    if (d.autoDeployOnPush !== undefined) updateData.autoDeployOnPush = d.autoDeployOnPush;
    if (d.appStoreKeyId !== undefined) updateData.appStoreKeyId = encryptSecretOrNull(cleanBearerToken(d.appStoreKeyId, "App Store Key ID"));
    if (d.appStoreIssuerId !== undefined) updateData.appStoreIssuerId = encryptSecretOrNull(cleanBearerToken(d.appStoreIssuerId, "App Store Issuer ID"));
    if (d.appStorePrivateKey !== undefined) updateData.appStorePrivateKey = encryptSecretOrNull(d.appStorePrivateKey?.trim() ? d.appStorePrivateKey.trim() : null);
  } catch (err) {
    if (err instanceof CredentialFormatError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const [cfg] = await db
    .update(pipelineConfigsTable)
    .set(updateData)
    .where(eq(pipelineConfigsTable.id, params.data.id))
    .returning();

  if (!cfg) {
    res.status(404).json({ error: "Pipeline config not found" });
    return;
  }

  res.json(sanitizeConfig(cfg));
});

router.delete("/pipeline-configs/:id", async (req, res): Promise<void> => {
  const params = DeletePipelineConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cfg] = await db.delete(pipelineConfigsTable).where(eq(pipelineConfigsTable.id, params.data.id)).returning();
  if (!cfg) {
    res.status(404).json({ error: "Pipeline config not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/pipeline-configs/:id/test-connection", async (req, res): Promise<void> => {
  const params = TestPipelineConnectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cfg] = await db.select().from(pipelineConfigsTable).where(eq(pipelineConfigsTable.id, params.data.id));
  if (!cfg) {
    res.status(404).json({ error: "Pipeline config not found" });
    return;
  }

  const results = await runConnectionTests(cfg);
  res.json({ results });
});

export default router;

export { sanitizeConfig };
