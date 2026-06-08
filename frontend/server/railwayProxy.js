const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const EXACT_RAILWAY_PATHS = new Set([]);

const RAILWAY_PATH_PREFIXES = [
  "/api/ably",
  "/api/activity",
  "/api/auth",
  "/api/campaigns",
  "/api/comments",
  "/api/chat",
  "/api/diagnostics",
  "/api/drafts",
  "/api/epochPools",
  "/api/featured",
  "/api/follows",
  "/api/league",
  "/api/leaguePayouts",
  "/api/leagueRoot",
  "/api/prepare",
  "/api/prepare-notifications",
  "/api/profile",
  "/api/profileCabinet",
  "/api/rewards",
  "/api/airdrops",
  "/api/squads",
  "/api/recruiters",
  "/api/recruiter-auth",
  "/api/recruiter-logout",
  "/api/recruiter-portal",
  "/api/recruiter-routing",
  "/api/recruiter-signup",
  "/api/routing",
  "/api/shareCard",
  "/api/status",
  "/api/token/",
  "/api/token-metadata",
  // "/api/upload" is intentionally NOT proxied here (see shouldProxyToRailway) because
  // multipart/form-data bodies cannot be correctly forwarded by the current JSON-body
  // reconstruction logic. Uploads are always handled by a process that has the raw
  // request stream + Supabase credentials mounted directly.
  "/api/votes",
  "/api/vote_counts",
  "/internal/",
];

const FALLBACK_STATUSES = new Set([404, 405]);

function truthy(value) {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

function railwayProxyEnabled() {
  return truthy(process.env.API_RAILWAY_PROXY || process.env.RAILWAY_API_PROXY || process.env.VITE_API_RAILWAY_PROXY);
}

function railwayProxyStrict() {
  return truthy(process.env.API_RAILWAY_PROXY_STRICT || process.env.RAILWAY_API_PROXY_STRICT);
}

function railwayBaseUrl() {
  const raw = String(
    process.env.RAILWAY_API_BASE_URL ||
      process.env.RAILWAY_INDEXER_URL ||
      process.env.VITE_REALTIME_API_BASE ||
      ""
  ).trim();

  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

function normalizeProxyPath(req, { prefixApiWhenMissing = false } = {}) {
  const raw = String(req.originalUrl || req.url || "/");
  let path = raw;

  try {
    path = new URL(raw).pathname + new URL(raw).search;
  } catch {
    // raw is already a relative URL/path.
  }

  path = path.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "") || "/";

  if (prefixApiWhenMissing && !path.startsWith("/api") && !path.startsWith("/internal")) {
    path = `/api${path.startsWith("/") ? path : `/${path}`}`;
  }

  return path;
}

function shouldProxyToRailway(path) {
  let pathname = path;
  try {
    pathname = new URL(path, "http://localhost").pathname;
  } catch {
    pathname = String(path || "").split("?")[0] || "/";
  }

  if (EXACT_RAILWAY_PATHS.has(pathname)) return true;

  // /api/upload uses multipart/form-data + formidable. The current proxy
  // implementation rewrites bodies as JSON (from req.body) and cannot forward
  // the original upload stream. Always let the locally-mounted upload handler
  // (which has direct access to Supabase keys + formidable) serve it.
  if (/\/upload(?:$|\/|\?)/.test(pathname)) return false;

  return RAILWAY_PATH_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) return pathname.startsWith(prefix);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function copyRequestHeaders(req, hasBody) {
  const headers = {};
  const passthrough = [
    "authorization",
    "content-type",
    "x-diagnostics-token",
    "x-rank-events-token",
  ];

  for (const name of passthrough) {
    const value = req.headers?.[name];
    if (!value) continue;
    if (name === "content-type" && !hasBody) continue;
    headers[name] = Array.isArray(value) ? value.join(",") : String(value);
  }

  if (hasBody && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

function responseLabel(serviceName, path) {
  return `[railway-proxy:${serviceName}] ${path}`;
}

export function createRailwayProxyMiddleware(options = {}) {
  const {
    prefixApiWhenMissing = false,
    serviceName = "api",
  } = options;

  return async function railwayProxyMiddleware(req, res, next) {
    if (!railwayProxyEnabled()) return next();

    const path = normalizeProxyPath(req, { prefixApiWhenMissing });
    if (!shouldProxyToRailway(path)) return next();

    const base = railwayBaseUrl();
    if (!base) {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: "Railway API proxy is enabled, but no Railway API base URL is configured.",
        code: "RAILWAY_API_BASE_URL_MISSING",
        expectedEnv: "Set RAILWAY_API_BASE_URL or RAILWAY_INDEXER_URL.",
      }));
      return;
    }

    const target = `${base}${path}`;
    const method = String(req.method || "GET").toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method);
    const body = hasBody ? JSON.stringify(req.body ?? {}) : undefined;

    try {
      const upstream = await fetch(target, {
        method,
        headers: copyRequestHeaders(req, hasBody),
        body,
        redirect: "manual",
      });

      if (!railwayProxyStrict() && FALLBACK_STATUSES.has(upstream.status)) {
        console.warn(`${responseLabel(serviceName, path)} upstream ${upstream.status}; falling back to local handler`);
        return next();
      }

      const text = await upstream.text();
      res.statusCode = upstream.status;

      const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
      res.setHeader("content-type", contentType);
      res.setHeader("x-mwz-api-upstream", "railway");
      res.setHeader("x-mwz-api-upstream-path", path);

      res.end(text);
    } catch (err) {
      if (!railwayProxyStrict()) {
        console.warn(`${responseLabel(serviceName, path)} upstream failed; falling back to local handler`, err?.message || err);
        return next();
      }

      console.error(responseLabel(serviceName, path), err);
      res.statusCode = 502;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: "Railway API upstream request failed.",
        code: "RAILWAY_API_UPSTREAM_FAILED",
        path,
        detail: err?.message || String(err),
      }));
    }
  };
}
