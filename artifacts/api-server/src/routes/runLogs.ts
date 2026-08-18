import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, runLogsTable } from "@workspace/db";
import { ListRunLogsParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/pipeline-runs/:id/logs", async (req, res): Promise<void> => {
  const params = ListRunLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const logs = await db
    .select()
    .from(runLogsTable)
    .where(eq(runLogsTable.runId, params.data.id))
    .orderBy(runLogsTable.id);

  res.json(
    logs.map((l) => ({
      id: l.id,
      runId: l.runId,
      stage: l.stage ?? null,
      level: l.level,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    })),
  );
});

export default router;
