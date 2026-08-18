import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pipelineConfigsTable } from "./pipelineConfigs";

export const pipelineRunStatusValues = ["pending", "running", "success", "failed", "cancelled"] as const;
export type PipelineRunStatus = (typeof pipelineRunStatusValues)[number];

export const pipelineStageValues = ["sync", "build", "submit"] as const;
export type PipelineStage = (typeof pipelineStageValues)[number];

export const pipelineRunTriggerValues = ["manual", "push"] as const;
export type PipelineRunTrigger = (typeof pipelineRunTriggerValues)[number];

export const pipelineRunsTable = pgTable(
  "pipeline_runs",
  {
    id: serial("id").primaryKey(),
    configId: integer("config_id").notNull().references(() => pipelineConfigsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().$type<PipelineRunStatus>().default("pending"),
    triggeredBy: text("triggered_by").notNull().$type<PipelineRunTrigger>().default("manual"),
    // GitHub's X-GitHub-Delivery id of the webhook that started this run. Used to
    // make push-triggered runs idempotent: a redelivered webhook (same id) must
    // not start a second deployment. Null for manual runs.
    githubDeliveryId: text("github_delivery_id"),
    currentStage: text("current_stage").$type<PipelineStage>(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    // One run per (config, delivery). Postgres treats NULLs as distinct, so
    // manual runs (null delivery id) are never blocked by this constraint.
    uniqueIndex("pipeline_runs_config_delivery_unique").on(table.configId, table.githubDeliveryId),
  ],
);

export const insertPipelineRunSchema = createInsertSchema(pipelineRunsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type PipelineRun = typeof pipelineRunsTable.$inferSelect;
