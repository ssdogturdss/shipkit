import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pipelineConfigsRouter from "./pipelineConfigs";
import pipelineRunsRouter from "./pipelineRuns";
import runLogsRouter from "./runLogs";
import logStreamRouter from "./logStream";
import pipelineStatsRouter from "./pipelineStats";
import githubRouter from "./github";
import webhooksRouter from "./webhooks";
import uploadSourceRouter from "./uploadSource";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pipelineConfigsRouter);
router.use(pipelineRunsRouter);
router.use(logStreamRouter);
router.use(runLogsRouter);
router.use(pipelineStatsRouter);
router.use(githubRouter);
router.use(webhooksRouter);
router.use(uploadSourceRouter);

export default router;
