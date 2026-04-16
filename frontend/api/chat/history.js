import { pool } from "../../server/db.js";
import { badMethod, getQuery, json } from "../../server/http.js";
import { mapMessageRow, normalizeCampaignAddress, validChainId } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  res.setHeader("cache-control", "no-store");

  try {
    const q = getQuery(req);
    const chainId = validChainId(q.chainId);
    const campaignAddress = normalizeCampaignAddress(q.campaignAddress);
    const limitRaw = Number(q.limit ?? 50);
    const before = q.before ? String(q.before) : null;

    if (!chainId) return json(res, 400, { error: "Invalid chainId" });
    if (!campaignAddress) return json(res, 400, { error: "Invalid campaignAddress" });

    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
    const { rows } = await pool.query(
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
         AND deleted_at IS NULL
         AND is_hidden = FALSE
         AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
       ORDER BY created_at DESC
       LIMIT $4`,
      [chainId, campaignAddress, before, limit]
    );

    const newestFirst = rows.map(mapMessageRow);
    const messages = newestFirst.reverse();
    const oldest = newestFirst[newestFirst.length - 1];

    return json(res, 200, {
      messages,
      nextCursor: rows.length === limit && oldest?.createdAt ? oldest.createdAt : null,
    });
  } catch (e) {
    console.error("[api/chat/history]", e);
    if (e?.code === "42P01" || e?.code === "42703") {
      return json(res, 200, { messages: [], nextCursor: null, warning: "Chat schema missing" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
