import fs from "fs";

const p = "frontend/api/ably/token.js";
let c = fs.readFileSync(p, "utf8");

if (c.includes("rateLimitLiveToken")) {
  console.log("ably already hardened");
  process.exit(0);
}

// Simple in-memory rate limit + optional publish restriction via env
const inject = `
// --- Soft hardening: live-token mint rate limit (per IP) ---
const LIVE_TOKEN_HITS = new Map();
const LIVE_TOKEN_WINDOW_MS = 60 * 1000;
const LIVE_TOKEN_MAX = Math.max(5, Number(process.env.ABLY_LIVE_TOKEN_MAX_PER_MIN || 30));

function rateLimitLiveToken(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  const now = Date.now();
  const bucket = LIVE_TOKEN_HITS.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < LIVE_TOKEN_WINDOW_MS);
  fresh.push(now);
  LIVE_TOKEN_HITS.set(ip, fresh);
  if (fresh.length > LIVE_TOKEN_MAX) return false;
  return true;
}

function livePublishCapability() {
  // Default remains publish for launch-party UX. Set ABLY_LIVE_SUBSCRIBE_ONLY=1 to mint subscribe-only tokens.
  if (["1", "true", "yes", "on"].includes(String(process.env.ABLY_LIVE_SUBSCRIBE_ONLY || "").trim().toLowerCase())) {
    return ["subscribe", "presence", "history"];
  }
  return ["subscribe", "publish", "presence", "history"];
}
`;

// Insert after imports / before handler
if (c.includes("export default async function handler")) {
  c = c.replace("export default async function handler", `${inject}\nexport default async function handler`);
}

// Rate-limit live scope
c = c.replace(
  `if (scope === "live") {
      // Live launch-party / AMA chat channel. Bilateral: clients subscribe AND
      // publish chat messages, enter presence, fetch history.
      // Channel name pattern is restricted to live:<safe-slug> to prevent
      // tokens from being minted for unrelated channels.
      console.log("[api/ably/token] live channel requested:", liveChannel);
      if (!/^live:[a-z0-9._-]+$/.test(liveChannel)) {
        console.error(
          "[api/ably/token] Invalid live channel name:",
          liveChannel,
        );
        return json(res, 400, { error: "Invalid live channel name" });
      }
      console.log(
        "[api/ably/token] Granting access to live channel:",
        liveChannel,
      );
      capability[liveChannel] = ["subscribe", "publish", "presence", "history"];
    }`,
  `if (scope === "live") {
      // Live launch-party / AMA chat channel.
      // Channel name pattern is restricted to live:<safe-slug>.
      if (!rateLimitLiveToken(req)) {
        return json(res, 429, { error: "Too many live token requests. Try again shortly." });
      }
      console.log("[api/ably/token] live channel requested:", liveChannel);
      if (!/^live:[a-z0-9._-]+$/.test(liveChannel)) {
        console.error(
          "[api/ably/token] Invalid live channel name:",
          liveChannel,
        );
        return json(res, 400, { error: "Invalid live channel name" });
      }
      console.log(
        "[api/ably/token] Granting access to live channel:",
        liveChannel,
      );
      capability[liveChannel] = livePublishCapability();
    }`,
);

// Shorter TTL for live tokens (15m) vs 60m default when live
c = c.replace(
  `const tokenRequest = await ably.auth.createTokenRequest({
      ttl: 60 * 60 * 1000,
      capability,
    });`,
  `const tokenRequest = await ably.auth.createTokenRequest({
      ttl: scope === "live" ? 15 * 60 * 1000 : 60 * 60 * 1000,
      capability,
    });`,
);

fs.writeFileSync(p, c);
console.log("ably token hardened");
