import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pipelineConfigsTable = pgTable("pipeline_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  githubOwner: text("github_owner").notNull(),
  githubRepo: text("github_repo").notNull(),
  githubBranch: text("github_branch").notNull().default("main"),
  githubToken: text("github_token"),
  easProjectSlug: text("eas_project_slug").notNull(),
  easToken: text("eas_token"),
  appStoreAppleId: text("app_store_apple_id").notNull(),
  appStoreBundleId: text("app_store_bundle_id"),
  appStoreKeyId: text("app_store_key_id"),
  appStoreIssuerId: text("app_store_issuer_id"),
  appStorePrivateKey: text("app_store_private_key"),
  appSourcePath: text("app_source_path"),
  sourceType: text("source_type").notNull().default("github"),
  uploadedSourcePath: text("uploaded_source_path"),
  notifyWebhookUrl: text("notify_webhook_url"),
  autoDeployOnPush: boolean("auto_deploy_on_push").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPipelineConfigSchema = createInsertSchema(pipelineConfigsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPipelineConfig = z.infer<typeof insertPipelineConfigSchema>;
export type PipelineConfig = typeof pipelineConfigsTable.$inferSelect;
