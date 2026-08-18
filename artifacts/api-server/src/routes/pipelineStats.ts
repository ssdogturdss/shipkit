import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, pipelineRunsTable, pipelineConfigsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/pipeline-stats", async (_req, res): Promise<void> => {
  const runs = await db.select().from(pipelineRunsTable).orderBy(desc(pipelineRunsTable.createdAt));

  const totalRuns = runs.length;
  const successfulRuns = runs.filter((r) => r.status === "success").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const runningRuns = runs.filter((r) => r.status === "running" || r.status === "pending").length;
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
  const lastRunAt = runs[0]?.createdAt?.toISOString() ?? null;

  const recentRuns = runs.slice(0, 5);
  const configIds = [...new Set(recentRuns.map((r) => r.configId))];
  const configs = configIds.length > 0
    ? await db.select().from(pipelineConfigsTable).then((c) => c.filter((cfg) => configIds.includes(cfg.id)))
    : [];
  const configMap = new Map(configs.map((c) => [c.id, c.name]));

  res.json({
    totalRuns,
    successfulRuns,
    failedRuns,
    runningRuns,
    successRate,
    lastRunAt,
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      configId: r.configId,
      configName: configMap.get(r.configId) ?? "",
      status: r.status,
      currentStage: r.currentStage ?? null,
      errorMessage: r.errorMessage ?? null,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
});

export default router;
