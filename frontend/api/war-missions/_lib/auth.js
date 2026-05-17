import crypto from "node:crypto";

export const WAR_MISSIONS_AUTH_COOKIE = "mwz_wm_auth";

export function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase();
}

function parseCookies(raw) {
  return String(raw || "")
    .split(";")
    .reduce((acc, pair) => {
      const index = pair.indexOf("=");
      if (index === -1) return acc;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!key) return acc;
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getAuthSecret() {
  const secret = String(
    process.env.WAR_MISSIONS_AUTH_SECRET ||
      process.env.RECRUITER_AUTH_SECRET ||
      process.env.RECRUITER_DASHBOARD_TOKEN ||
      ""
  );
  if (!secret) throw new Error("War Missions auth secret is not configured yet.");
  return secret;
}

function signPayload(payload) {
  return crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

export function readWarAuth(req) {
  const cookies = parseCookies(req.headers?.cookie || req.headers?.Cookie);
  const raw = cookies[WAR_MISSIONS_AUTH_COOKIE];
  if (!raw) return null;

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  if (signPayload(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded?.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: decoded.uid, address: normalizeAddress(decoded.addr) };
  } catch {
    return null;
  }
}

export function unauthorized(res, message = "Connect wallet to access War Missions.") {
  return res.status(401).json({ error: message });
}
