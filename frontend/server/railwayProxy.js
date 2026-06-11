const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const EXACT_RAILWAY_PATHS = new Set([]);
const TOKEN_INDEXER_PATH_PREFIXES = [
  "/api/ably/token",
  "/api/league",
  "/api/leaguePayouts",
  "/api/leagueRoot",
  "/api/token/",
  "/api/vote_counts",
  "/api/votes",
];

const FRONTEND_PRODUCT_PATH_PREFIXES = [
  "/api/ably",
  "/api/activity",
  "/api/airdrops",
  "/api/arena",
  "/api/attribution",
  "/api/auth",
  "/api/calendar",
  "/api/campaigns",
  "/api/chat",
  "/api/comments",
  "/api/content-ai",
  "/api/content-campaigns",
  "/api/content-tags",
  "/api/diagnostics",
  "/api/drafts",
  "/api/epochPools",
  "/api/featured",
  "/api/follows",
  "/api/internal",
  "/api/league",
  "/api/leaguePayouts",
  "/api/leagueRoot",
  "/api/posts",
  "/api/prepare",
  "/api/prepare-notifications",
  "/api/profile",
  "/api/profileCabinet",
  "/api/recruiter-auth",
  "/api/recruiter-logout",
  "/api/recruiter-portal",
  "/api/recruiter-routing",
  "/api/recruiter-signup",
  "/api/recruiters",
  "/api/rewards",
  "/api/routing",
  "/api/schedules",
  "/api/shareCard",
  "/api/social-x-callback",
  "/api/sponsored",
  "/api/sponsorship-applications",
  "/api/squads",
  "/api/status",
  "/api/token/",
  "/api/token-metadata",
  "/api/upload",
  "/api/variants",
  "/api/vote_counts",
  "/api/votes",
  "/api/war-room",
  "/api/wm-",
  "/internal/",
];

const RAILWAY_PATH_PREFIXES = [
  ...TOKEN_INDEXER_PATH_PREFIXES,
  ...FRONTEND_PRODUCT_PATH_PREFIXES,
];

const UPSTREAMS = {
  frontendProduct: {
    key: "frontend-product",
    label: "frontend/product",
    envNames: [
      "RAILWAY_FRONTEND_API_BASE_URL",
      "FRONTEND_RAILWAY_API_BASE_URL",
      "MEMEWARZONE_FRONTEND_API_BASE_URL",
      "RAILWAY_API_BASE_URL",
    ],
  },
  tokenIndexer: {
    key: "token-indexer",
    label: "token/indexer",
    envNames: [
      "RAILWAY_TOKEN_API_BASE_URL",
      "TOKEN_RAILWAY_API_BASE_URL",
      "RAILWAY_INDEXER_URL",
      "RAILWAY_API_BASE_URL",
    ],
  },
};

const FALLBACK_STATUSES = new Set([404, 405]);
const EMPTY_FEED_FALLBACK_PATHS = new Set(["/api/featured", "/api/war-room"]);

