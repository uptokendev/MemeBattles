import express from "express";

import { createRailwayProxyMiddleware } from "../server/railwayProxy.js";

const app = express();
app.disable("x-powered-by");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:8888",
  "https://memewar.zone",
  "https://www.memewar.zone",
  "https://memewarzone.netlify.app",
  "https://command-center.memewar.zone",
];

const allowedOrigins = new Set(
  DEFAULT_ALLOWED_ORIGINS.concat(
    String(process.env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    const host = hostname.toLowerCase();
    if (host === "memewar.zone" || host === "www.memewar.zone" || host.endsWith(".memewar.zone")) return true;
    if (host.endsWith(".netlify.app")) return true;
  } catch {}
  return false;
}

app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, x-diagnostics-token, x-rank-events-token, x-war-missions-internal-token",
    );
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/", (_req, res) => res.json({ ok: true, service: "MemeWarzone devpostgrad API gateway", healthz: "/healthz", api: "/api" }));
app.get("/healthz", (_req, res) => res.json({ ok: true, mode: "dev-api-proxy" }));
app.get("/health", (_req, res) => res.json({ ok: true, mode: "dev-api-proxy" }));

app.use(express.json({ limit: process.env.API_JSON_LIMIT || "2mb" }));
app.use(express.urlencoded({ extended: false, limit: process.env.API_FORM_LIMIT || "2mb" }));
app.use(createRailwayProxyMiddleware({ serviceName: "dev-api-gateway" }));

app.use((req, res) => {
  res.status(404).json({
    error: `Unknown local devpostgrad route: ${req.path}`,
    hint: "devpostgrad does not host the live API. Enable API_RAILWAY_PROXY and set RAILWAY_API_BASE_URL to use the dev branch API.",
  });
});

app.use((err, _req, res, _next) => {
  console.error("[api/server] unhandled", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Server error" });
});

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
app.listen(port, "0.0.0.0", () => console.log(`[api/server] devpostgrad API gateway listening on 0.0.0.0:${port}`));
