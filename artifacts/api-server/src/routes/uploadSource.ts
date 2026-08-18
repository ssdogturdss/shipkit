import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import unzipper from "unzipper";
import fs from "fs";
import path from "path";
import { db, pipelineConfigsTable } from "@workspace/db";
import { GetPipelineConfigParams } from "@workspace/api-zod";
import { sanitizeConfig } from "./pipelineConfigs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const UPLOADS_BASE = path.resolve(
  process.env.SHIPKIT_BUILD_DIR
    ? path.join(process.env.SHIPKIT_BUILD_DIR, "uploads")
    : path.join(process.cwd(), "build-workspace", "uploads"),
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.originalname.endsWith(".zip");
    if (!ok) {
      cb(new Error("Only .zip files are accepted"));
    } else {
      cb(null, true);
    }
  },
});

/** POST /pipeline-configs/:id/upload-source */
router.post(
  "/pipeline-configs/:id/upload-source",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const params = GetPipelineConfigParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Send a multipart/form-data request with a 'file' field containing a .zip." });
      return;
    }

    const configId = params.data.id;
    const [cfg] = await db
      .select()
      .from(pipelineConfigsTable)
      .where(eq(pipelineConfigsTable.id, configId));

    if (!cfg) {
      res.status(404).json({ error: "Pipeline config not found" });
      return;
    }

    // Extract zip to .rci-build/uploads/<configId>/
    const extractDir = path.join(UPLOADS_BASE, String(configId));
    try {
      // Remove old extraction if present
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });

      // Extract from the in-memory buffer
      const zipBuffer = req.file.buffer;
      const directory = await unzipper.Open.buffer(zipBuffer);
      await directory.extract({ path: extractDir });

      // Count extracted files
      const fileCount = directory.files.filter((f) => !f.path.endsWith("/")).length;

      // Find the Expo app root (directory containing app.json)
      const appJsonPath = findFile(extractDir, "app.json");
      if (!appJsonPath) {
        fs.rmSync(extractDir, { recursive: true, force: true });
        res.status(400).json({
          error:
            "No app.json found in the uploaded zip. Make sure your zip contains the Expo app root (with app.json at the top level or in a subdirectory).",
        });
        return;
      }

      const appRoot = path.dirname(appJsonPath);
      logger.info({ configId, appRoot, fileCount }, "Zip extracted");

      // Update DB
      const [updated] = await db
        .update(pipelineConfigsTable)
        .set({
          sourceType: "upload",
          uploadedSourcePath: extractDir,
          appSourcePath: appRoot,
        })
        .where(eq(pipelineConfigsTable.id, configId))
        .returning();

      res.json({
        config: sanitizeConfig(updated),
        extractedPath: appRoot,
        fileCount,
      });
    } catch (err) {
      logger.error({ err, configId }, "Zip extraction failed");
      // Clean up on error
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to extract zip",
      });
    }
  },
);

/** DELETE /pipeline-configs/:id/upload-source — revert to GitHub sync */
router.delete(
  "/pipeline-configs/:id/upload-source",
  async (req, res): Promise<void> => {
    const params = GetPipelineConfigParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const configId = params.data.id;
    const [cfg] = await db
      .select()
      .from(pipelineConfigsTable)
      .where(eq(pipelineConfigsTable.id, configId));

    if (!cfg) {
      res.status(404).json({ error: "Pipeline config not found" });
      return;
    }

    // Remove extracted directory if present
    const extractDir = path.join(UPLOADS_BASE, String(configId));
    try {
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
    } catch (err) {
      logger.warn({ err, configId }, "Could not remove upload dir");
    }

    const [updated] = await db
      .update(pipelineConfigsTable)
      .set({
        sourceType: "github",
        uploadedSourcePath: null,
        // Keep appSourcePath untouched — it may be set from a previous config
        // but the pipeline will use GitHub sync, so it won't be read for source.
      })
      .where(eq(pipelineConfigsTable.id, configId))
      .returning();

    res.json(sanitizeConfig(updated));
  },
);

/** Recursively find the first file matching `name` under `dir`. */
function findFile(dir: string, name: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === name) return path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path.join(dir, entry.name), name);
      if (found) return found;
    }
  }
  return null;
}

export default router;
