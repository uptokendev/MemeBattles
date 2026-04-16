import { pool } from "../../server/db.js";
import { badMethod, json, readJson } from "../../server/http.js";
import {
  mapMessageRow,
  normalizeCampaignAddress,
  publishChatMessage,
  requireSession,
  sanitizeMessage,
  validChainId,
} from "./_lib.js";

async function checkRateLimit({ chainId, campaignAddress, walletAddress, message }) {
  const { rows } = await pool.query(
    `SELECT message, created_at AS "createdAt"
     FROM chat_messages
     WHERE chain_id = $1
       AND campaign_address = $2
       AND wallet_address = $3
       AND created_at > NOW() - INTERVAL '10 seconds'
     ORDER BY created_at DESC
     LIMIT 10`,
    [chainId, campaignAddress, walletAddress]
  );

  if (rows.length >= 5) {
    const err = new Error("Slow down — too many messages.");
    err.statusCode = 429;
    throw err;
  }

  const normalized = String(message).trim().toLowerCase();
  const isDuplicate = rows.some((r) => String(r.message ?? "").trim().toLowerCase() === normalized);
  if (isDuplicate) {
    const err = new Error("Duplicate message suppressed.");
    err.statusCode = 429;
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);
  res.setHeader("cache-control", "no-store");

  try {
    const session = await requireSession(req);
    const body = await readJson(req);
    const chainId = validChainId(body.chainId);
    const campaignAddress = normalizeCampaignAddress(body.campaignAddress);
    const message = sanitizeMessage(body.message);
    const clientNonce = String(body.clientNonce ?? "").trim().slice(0, 120) || null;
    const replyToId = body.replyToId ? String(body.replyToId) : null;

    if (!chainId) return json(res, 400, { error: "Invalid chainId" });
    if (!campaignAddress) return json(res, 400, { error: "Invalid campaignAddress" });
    if (!message) return json(res, 400, { error: "Message is empty" });
    if (message.length > 500) return json(res, 400, { error: "Message too long" });

    if (clientNonce) {
      const existing = await pool.query(
        `SELECT
           id::text,
           chain_id AS "chainId",
           campaign_address AS "campaignAddress",
           wallet_address AS "walletAddress",
           display_name AS "displayName",
           avatar_url AS "avatarUrl",
           role,
           message,
           created_at AS "createdAt",
           client_nonce AS "clientNonce",
           reply_to_id::text AS "replyToId"
         FROM chat_messages
         WHERE chain_id = $1
           AND campaign_address = $2
           AND wallet_address = $3
           AND client_nonce = $4
         LIMIT 1`,
        [chainId, campaignAddress, session.walletAddress, clientNonce]
      );
      if (existing.rows[0]) {
        return json(res, 200, { message: mapMessageRow(existing.rows[0]), duplicate: true });
      }
    }

    await checkRateLimit({ chainId, campaignAddress, walletAddress: session.walletAddress, message });

    const { rows } = await pool.query(
      `INSERT INTO chat_messages (
         chain_id,
         campaign_address,
         wallet_address,
         display_name,
         avatar_url,
         role,
         message,
         client_nonce,
         reply_to_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid)
       ON CONFLICT (chain_id, campaign_address, wallet_address, client_nonce)
       DO UPDATE SET client_nonce = EXCLUDED.client_nonce
       RETURNING
         id::text,
         chain_id AS "chainId",
         campaign_address AS "campaignAddress",
         wallet_address AS "walletAddress",
         display_name AS "displayName",
         avatar_url AS "avatarUrl",
         role,
         message,
         created_at AS "createdAt",
         client_nonce AS "clientNonce",
         reply_to_id::text AS "replyToId"`,
      [
        chainId,
        campaignAddress,
        session.walletAddress,
        session.displayName || null,
        session.avatarUrl || null,
        session.role || "trader",
        message,
        clientNonce,
        replyToId,
      ]
    );

    const saved = mapMessageRow(rows[0]);
    try {
      await publishChatMessage(saved);
    } catch (e) {
      console.error("[api/chat/send] publish failed", e);
    }

    return json(res, 200, { message: saved });
  } catch (e) {
    console.error("[api/chat/send]", e);
    return json(res, e?.statusCode || 500, { error: e?.statusCode ? e.message : "Server error" });
  }
}
