import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pipelineRunsTable, pipelineStageValues } from "./pipelineRuns";

export const stageStatusValues = ["pending", "running", "success", "failed", "skipped"] as const;
export type StageStatus = (typeof stageStatusValues)[number];

export const runStagesTable = pgTable("run_stages", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => pipelineRunsTable.id, { onDelete: "cascade" }),
  stageName: text("stage_name").notNull().$type<(typeof pipelineStageValues)[number]>(),
  status: text("status").notNull().$type<StageStatus>().default("pending"),
  externalUrl: text("external_url"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRunStageSchema = createInsertSchema(runStagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRunStage = z.infer<typeof insertRunStageSchema>;
export type RunStage = typeof runStagesTable.$inferSelect;
