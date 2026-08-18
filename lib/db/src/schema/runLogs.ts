import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pipelineRunsTable, pipelineStageValues } from "./pipelineRuns";

export const logLevelValues = ["info", "warn", "error", "success"] as const;
export type LogLevel = (typeof logLevelValues)[number];

export const runLogsTable = pgTable("run_logs", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => pipelineRunsTable.id, { onDelete: "cascade" }),
  stage: text("stage").$type<(typeof pipelineStageValues)[number]>(),
  level: text("level").notNull().$type<LogLevel>().default("info"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRunLogSchema = createInsertSchema(runLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRunLog = z.infer<typeof insertRunLogSchema>;
export type RunLog = typeof runLogsTable.$inferSelect;
