# ─────────────────────────────────────────────────────────────────────────────
# ShipKit — Multi-stage production Dockerfile
#
# Builds the API server bundle AND the React dashboard static files.
# The final image runs Express which serves both the API and the frontend.
#
# Usage:
#   docker build -t shipkit .
#   docker run -p 5000:5000 --env-file .env shipkit
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: install all workspace dependencies ───────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy only manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

COPY lib/db/package.json               lib/db/
COPY lib/api-spec/package.json         lib/api-spec/
COPY lib/api-zod/package.json          lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json             artifacts/api-server/
COPY artifacts/pipeline-dashboard/package.json     artifacts/pipeline-dashboard/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build everything ─────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy all source
COPY lib/       lib/
COPY artifacts/api-server/      artifacts/api-server/
COPY artifacts/pipeline-dashboard/ artifacts/pipeline-dashboard/

# 1. Build composite libs (generates TypeScript declarations)
RUN pnpm run typecheck:libs

# 2. Build the API server (esbuild bundle → artifacts/api-server/dist/)
RUN pnpm --filter @workspace/api-server run build

# 3. Build the dashboard static files (Vite → artifacts/pipeline-dashboard/dist/)
RUN pnpm --filter @workspace/pipeline-dashboard run build

# ── Stage 3: production runtime ───────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app

# The esbuild bundle inlines all dependencies, so we only need the dist files.
# Pino spawns thread workers which ARE separate files — copy them all from dist/.
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Copy the built dashboard so the API server can serve it via STATIC_DIR.
COPY --from=builder /app/artifacts/pipeline-dashboard/dist ./dashboard-dist

# Create a writable directory for uploaded zip sources and EAS artifacts.
RUN mkdir -p /app/build-workspace

# Run as non-root
RUN addgroup -S shipkit && adduser -S shipkit -G shipkit \
    && chown -R shipkit:shipkit /app
USER shipkit

ENV NODE_ENV=production
ENV PORT=5000
ENV STATIC_DIR=/app/dashboard-dist
ENV SHIPKIT_BUILD_DIR=/app/build-workspace

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/healthz || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
