import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

/**
 * Allowed frontend origins.
 *
 * WEB_ORIGIN         primary frontend URL, e.g. https://your-app.vercel.app
 * WEB_ORIGIN_PREVIEW extra origins, comma-separated. Entries may contain `*`
 *                    to match one host segment, e.g.
 *                    https://*-your-app.vercel.app for preview deployments.
 *
 * A bare `*.vercel.app` style wildcard is deliberately NOT accepted by
 * default: cookies are SameSite=None + credentials:include, so allowing every
 * *.vercel.app origin would let any unrelated Vercel deployment read
 * authenticated responses from this API.
 */
function parseOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Exact match, or wildcard match where `*` matches any run of characters that
 * does not cross a `/` boundary. That keeps `https://*.vercel.app` scoped to
 * a single host label.
 */
function matchesOrigin(origin: string, pattern: string): boolean {
  if (!pattern.includes("*")) return origin === pattern;
  const source = pattern
    .split("*")
    .map(escapeRegExp)
    .join("[^/]*");
  return new RegExp(`^${source}$`).test(origin);
}

const isProduction = process.env.NODE_ENV === "production";
const configuredOrigins = [
  ...parseOrigins(process.env.WEB_ORIGIN),
  ...parseOrigins(process.env.WEB_ORIGIN_PREVIEW),
];

const LOCAL_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

// In production an unset WEB_ORIGIN is a misconfiguration, so fail loudly
// instead of silently rejecting every browser request.
const allowedOrigins =
  configuredOrigins.length > 0
    ? configuredOrigins
    : isProduction
      ? []
      : LOCAL_ORIGINS;

if (allowedOrigins.length === 0) {
  logger.error(
    "CORS: WEB_ORIGIN is not set, so every browser request will be blocked. " +
      "Set WEB_ORIGIN to the frontend origin (e.g. https://your-app.vercel.app).",
  );
}

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
app.use(
  cors({
    // credentials: true requires an explicit origin (never '*').
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) and health checks.
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((pattern) => matchesOrigin(origin, pattern))) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

export default app;
