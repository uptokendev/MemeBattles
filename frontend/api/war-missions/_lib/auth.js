import crypto from "node:crypto";
import { ethers } from "ethers";

export const WAR_MISSIONS_AUTH_COOKIE = "mwz_wm_auth";
export const WAR_MISSIONS_AUTH_TTL_SECONDS = 60 * 60 * 24 * 14;

export function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase();
}

export function isWalletAddress(address) {
  return /^0x[a-f0-9]{40}$/.test(normalizeAddress(address));
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

function getSecureCookieFlag(req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || "");
  const host = String(req.headers?.host || "");
  if (/localhost|127\.0\.0\.1/i.test(host)) return false;
  return proto ? proto === "https" : process.env.NODE_ENV === "production";
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure !== false) parts.push("Secure");
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join("; ");
}

export function warLoginMessage(address, nonce) {
  return `MemeWarzone War Missions login\naddress: ${normalizeAddress(address)}\nnonce: ${nonce}`;
}

export async function verifyWalletSignature(message, signature, address) {
  const recovered = ethers.verifyMessage(message, signature);
  return normalizeAddress(recovered) === normalizeAddress(address);
}

export function createWarAuthCookie(req, data) {
  const exp = Math.floor(Date.now() / 1000) + WAR_MISSIONS_AUTH_TTL_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ uid: data.userId, addr: normalizeAddress(data.address), exp }),
  ).toString("base64url");
  const signature = signPayload(payload);
  const domain = String(process.env.WAR_MISSIONS_COOKIE_DOMAIN || "").trim() || undefined;

  return buildCookie(WAR_MISSIONS_AUTH_COOKIE, `${payload}.${signature}`, {
    maxAge: WAR_MISSIONS_AUTH_TTL_SECONDS,
    httpOnly: true,
    secure: getSecureCookieFlag(req),
    sameSite: "Lax",
    path: "/",
    domain,
  });
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
