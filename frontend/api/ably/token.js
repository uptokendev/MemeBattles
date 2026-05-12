import Ably from "ably";
import { badMethod, getQuery, isAddress, json } from "../../server/http.js";

// CORS allow-list for cross-origin access from mw-dashboard.
// Production origin is TBD by deploy config; set MW_DASHBOARD_ORIGIN env var.
// Vite default dev port for mw-dashboard is 5173 — confirm in mw-dashboard/vite.config.ts.
const MW_DASHBOARD_ALLOWED_ORIGINS = [
  String(process.env.MW_DASHBOARD_ORIGIN || "").trim(),
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);

function applyCors(req, res) {
  const origin = String(req.headers.origin || "").trim();
  if (MW_DASHBOARD_ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "GET, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-max-age", "600");
  }
}

function p(v) {
  return String(v ?? "").trim().replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "");
}
function resolveAblyApiKey() {
  const raw = p(process.env.ABLY_API_KEY);

  const keyName = p(
    process.env.ABLY_API_KEY_NAME ||
    process.env.ABLY_KEY_NAME
  );

  const keySecret = p(
    process.env.ABLY_API_KEY_SECRET ||
    process.env.ABLY_KEY_SECRET ||
    process.env.ABLY_API_SECRET ||
    process.env.ABLY_SECRET
  );

  // Preferred production format.
  if (raw.includes(":")) return raw;

  // Split production format.
  if (raw && keySecret) return `${raw}:${keySecret}`;
  if (keyName && keySecret) return `${keyName}:${keySecret}`;

  // Local compatibility fallback.
  // In local Netlify dev, some setups already provide the full Ably key as
  // VITE_ABLY_CLIENT_KEY in .env while ABLY_API_KEY only contains the key name.
  const viteClientKey = p(process.env.VITE_ABLY_CLIENT_KEY);
  if (viteClientKey.includes(":")) return viteClientKey;

  return raw;
}
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") return badMethod(res);

  res.setHeader("cache-control", "no-store");

  try {
    const ABLY_API_KEY = resolveAblyApiKey();
    if (!ABLY_API_KEY) {
      return json(res, 500, { error: "Server misconfigured: ABLY_API_KEY missing" });
    }
    const colon = ABLY_API_KEY.indexOf(":");
    if (colon <= 0) {
      return json(res, 500, {
        error: "Server misconfigured: ABLY_API_KEY format invalid",
        hint: "Expected keyName:keySecret, or set ABLY_API_KEY_NAME + ABLY_API_KEY_SECRET.",
      });
    }

    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    const campaign = p(q.campaign).toLowerCase();
    const scope = p(q.scope).toLowerCase();
    const liveChannel = p(q.channel).toLowerCase();

    const capability = {};

    if (scope === "live") {
      // Live launch-party / AMA chat channel. Bilateral: clients subscribe AND
      // publish chat messages, enter presence, fetch history.
      // Channel name pattern is restricted to live:<safe-slug> to prevent
      // tokens from being minted for unrelated channels.
      if (!/^live:[a-z0-9._-]+$/.test(liveChannel)) {
        return json(res, 400, { error: "Invalid live channel name" });
      }
      capability[liveChannel] = ["subscribe", "publish", "presence", "history"];
    } else if (scope === "league") {
      if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
      capability[`league:${chainId}`] = ["subscribe"];
    } else {
      if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
      if (!isAddress(campaign)) {
        return json(res, 400, { error: "Invalid campaign address" });
      }

      // Campaign detail pages can mount token realtime and War Room realtime
      // very close together. Grant both read channels so cached/overlapping Ably
      // clients cannot receive a token scoped to the wrong campaign channel.
      capability[`token:${chainId}:${campaign}`] = ["subscribe"];
      capability[`warroom:${chainId}:${campaign}`] = ["subscribe"];
    }

    const ably = new Ably.Rest({ key: ABLY_API_KEY });
    const tokenRequest = await ably.auth.createTokenRequest({
      ttl: 60 * 60 * 1000,
      capability,
    });

    return json(res, 200, tokenRequest);
  } catch (e) {
    console.error("[api/ably/token]", e);
    return json(res, 500, { error: "Server error" });
  }
}
