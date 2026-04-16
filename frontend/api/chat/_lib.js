import crypto from "crypto";
import Ably from "ably";
import { ethers } from "ethers";
import { pool } from "../../server/db.js";
import { isAddress } from "../../server/http.js";

export function clean(v) {
  return String(v ?? "").trim().replace(/^['\"]|['\"]$/g, "");
}

export function lowerAddress(v) {
  return clean(v).toLowerCase();
}

export function validChainId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeCampaignAddress(v) {
  const a = lowerAddress(v);
  return isAddress(a) ? a : null;
}

export function normalizeWalletAddress(v) {
  const a = lowerAddress(v);
  return isAddress(a) ? a : null;
}

export function channelName(chainId, campaignAddress) {
  return `warroom:${Number(chainId)}:${String(campaignAddress).toLowerCase()}`;
}

export function sanitizeMessage(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function buildJoinMessage({ chainId, campaignAddress, walletAddress, nonce }) {
  return [
    "MemeWarzone War Room",
    "Action: CHAT_SESSION_CREATE",
    `ChainId: ${Number(chainId)}`,
    `Wallet: ${String(walletAddress).toLowerCase()}`,
    `Campaign: ${String(campaignAddress).toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export function verifyJoinSignature({ chainId, campaignAddress, walletAddress, nonce, signature, message }) {
  const expected = buildJoinMessage({ chainId, campaignAddress, walletAddress, nonce });
  if (String(message ?? "") !== expected) {
    const err = new Error("Invalid sign-in message");
    err.statusCode = 401;
    throw err;
  }
  const recovered = ethers.verifyMessage(expected, signature).toLowerCase();
  if (recovered !== String(walletAddress).toLowerCase()) {
    const err = new Error("Invalid signature");
    err.statusCode = 401;
    throw err;
  }
}

export function createSessionToken() {
  return `mwz_chat_${crypto.randomBytes(32).toString("hex")}`;
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function bearerToken(req) {
  const auth = String(req.headers?.authorization ?? req.headers?.Authorization ?? "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export async function getProfile(chainId, walletAddress) {
  try {
    const { rows } = await pool.query(
      `SELECT display_name AS "displayName", avatar_url AS "avatarUrl"
       FROM user_profiles
       WHERE chain_id = $1 AND address = $2
       LIMIT 1`,
      [Number(chainId), String(walletAddress).toLowerCase()]
    );
    return rows[0] ?? {};
  } catch (e) {
    if (e?.code === "42P01" || e?.code === "42703") return {};
    throw e;
  }
}

export async function getCampaignCreator(chainId, campaignAddress) {
  const variants = [
    `SELECT creator_address AS creator FROM campaigns WHERE chain_id = $1 AND campaign_address = $2 LIMIT 1`,
    `SELECT creator AS creator FROM campaigns WHERE chain_id = $1 AND campaign = $2 LIMIT 1`,
    `SELECT creator AS creator FROM campaigns WHERE chain_id = $1 AND address = $2 LIMIT 1`,
  ];
  for (const sql of variants) {
    try {
      const { rows } = await pool.query(sql, [Number(chainId), String(campaignAddress).toLowerCase()]);
      const creator = rows[0]?.creator ? String(rows[0].creator).toLowerCase() : "";
      if (isAddress(creator)) return creator;
    } catch (e) {
      if (e?.code === "42P01" || e?.code === "42703") continue;
      throw e;
    }
  }
  return "";
}

export async function resolveRole(chainId, campaignAddress, walletAddress) {
  const creator = await getCampaignCreator(chainId, campaignAddress);
  if (creator && creator === String(walletAddress).toLowerCase()) return "creator";
  return "trader";
}

export async function requireSession(req) {
  const token = bearerToken(req);
  if (!token) {
    const err = new Error("Chat session missing");
    err.statusCode = 401;
    throw err;
  }
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT
       wallet_address AS "walletAddress",
       display_name AS "displayName",
       avatar_url AS "avatarUrl",
       role,
       expires_at AS "expiresAt"
     FROM chat_sessions
     WHERE token_hash = $1
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  const session = rows[0];
  if (!session) {
    const err = new Error("Chat session expired");
    err.statusCode = 401;
    throw err;
  }
  session.walletAddress = String(session.walletAddress).toLowerCase();
  return session;
}

export function resolveAblyApiKey() {
  const raw = clean(process.env.ABLY_API_KEY);
  const keyName = clean(process.env.ABLY_API_KEY_NAME || process.env.ABLY_KEY_NAME);
  const keySecret = clean(process.env.ABLY_API_KEY_SECRET || process.env.ABLY_KEY_SECRET);
  if (raw.includes(":")) return raw;
  if (raw && keySecret) return `${raw}:${keySecret}`;
  if (keyName && keySecret) return `${keyName}:${keySecret}`;
  return raw;
}

export async function publishChatMessage(message) {
  const key = resolveAblyApiKey();
  if (!key || !key.includes(":")) return;
  const ably = new Ably.Rest({ key });
  const channel = ably.channels.get(channelName(message.chainId, message.campaignAddress));
  await channel.publish("message:new", message);
}

export function mapMessageRow(row) {
  return {
    id: String(row.id),
    chainId: Number(row.chainId ?? row.chain_id),
    campaignAddress: String(row.campaignAddress ?? row.campaign_address ?? "").toLowerCase(),
    walletAddress: String(row.walletAddress ?? row.wallet_address ?? "").toLowerCase(),
    displayName: row.displayName ?? row.display_name ?? null,
    avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
    role: row.role ?? "trader",
    message: row.message ?? "",
    createdAt: row.createdAt ?? row.created_at,
    clientNonce: row.clientNonce ?? row.client_nonce ?? null,
    replyToId: row.replyToId ?? row.reply_to_id ?? null,
  };
}
