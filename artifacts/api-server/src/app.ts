import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Build allowed origins list from env.
// WEB_ORIGIN: primary frontend URL (e.g. https://your-app.vercel.app)
// WEB_ORIGIN_PREVIEW: optional Vercel preview URL pattern (comma-separated)
const allowedOrigins = (
  (process.env.WEB_ORIGIN ?? "") +
  "," +
  (process.env.WEB_ORIGIN_PREVIEW ?? "")
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

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
    // Allow requests from the configured frontend origins.
    // credentials: true requires an explicit origin (not '*').
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin) and health checks.
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, false);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Also allow *.vercel.app preview deployments when WEB_ORIGIN is set.
      if (
        process.env.WEB_ORIGIN &&
        /\.vercel\.app$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

export default app;
