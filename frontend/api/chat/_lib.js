import crypto from "crypto";
import { ethers } from "ethers";
import { pool } from "../../server/db.js";
import { isAddress } from "../../server/http.js";

export function normalizeAddress(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function getBearerToken(req) {
  const h = String(req.headers?.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function makeSessionToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function buildChatJoinMessage({ chainId, address, campaignAddress, nonce }) {
  return [
    "MemeBattles War Room",
    "Action: CHAT_JOIN",
    `ChainId: ${chainId}`,
    `Address: ${normalizeAddress(address)}`,
    `Campaign: ${normalizeAddress(campaignAddress)}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export async function consumeNonce(chainId, address, nonce) {
  const { rows } = await pool.query(
    `SELECT nonce, expires_at, used_at
       FROM auth_nonces
      WHERE chain_id = $1 AND address = $2
      LIMIT 1`,
    [chainId, normalizeAddress(address)]
  );
  const row = rows[0];
  if (!row) throw new Error("Nonce not found");
  if (row.used_at) throw new Error("Nonce already used");
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!exp || Date.now() > exp) throw new Error("Nonce expired");
  if (String(row.nonce) !== String(nonce)) throw new Error("Nonce mismatch");

  await pool.query(
    `UPDATE auth_nonces
        SET used_at = NOW()
      WHERE chain_id = $1 AND address = $2`,
    [chainId, normalizeAddress(address)]
  );
}

export async function verifyJoinSignature({ chainId, address, campaignAddress, nonce, signature }) {
  if (!Number.isFinite(Number(chainId))) throw new Error("Invalid chainId");
  if (!isAddress(address)) throw new Error("Invalid address");
  if (!isAddress(campaignAddress)) throw new Error("Invalid campaignAddress");
  if (!nonce) throw new Error("Nonce missing");
  if (!signature) throw new Error("Signature missing");

  await consumeNonce(Number(chainId), normalizeAddress(address), nonce);
  const msg = buildChatJoinMessage({ chainId, address, campaignAddress, nonce });
  const recovered = ethers.verifyMessage(msg, signature).toLowerCase();
  if (recovered !== normalizeAddress(address)) throw new Error("Invalid signature");
}

export async function loadUserProfile(chainId, address) {
  try {
    const { rows } = await pool.query(
      `SELECT display_name AS "displayName",
              avatar_url AS "avatarUrl"
         FROM user_profiles
        WHERE chain_id = $1 AND address = $2
        LIMIT 1`,
      [chainId, normalizeAddress(address)]
    );
    return rows[0] ?? null;
  } catch (e) {
    if (e?.code === "42P01" || e?.code === "42703") return null;
    throw e;
  }
}

export async function resolveCampaignRole(chainId, campaignAddress, address) {
  const campaign = normalizeAddress(campaignAddress);
  const wallet = normalizeAddress(address);
  try {
    const { rows } = await pool.query(
      `SELECT creator_address
         FROM campaigns
        WHERE chain_id = $1 AND campaign_address = $2
        LIMIT 1`,
      [chainId, campaign]
    );
    const creator = normalizeAddress(rows[0]?.creator_address);
    return creator && creator === wallet ? "creator" : "trader";
  } catch (e) {
    if (e?.code === "42P01" || e?.code === "42703") return "trader";
    throw e;
  }
}

export function sanitizeMessage(input) {
  const text = String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) return "";
  return text.slice(0, 500);
}

export async function lookupChatSession(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT wallet_address AS "walletAddress",
            display_name AS "displayName",
            avatar_url AS "avatarUrl",
            role,
            expires_at AS "expiresAt"
       FROM chat_sessions
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  const session = rows[0] ?? null;
  if (!session) return null;
  const expiresAt = session.expiresAt ? new Date(session.expiresAt).getTime() : 0;
  if (!expiresAt || expiresAt <= Date.now()) return null;
  return session;
}

export function roomChannelName(chainId, campaignAddress) {
  return `warroom:${Number(chainId)}:${normalizeAddress(campaignAddress)}`;
}
