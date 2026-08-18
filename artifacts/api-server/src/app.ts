import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { existsSync } from "fs";
import { resolve, join } from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(
  express.json({
    // Stash the raw request bytes so the GitHub webhook route can verify the
    // HMAC signature, which must be computed over the exact payload received.
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Optionally serve a pre-built frontend from STATIC_DIR (used in Docker/production).
// In development the frontend runs on its own Vite dev server.
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  const dir = resolve(staticDir);
  if (existsSync(dir)) {
    app.use(express.static(dir));
    // SPA fallback — return index.html for any non-API path so client-side
    // routing works (e.g. /settings, /runs/:id).
    app.get("*", (_req, res, next) => {
      const index = join(dir, "index.html");
      if (existsSync(index)) {
        res.sendFile(index);
      } else {
        next();
      }
    });
    logger.info({ staticDir: dir }, "Serving static frontend");
  } else {
    logger.warn({ staticDir: dir }, "STATIC_DIR set but directory not found — skipping static serving");
  }
}

export default app;
