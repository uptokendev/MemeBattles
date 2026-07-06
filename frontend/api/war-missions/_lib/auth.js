import crypto from "node:crypto";
import { ethers } from "ethers";

export const WAR_MISSIONS_AUTH_COOKIE = "mwz_wm_auth";
export const WAR_MISSIONS_AUTH_TTL_SECONDS = 60 * 60 * 24 * 14;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SOLANA_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function isEvmAddress(address) {
  return /^0x[a-f0-9]{40}$/.test(String(address || "").trim().toLowerCase());
}

function decodeBase58(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const bytes = [0];
  for (const char of raw) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) return null;

    let carry = index;
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of raw) {
    if (char !== "1") break;
    bytes.push(0);
  }

  return Buffer.from(bytes.reverse());
}

function isSolanaAddress(address) {
  const raw = String(address || "").trim();
  if (raw.length < 32 || raw.length > 44) return false;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(raw)) return false;
  return decodeBase58(raw)?.length === 32;
}

export function normalizeAddress(address) {
  const raw = String(address || "").trim();
  return isEvmAddress(raw) ? raw.toLowerCase() : raw;
}

export function isWalletAddress(address) {
  const normalized = normalizeAddress(address);
  return isEvmAddress(normalized) || isSolanaAddress(normalized);
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

function verifySolanaSignature(message, signature, address) {
  const publicKeyBytes = decodeBase58(address);
  if (!publicKeyBytes || publicKeyBytes.length !== 32) return false;

  let signatureBytes;
  try {
    signatureBytes = Buffer.from(String(signature || ""), "base64");
  } catch {
    return false;
  }
  if (signatureBytes.length !== 64) return false;

  const key = Buffer.concat([SOLANA_SPKI_PREFIX, publicKeyBytes]);
  return crypto.verify(null, Buffer.from(message, "utf8"), { key, format: "der", type: "spki" }, signatureBytes);
}

export async function verifyWalletSignature(message, signature, address) {
  const normalized = normalizeAddress(address);
  if (isSolanaAddress(normalized)) {
    return verifySolanaSignature(message, signature, normalized);
  }

  const recovered = ethers.verifyMessage(message, signature);
  return normalizeAddress(recovered) === normalized;
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