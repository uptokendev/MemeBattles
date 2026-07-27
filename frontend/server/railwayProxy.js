const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const EXACT_RAILWAY_PATHS = new Set([]);
const DEV_ALLOWED_IPS = new Set(
  String(process.env.DEV_ALLOWED_IPS || "185.184.192.242")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function isDevAllowedIP(req) {
  if (DEV_ALLOWED_IPS.size === 0) return false;
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.ip || req.socket?.remoteAddress || "";
  const clean = ip.replace(/^::ffff:/, "");
  return DEV_ALLOWED_IPS.has(ip) || DEV_ALLOWED_IPS.has(clean);
}

console.log(`[railway-proxy] DEV_ALLOWED_IPS loaded: ${Array.from(DEV_ALLOWED_IPS).join(", ") || "(none)"}`);

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
  "/api/solana/recruiter-signup",
  "/api/routing",
  "/api/shareCard",
  "/api/status",
  "/api/token/",
  "/api/token-metadata",
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
  } catch {}
  path = path.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "") || "/";
  if (prefixApiWhenMissing && !path.startsWith("/api") && !path.startsWith("/internal")) {
    path = `/api${path.startsWith("/") ? path : `/${path}`}`;
  }
  return path;
}

function proxyPathname(path) {
  try {
    return new URL(path, "http://localhost").pathname;
  } catch {
    return String(path || "").split("?")[0] || "/";
  }
}

export function shouldHandleLocally(path) {
  const pathname = proxyPathname(path);

  return (
    /^\/api\/dashboard\/promotors(?:\/|$)/.test(pathname) ||
    /\/upload(?:$|\/)/.test(pathname) ||
    pathname === "/api/auth/nonce" ||
    /^\/api\/drafts(?:\/|$)/.test(pathname) ||
    pathname === "/api/campaigns" ||
    pathname === "/api/featured"
  );
}

async function dispatchDashboardPromotors(pathname, req, res) {
  if (!/^\/api\/dashboard\/promotors(?:\/|$)/.test(pathname)) return false;

  const {
    dashboardPromotors,
    dashboardPromotorRefresh,
    dashboardPromotorsRefreshAll,
  } = await import("../api/dashboard/promotors.js");

  const refreshAllMatch = pathname === "/api/dashboard/promotors/refresh-all";
  const itemMatch = pathname.match(/^\/api\/dashboard\/promotors\/([0-9a-f-]+)$/i);
  const refreshMatch = pathname.match(/^\/api\/dashboard\/promotors\/([0-9a-f-]+)\/refresh$/i);

  if (refreshAllMatch) {
    await dashboardPromotorsRefreshAll(req, res);
    return true;
  }
  if (refreshMatch) {
    req.params = { ...(req.params || {}), id: refreshMatch[1] };
    await dashboardPromotorRefresh(req, res);
    return true;
  }
  if (itemMatch) {
    req.params = { ...(req.params || {}), id: itemMatch[1] };
    await dashboardPromotors(req, res);
    return true;
  }
  if (pathname === "/api/dashboard/promotors") {
    await dashboardPromotors(req, res);
    return true;
  }

  res.status(404).json({ ok: false, error: "Unknown dashboard promoter route." });
  return true;
}

function shouldProxyToRailway(path) {
  const pathname = proxyPathname(path);

  if (EXACT_RAILWAY_PATHS.has(pathname)) return true;
  if (shouldHandleLocally(pathname)) return false;

  return RAILWAY_PATH_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) return pathname.startsWith(prefix);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function copyRequestHeaders(req, hasBody) {
  const headers = {};
  const passthrough = ["authorization", "content-type", "x-diagnostics-token", "x-rank-events-token"];
  for (const name of passthrough) {
    const value = req.headers?.[name];
    if (!value) continue;
    if (name === "content-type" && !hasBody) continue;
    headers[name] = Array.isArray(value) ? value.join(",") : String(value);
  }
  if (hasBody && !headers["content-type"]) headers["content-type"] = "application/json";
  return headers;
}

function responseLabel(serviceName, path) {
  return `[railway-proxy:${serviceName}] ${path}`;
}

export function createRailwayProxyMiddleware(options = {}) {
  const { prefixApiWhenMissing = false, serviceName = "api" } = options;

  return async function railwayProxyMiddleware(req, res, next) {
    const path = normalizeProxyPath(req, { prefixApiWhenMissing });
    const pathname = proxyPathname(path);

    if (await dispatchDashboardPromotors(pathname, req, res)) return;
    if (!railwayProxyEnabled()) return next();
    if (shouldHandleLocally(path)) return next();

    const isDevIP = isDevAllowedIP(req);
    if (!isDevIP && !shouldProxyToRailway(path)) return next();

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
      res.setHeader("content-type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
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
