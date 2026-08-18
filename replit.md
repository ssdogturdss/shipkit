# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- **Credential resolution precedence.** Each pipeline credential (githubToken, easToken, appStoreKeyId, appStoreIssuerId, appStorePrivateKey) is resolved per-field in this order: per-pipeline Replit Secret `SHIPKIT_PIPELINE_<configId>_<SUFFIX>` → global Replit Secret `SHIPKIT_<SUFFIX>` → encrypted value stored on the config row (database). This lets the most sensitive keys (e.g. the App Store `.p8`) live only in Secrets and never touch the database, while keeping multi-pipeline setups working. The `SHIPKIT_` prefix avoids collisions with common env vars like `GITHUB_TOKEN`. Suffixes: `GITHUB_TOKEN`, `EAS_TOKEN`, `APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID`, `APP_STORE_PRIVATE_KEY`. Logic lives in `artifacts/api-server/src/lib/credentialSecrets.ts`; applied in `decryptConfig` (pipeline.ts) and surfaced in the UI status via `sanitizeConfig` (routes/pipelineConfigs.ts).

- **Auto-deploy on GitHub push.** A pipeline with `autoDeployOnPush` enabled runs automatically when its configured branch receives a real push. GitHub hits `POST /api/webhooks/github` (`artifacts/api-server/src/routes/webhooks.ts`), which: (1) HMAC-SHA256-verifies `x-hub-signature-256` against the **`SHIPKIT_GITHUB_WEBHOOK_SECRET`** Replit Secret (a single shared secret for all pipelines; the route returns 503 if it is unset, so the feature is inert until configured); (2) ignores ShipKit's own sync marker commits (message prefix `chore: shipkit sync` or pushes touching only `.shipkit/sync.json`) to prevent self-triggering loops; (3) ignores branch deletions and non-branch refs; (4) matches enabled configs by owner/repo/branch and starts a run via `startPipelineRun(configId, "push")`. Raw request bytes for signature verification are captured by the `express.json` `verify` hook in `app.ts` (`req.rawBody`). Runs record their origin in `pipeline_runs.triggeredBy` (`manual` | `push`), shown in the dashboard Run History. **GitHub setup (one-time per repo):** Settings → Webhooks → Add webhook → Payload URL `https://<your-app>/api/webhooks/github`, Content type `application/json`, secret = the `SHIPKIT_GITHUB_WEBHOOK_SECRET` value, event = just the `push` event. The dashboard Settings page surfaces this URL and instructions when the toggle is on.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
