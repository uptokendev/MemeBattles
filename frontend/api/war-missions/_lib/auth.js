import crypto from "node:crypto";
import { ethers } from "ethers";
import { isSolanaAddress } from "../../../server/http.js";

export const WAR_MISSIONS_AUTH_COOKIE = "mwz_wm_auth";
export const WAR_MISSIONS_AUTH_TTL_SECONDS = 60 * 60 * 24 * 14;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function isEvmAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(address || "").trim());
}

export function normalizeAddress(address) {
  const raw = String(address || "").trim();
  if (isSolanaAddress(raw)) return raw;
  const lower = raw.toLowerCase();
  return isEvmAddress(lower) ? lower : "";
}

export function isWalletAddress(address) {
  const normalized = normalizeAddress(address);
  return Boolean(normalized && (isEvmAddress(normalized) || isSolanaAddress(normalized)));
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
  const walletAddress = normalizeAddress(address);
  return `MemeWarzone War Missions login\naddress: ${walletAddress}\nnonce: ${nonce}`;
}

function base58Decode(value) {
  const raw = String(value || "").trim();
  if (!raw) return Buffer.alloc(0);

  let n = 0n;
  for (const char of raw) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) return Buffer.alloc(0);
    n = n * 58n + BigInt(index);
  }

  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let out = hex === "00" ? Buffer.alloc(0) : Buffer.from(hex, "hex");

  let leadingZeros = 0;
  for (const char of raw) {
    if (char !== "1") break;
    leadingZeros += 1;
  }
  if (leadingZeros) out = Buffer.concat([Buffer.alloc(leadingZeros), out]);

  return out;
}

function decodeSolanaSignature(signature) {
  if (Buffer.isBuffer(signature) || signature instanceof Uint8Array) return Buffer.from(signature);
  if (Array.isArray(signature)) return Buffer.from(signature.map((byte) => Number(byte) & 255));

  const raw = String(signature || "").trim();
  if (!raw) return Buffer.alloc(0);
  if (/^[0-9a-fA-F]{128}$/.test(raw)) return Buffer.from(raw, "hex");
  if (/^\s*\d+(\s*,\s*\d+){63}\s*$/.test(raw)) return Buffer.from(raw.split(",").map((byte) => Number(byte.trim()) & 255));

  try {
    return Buffer.from(raw, "base64");
  } catch {
    return Buffer.alloc(0);
  }
}

function verifySolanaSignature({ walletAddress, message, signature }) {
  const publicKeyBytes = base58Decode(walletAddress);
  if (publicKeyBytes.length !== 32) return false;

  const signatureBytes = decodeSolanaSignature(signature);
  if (signatureBytes.length !== 64) return false;

  const keyObject = crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
    format: "der",
    type: "spki",
  });
  return crypto.verify(null, Buffer.from(message, "utf8"), keyObject, signatureBytes);
}

export async function verifyWalletSignature(message, signature, address) {
  const walletAddress = normalizeAddress(address);
  if (!walletAddress) return false;

  if (isSolanaAddress(walletAddress)) {
    return verifySolanaSignature({ walletAddress, message, signature });
  }

  const recovered = ethers.verifyMessage(message, String(signature || ""));
  return normalizeAddress(recovered) === walletAddress;
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

export { isSolanaAddress };