function truthy(value) {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

function explicitFalsy(value) {
  return FALSE_VALUES.has(String(value || "").trim().toLowerCase());
}

function firstConfiguredEnvValue(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function railwayProxyEnabled() {
  return truthy(process.env.API_RAILWAY_PROXY || process.env.RAILWAY_API_PROXY || process.env.VITE_API_RAILWAY_PROXY);
}

function railwayProxyStrict() {
  const configured = firstConfiguredEnvValue(["API_RAILWAY_PROXY_STRICT", "RAILWAY_API_PROXY_STRICT"]);
  if (explicitFalsy(configured)) return false;
  if (truthy(configured)) return true;
  return railwayProxyEnabled();
}

function normalizeBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function railwayBaseUrl(upstream = UPSTREAMS.frontendProduct) {
  for (const envName of upstream.envNames) {
    const base = normalizeBaseUrl(process.env[envName]);
    if (base) return { base, envName };
  }
  return { base: "", envName: "" };
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

function pathMatchesPrefix(pathname, prefix) {
  if (prefix.endsWith("/") || prefix.endsWith("-")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getPathname(path) {
  try {
    return new URL(path, "http://localhost").pathname;
  } catch {
    return String(path || "").split("?")[0] || "/";
  }
}

function shouldProxyToRailway(path) {
  const pathname = getPathname(path);
  if (EXACT_RAILWAY_PATHS.has(pathname)) return true;
  return RAILWAY_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

function selectRailwayUpstream(path) {
  const pathname = getPathname(path);

  if (TOKEN_INDEXER_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix))) {
    return UPSTREAMS.tokenIndexer;
  }

  if (FRONTEND_PRODUCT_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix))) {
    return UPSTREAMS.frontendProduct;
  }

  return UPSTREAMS.frontendProduct;
}

function copyRequestHeaders(req, hasBody) {
  const headers = {};
  const passthrough = [
    "authorization",
    "content-type",
    "x-diagnostics-token",
    "x-rank-events-token",
    "x-war-missions-internal-token",
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

function responseLabel(serviceName, path, upstream) {
  return `[railway-proxy:${serviceName}:${upstream.key}] ${path}`;
}

function hasEmptyItemsPayload(text) {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json.length === 0;
    return Array.isArray(json?.items) && json.items.length === 0;
  } catch {
    return false;
  }
}

function buildCampaignFeedFallbackPath(path) {
  const url = new URL(path, "http://localhost");
  const chainId = url.searchParams.get("chainId") || "97";
  const limit = url.searchParams.get("limit") || (url.pathname === "/api/war-room" ? "250" : "20");
  const params = new URLSearchParams({
    chainId,
    limit,
    tab: "trending",
    sort: "default",
    status: "all",
  });
  return `/api/campaigns?${params.toString()}`;
}

async function maybeFetchFeedFallback({ base, path, method, headers, upstreamStatus, upstreamText }) {
  if (method !== "GET") return null;
  if (!EMPTY_FEED_FALLBACK_PATHS.has(getPathname(path))) return null;

  const upstreamFailed = upstreamStatus >= 400;
  const upstreamEmpty = upstreamStatus >= 200 && upstreamStatus < 300 && hasEmptyItemsPayload(upstreamText);
  if (!upstreamFailed && !upstreamEmpty) return null;

  const fallbackPath = buildCampaignFeedFallbackPath(path);
  const fallback = await fetch(`${base}${fallbackPath}`, {
    method: "GET",
    headers,
    redirect: "manual",
  });
  const fallbackText = await fallback.text();
  if (fallback.status < 200 || fallback.status >= 300 || hasEmptyItemsPayload(fallbackText)) return null;

  return {
    path: fallbackPath,
    status: fallback.status,
    text: fallbackText,
    contentType: fallback.headers.get("content-type") || "application/json; charset=utf-8",
  };
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

    const upstreamConfig = selectRailwayUpstream(path);
    const { base, envName } = railwayBaseUrl(upstreamConfig);
    if (!base) {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("x-mwz-api-upstream-service", upstreamConfig.key);
      res.end(JSON.stringify({
        error: `Railway API proxy is enabled, but no ${upstreamConfig.label} Railway API base URL is configured.`,
        code: "RAILWAY_API_BASE_URL_MISSING",
        path,
        upstream: upstreamConfig.key,
        expectedEnv: `Set one of: ${upstreamConfig.envNames.join(", ")}.`,
      }));
      return;
    }

    const target = `${base}${path}`;
    const method = String(req.method || "GET").toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method);
    const body = hasBody ? JSON.stringify(req.body ?? {}) : undefined;
    const requestHeaders = copyRequestHeaders(req, hasBody);

    try {
      const upstream = await fetch(target, {
        method,
        headers: requestHeaders,
        body,
        redirect: "manual",
      });

      if (!railwayProxyStrict() && FALLBACK_STATUSES.has(upstream.status)) {
        console.warn(`${responseLabel(serviceName, path, upstreamConfig)} upstream ${upstream.status}; falling back to local handler`);
        return next();
      }

      const text = await upstream.text();
      const fallback = await maybeFetchFeedFallback({
        base,
        path,
        method,
        headers: requestHeaders,
        upstreamStatus: upstream.status,
        upstreamText: text,
      });
      const responsePath = fallback?.path || path;
      const responseText = fallback?.text || text;
      const contentType = fallback?.contentType || upstream.headers.get("content-type") || "application/json; charset=utf-8";

      res.statusCode = fallback?.status || upstream.status;

      res.setHeader("content-type", contentType);
      res.setHeader("x-mwz-api-upstream", "railway");
      res.setHeader("x-mwz-api-upstream-service", upstreamConfig.key);
      res.setHeader("x-mwz-api-upstream-env", envName);
      res.setHeader("x-mwz-api-upstream-path", responsePath);
      if (fallback) res.setHeader("x-mwz-api-upstream-fallback", "campaigns");

      res.end(responseText);
    } catch (err) {
      if (!railwayProxyStrict()) {
        console.warn(`${responseLabel(serviceName, path, upstreamConfig)} upstream failed; falling back to local handler`, err?.message || err);
        return next();
      }

      console.error(responseLabel(serviceName, path, upstreamConfig), err);
      res.statusCode = 502;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("x-mwz-api-upstream-service", upstreamConfig.key);
      res.end(JSON.stringify({
        error: "Railway API upstream request failed.",
        code: "RAILWAY_API_UPSTREAM_FAILED",
        path,
        upstream: upstreamConfig.key,
        detail: err?.message || String(err),
      }));
    }
  };
}
