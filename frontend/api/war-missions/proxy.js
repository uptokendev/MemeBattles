const DEFAULT_WAR_MISSIONS_UPSTREAM = "https://quests.memewar.zone";

function getUpstreamBase() {
  return String(
    process.env.WAR_MISSIONS_UPSTREAM_API_BASE ||
      process.env.QUESTS_API_BASE ||
      process.env.VITE_QUESTS_API_BASE ||
      DEFAULT_WAR_MISSIONS_UPSTREAM
  )
    .trim()
    .replace(/\/+$/, "");
}

function copyRequestHeaders(req, hasBody) {
  const headers = {};
  const passthrough = [
    "accept",
    "authorization",
    "content-type",
    "cookie",
    "user-agent",
    "x-forwarded-for",
    "x-real-ip",
  ];

  for (const name of passthrough) {
    const value = req.headers?.[name];
    if (!value) continue;
    if (name === "content-type" && !hasBody) continue;
    headers[name] = Array.isArray(value) ? value.join(",") : String(value);
  }

  if (hasBody && !headers["content-type"]) headers["content-type"] = "application/json";
  return headers;
}

function getProxyPath(req) {
  const raw = String(req.originalUrl || req.url || "/");
  try {
    const url = new URL(raw, "http://localhost");
    return `${url.pathname}${url.search}`;
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function getRequestBody(req, hasBody) {
  if (!hasBody) return undefined;
  if (req.body == null) return undefined;
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) return req.body;
  return JSON.stringify(req.body);
}

async function maybeHandleLocalRoute(req, res, path) {
  const routePath = path.split("?")[0];
  if (routePath !== "/api/wm-daily-rollover") return false;

  const { default: wmDailyRollover } = await import("./daily-rollover.js");
  await wmDailyRollover(req, res);
  return true;
}

export default async function warMissionsProxy(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const upstreamBase = getUpstreamBase();
  const path = getProxyPath(req);

  try {
    if (await maybeHandleLocalRoute(req, res, path)) return;
  } catch (error) {
    console.error("[war-missions/proxy] local route failed", { path, error });
    return res.status(500).json({
      ok: false,
      error: "War Missions local route failed.",
      code: "WAR_MISSIONS_LOCAL_ROUTE_FAILED",
      path,
      detail: error?.message || String(error),
    });
  }

  const target = `${upstreamBase}${path}`;

  try {
    const upstream = await fetch(target, {
      method,
      headers: copyRequestHeaders(req, hasBody),
      body: getRequestBody(req, hasBody),
      redirect: "manual",
    });

    const body = await upstream.arrayBuffer();
    res.status(upstream.status);

    const hopByHop = new Set([
      "connection",
      "content-encoding",
      "content-length",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailer",
      "transfer-encoding",
      "upgrade",
    ]);

    upstream.headers.forEach((value, key) => {
      const normalized = key.toLowerCase();
      if (hopByHop.has(normalized)) return;
      if (normalized === "set-cookie") return;
      res.setHeader(key, value);
    });

    const setCookie = upstream.headers.getSetCookie?.() || [];
    if (setCookie.length) res.setHeader("set-cookie", setCookie);

    res.setHeader("x-mwz-war-missions-upstream", upstreamBase);
    res.setHeader("x-mwz-war-missions-path", path);
    res.end(Buffer.from(body));
  } catch (error) {
    console.error("[war-missions/proxy] upstream failed", { target, error });
    res.status(502).json({
      ok: false,
      error: "War Missions upstream request failed.",
      code: "WAR_MISSIONS_UPSTREAM_FAILED",
      path,
      upstream: upstreamBase,
      detail: error?.message || String(error),
    });
  }
}
