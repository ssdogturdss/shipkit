import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, pipelineRunsTable, runStagesTable, pipelineConfigsTable } from "@workspace/db";
import {
  TriggerPipelineRunBody,
  GetPipelineRunParams,
  ListPipelineRunsQueryParams,
  RetryPipelineStageParams,
} from "@workspace/api-zod";
import { retryStageFromPoint, startPipelineRun } from "../lib/pipeline";
import type { PipelineStage } from "@workspace/db";

const router: IRouter = Router();

function formatRun(run: typeof pipelineRunsTable.$inferSelect, configName?: string) {
  return {
    id: run.id,
    configId: run.configId,
    configName: configName ?? "",
    status: run.status,
    triggeredBy: run.triggeredBy,
    currentStage: run.currentStage ?? null,
    errorMessage: run.errorMessage ?? null,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function formatStage(stage: typeof runStagesTable.$inferSelect) {
  return {
    id: stage.id,
    runId: stage.runId,
    stageName: stage.stageName,
    status: stage.status,
    externalUrl: stage.externalUrl ?? null,
    startedAt: stage.startedAt?.toISOString() ?? null,
    completedAt: stage.completedAt?.toISOString() ?? null,
    createdAt: stage.createdAt.toISOString(),
    updatedAt: stage.updatedAt.toISOString(),
  };
}

router.get("/pipeline-runs", async (req, res): Promise<void> => {
  const query = ListPipelineRunsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { configId, limit } = query.data;

  let runsQuery = db
    .select()
    .from(pipelineRunsTable)
    .orderBy(desc(pipelineRunsTable.createdAt));

  const runs = configId
    ? await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.configId, configId)).orderBy(desc(pipelineRunsTable.createdAt))
    : await db.select().from(pipelineRunsTable).orderBy(desc(pipelineRunsTable.createdAt));

  void runsQuery;

  const sliced = limit ? runs.slice(0, limit) : runs;

  const configIds = [...new Set(sliced.map((r) => r.configId))];
  const configs = configIds.length > 0
    ? await db.select().from(pipelineConfigsTable).then((c) => c.filter((cfg) => configIds.includes(cfg.id)))
    : [];
  const configMap = new Map(configs.map((c) => [c.id, c.name]));

  res.json(sliced.map((r) => formatRun(r, configMap.get(r.configId))));
});

router.post("/pipeline-runs", async (req, res): Promise<void> => {
  const parsed = TriggerPipelineRunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [config] = await db
    .select()
    .from(pipelineConfigsTable)
    .where(eq(pipelineConfigsTable.id, parsed.data.configId));

  if (!config) {
    res.status(404).json({ error: "Pipeline config not found" });
    return;
  }

  const run = await startPipelineRun(config.id, "manual");

  res.status(201).json(formatRun(run, config.name));
});

router.get("/pipeline-runs/:id", async (req, res): Promise<void> => {
  const params = GetPipelineRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [run] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, params.data.id));
  if (!run) {
    res.status(404).json({ error: "Pipeline run not found" });
    return;
  }

  const stages = await db.select().from(runStagesTable).where(eq(runStagesTable.runId, run.id)).orderBy(runStagesTable.id);
  const [config] = await db.select().from(pipelineConfigsTable).where(eq(pipelineConfigsTable.id, run.configId));

  res.json({
    ...formatRun(run, config?.name),
    stages: stages.map(formatStage),
  });
});

router.post("/pipeline-runs/:id/stages/:stage/retry", async (req, res): Promise<void> => {
  const params = RetryPipelineStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [run] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, params.data.id));
  if (!run) {
    res.status(404).json({ error: "Pipeline run not found" });
    return;
  }

  const stage = params.data.stage as PipelineStage;
  const stages = await db.select().from(runStagesTable).where(eq(runStagesTable.runId, run.id)).orderBy(runStagesTable.id);
  const [config] = await db.select().from(pipelineConfigsTable).where(eq(pipelineConfigsTable.id, run.configId));

  await db
    .update(pipelineRunsTable)
    .set({ status: "pending", currentStage: stage, updatedAt: new Date() })
    .where(eq(pipelineRunsTable.id, run.id));

  const stageOrder: PipelineStage[] = ["sync", "build", "submit"];
  const retryIdx = stageOrder.indexOf(stage);
  const stagesToReset = stageOrder.slice(retryIdx);
  for (const s of stagesToReset) {
    await db
      .update(runStagesTable)
      .set({ status: "pending", startedAt: null, completedAt: null, updatedAt: new Date() })
      .where(and(eq(runStagesTable.runId, run.id), eq(runStagesTable.stageName, s)));
  }

  setImmediate(() => {
    retryStageFromPoint(run.id, stage).catch((err) => {
      req.log.error({ err, runId: run.id }, "Pipeline retry error");
    });
  });

  const [freshRun] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, run.id));
  const freshStages = await db.select().from(runStagesTable).where(eq(runStagesTable.runId, run.id)).orderBy(runStagesTable.id);

  res.json({
    ...formatRun(freshRun ?? run, config?.name),
    stages: freshStages.map(formatStage),
  });
});

export default router;
