# ShipKit

A self-hosted iOS CI/CD pipeline that takes your Expo/React Native project from code to TestFlight automatically. Configure once, then trigger builds from the dashboard or on every GitHub push.

```
Code sync → EAS Build → App Store / TestFlight
```

**Tech stack:** Node.js 24 · TypeScript 5 · Express 5 · PostgreSQL · Drizzle ORM · React + Vite · pnpm workspaces

---

## Requirements

| Tool | Minimum version |
|------|----------------|
| Node.js | 24 |
| pnpm | 10 |
| PostgreSQL | 14 |
| Docker & Compose | 20 / 2.x (optional) |

---

## Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/shipkit.git
cd shipkit

# Install all workspace packages
pnpm install

# Create your environment file
cp .env.example .env
# → Edit .env and fill in required values (see Environment Variables below)
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure the following:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ENCRYPTION_KEY` | ✅ | 64-char hex key for encrypting stored credentials |
| `SESSION_SECRET` | ✅ | Random string for session signing |
| `PORT` | — | API server port (default: `5000`) |
| `SHIPKIT_BUILD_DIR` | — | Writable directory for build artifacts (default: `./build-workspace`) |
| `STATIC_DIR` | — | Path to pre-built frontend (Docker only — leave blank for dev) |
| `SHIPKIT_GITHUB_TOKEN` | — | GitHub PAT with `repo` scope (global fallback for all pipelines) |
| `SHIPKIT_GITHUB_WEBHOOK_SECRET` | — | Shared secret for the GitHub push webhook |
| `SHIPKIT_EAS_TOKEN` | — | EAS personal access token (global fallback) |
| `SHIPKIT_APP_STORE_KEY_ID` | — | App Store Connect API key ID (global fallback) |
| `SHIPKIT_APP_STORE_ISSUER_ID` | — | App Store Connect issuer ID (global fallback) |
| `SHIPKIT_APP_STORE_PRIVATE_KEY` | — | App Store Connect `.p8` key contents (global fallback) |

All credential variables can also be scoped to a single pipeline:
```
SHIPKIT_PIPELINE_<id>_GITHUB_TOKEN
SHIPKIT_PIPELINE_<id>_EAS_TOKEN
SHIPKIT_PIPELINE_<id>_APP_STORE_KEY_ID
# etc.
```
Per-pipeline values take precedence over global ones, which take precedence over values stored in the database.

Generate secure random keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Development

```bash
# 1. Set up the database schema
pnpm --filter @workspace/db run push

# 2. Start the API server (port 5000)
pnpm --filter @workspace/api-server run dev

# 3. In a separate terminal — start the React dashboard (hot reload)
pnpm --filter @workspace/pipeline-dashboard run dev
```

The dashboard proxies `/api` requests to the API server automatically via the Vite dev server.

### Regenerate API types after spec changes

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Production

### Build

```bash
# Type-check and build everything
pnpm run build

# Or individually:
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run build           # → artifacts/api-server/dist/
pnpm --filter @workspace/pipeline-dashboard run build  # → artifacts/pipeline-dashboard/dist/
```

### Run

```bash
# Set STATIC_DIR so the API server also serves the frontend
export STATIC_DIR=$(pwd)/artifacts/pipeline-dashboard/dist
export NODE_ENV=production
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Or use a process manager:
```bash
pm2 start "node --enable-source-maps artifacts/api-server/dist/index.mjs" \
  --name shipkit \
  --env production
```

---

## Docker

### Build and run

```bash
# Build the image
docker build -t shipkit .

# Run with environment variables
docker run -p 5000:5000 \
  -e DATABASE_URL=postgres://shipkit:pass@host.docker.internal:5432/shipkit \
  -e ENCRYPTION_KEY=<64-char-hex> \
  -e SESSION_SECRET=<random-string> \
  -v shipkit-builds:/app/build-workspace \
  shipkit
```

### Docker Compose (recommended)

Starts PostgreSQL + ShipKit in one command:

```bash
cp .env.example .env
# Edit .env — set ENCRYPTION_KEY, SESSION_SECRET, POSTGRES_PASSWORD at minimum

docker compose up --build
```

The application will be available at **http://localhost:5000**.

To apply database migrations in the Compose environment:

```bash
# Run once after first start (or after schema changes)
docker compose exec api sh -c \
  "cd /app && pnpm --filter @workspace/db run push"
```

