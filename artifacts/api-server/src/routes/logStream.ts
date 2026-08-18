import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pipelineRunsTable, runLogsTable } from "@workspace/db";

const router: IRouter = Router();

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled"]);

/**
 * SSE endpoint: GET /api/pipeline-runs/:id/logs/stream
 * Streams log lines as server-sent events in real time.
 * Closes the stream when the run reaches a terminal state.
 */
router.get("/pipeline-runs/:id/logs/stream", async (req, res): Promise<void> => {
  const runId = parseInt(req.params.id ?? "0", 10);
  if (!runId) {
    res.status(400).json({ error: "Invalid run id" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let lastId = 0;
  let closed = false;

  req.on("close", () => { closed = true; });

  const send = (data: unknown) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send all existing logs first
  const existingLogs = await db
    .select()
    .from(runLogsTable)
    .where(eq(runLogsTable.runId, runId))
    .orderBy(runLogsTable.id);

  for (const log of existingLogs) {
    send({
      id: log.id,
      runId: log.runId,
      stage: log.stage ?? null,
      level: log.level,
      message: log.message,
      createdAt: log.createdAt.toISOString(),
    });
    lastId = log.id;
  }

  // Check if already terminal — close immediately after sending existing logs
  const [runCheck] = await db
    .select({ status: pipelineRunsTable.status })
    .from(pipelineRunsTable)
    .where(eq(pipelineRunsTable.id, runId));

  if (!runCheck || TERMINAL_STATUSES.has(runCheck.status)) {
    send({ type: "done", status: runCheck?.status ?? "not_found" });
    res.end();
    return;
  }

  // Poll every second for new logs
  const interval = setInterval(async () => {
    if (closed) {
      clearInterval(interval);
      return;
    }

    try {
      const [run] = await db
        .select({ status: pipelineRunsTable.status })
        .from(pipelineRunsTable)
        .where(eq(pipelineRunsTable.id, runId));

      const allLogs = await db
        .select()
        .from(runLogsTable)
        .where(eq(runLogsTable.runId, runId))
        .orderBy(runLogsTable.id);

      const newLogs = allLogs.filter((r) => r.id > lastId);
      for (const log of newLogs) {
        send({
          id: log.id,
          runId: log.runId,
          stage: log.stage ?? null,
          level: log.level,
          message: log.message,
          createdAt: log.createdAt.toISOString(),
        });
        lastId = log.id;
      }

      if (!run || TERMINAL_STATUSES.has(run.status)) {
        send({ type: "done", status: run?.status ?? "unknown" });
        clearInterval(interval);
        if (!closed) res.end();
      }
    } catch {
      clearInterval(interval);
      if (!closed) res.end();
    }
  }, 1000);
});

export default router;