> **Note:** For production Compose deployments, always set a strong `POSTGRES_PASSWORD` and pin the `ENCRYPTION_KEY` — data encrypted with one key cannot be decrypted with another.

---

## Database

ShipKit uses **PostgreSQL** with **Drizzle ORM**. The schema lives in `lib/db/src/schema/`.

```bash
# Apply schema changes (development — destructive-safe push)
pnpm --filter @workspace/db run push

# Inspect the Drizzle config
cat lib/db/drizzle.config.ts
```

The database stores pipeline configurations (encrypted credentials), run history, stage statuses, and log entries.

---

## Deployment on a VPS

### With nginx (recommended)

1. Install Node.js 24 and pnpm on your server.
2. Clone the repo, copy `.env.example` → `.env`, and configure it.
3. Run `pnpm install && pnpm run build`.
4. Set up a systemd service or PM2 to run the API server.
5. Copy `deploy/nginx.conf.example` to `/etc/nginx/sites-available/shipkit`, update the domain, and enable it.
6. Obtain a TLS certificate: `certbot --nginx -d your-domain.com`.

### With Docker Compose

Point your domain at the server, run `docker compose up -d --build`, then configure nginx/Caddy to proxy port 5000 (or expose Compose with `LETSENCRYPT_HOST` labels).

---

## Testing

```bash
# Full type-check
pnpm run typecheck

# Smoke-test the built API server
node --enable-source-maps artifacts/api-server/dist/index.mjs &
sleep 2
curl -f http://localhost:5000/api/healthz
```

CI runs automatically on every push via **GitHub Actions** (`.github/workflows/ci.yml`).

---

## Repository Structure

```
shipkit/
├── artifacts/
│   ├── api-server/          # Express API server (Node.js)
│   │   └── src/
│   │       ├── lib/         # Core pipeline logic, GitHub, crypto
│   │       └── routes/      # REST API routes
│   └── pipeline-dashboard/  # React + Vite frontend
├── lib/
│   ├── api-spec/            # OpenAPI spec + Orval codegen config
│   ├── api-client-react/    # Generated React Query hooks (from spec)
│   ├── api-zod/             # Generated Zod validators (from spec)
│   └── db/                  # Drizzle ORM schema + config
├── deploy/
│   └── nginx.conf.example   # Example nginx reverse-proxy config
├── .env.example             # Environment variable template
├── Dockerfile               # Production multi-stage build
├── docker-compose.yml       # Full stack (DB + app)
└── .github/workflows/ci.yml # GitHub Actions CI
```

---

## GitHub Sync vs. Uploaded Source

Each pipeline supports two source modes:

| Mode | Description |
|------|-------------|
| **GitHub Sync** (default) | Pushes a sync commit to the configured repo/branch before building |
| **Zip Upload** | Upload a `.zip` of your app source — GitHub sync is skipped entirely |

To use GitHub Sync outside Replit, set `SHIPKIT_GITHUB_TOKEN` to a Personal Access Token with `repo` scope.

---

## Troubleshooting

**`ENCRYPTION_KEY` / `SESSION_SECRET` not set**
The server will start but fail to encrypt/decrypt pipeline credentials. Always set both before storing real API keys.

**Database connection refused**
Check `DATABASE_URL` in `.env`. Ensure the PostgreSQL server is running and accessible from the API process. In Docker Compose, wait for the `db` health check to pass.

**Port already in use**
Change `PORT` in `.env`. Default is `5000`.

**Build fails on `pnpm install`**
Ensure Node.js ≥ 24 and pnpm ≥ 10 are installed. Run `corepack enable && corepack prepare pnpm@10 --activate` if pnpm is missing.

**EAS build fails with quota error**
Your Expo account's free monthly iOS build quota is exhausted. Upgrade at [expo.dev/accounts](https://expo.dev/accounts) or wait for the monthly reset.

**Zip upload: "No app.json found"**
Your zip must contain `app.json` (the Expo project config) either at the root or in a subdirectory. Zip the contents of your Expo project root, not a parent directory.

**GitHub sync: dry-run mode**
If no `SHIPKIT_GITHUB_TOKEN` is set and the Replit GitHub integration is unavailable, the sync stage runs in dry-run mode (no actual push). Configure a PAT to enable real GitHub sync.
