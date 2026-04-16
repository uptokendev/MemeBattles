import { badMethod, getQuery, isAddress, json } from "../../server/http.js";
import { pool } from "../../server/db.js";
import { normalizeAddress } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const campaignAddress = normalizeAddress(q.campaignAddress);
    const limitRaw = Number(q.limit ?? 50);
    const beforeIdRaw = q.beforeId != null ? Number(q.beforeId) : null;

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(campaignAddress)) return json(res, 400, { error: "Invalid campaignAddress" });

    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
    const beforeId = beforeIdRaw != null && Number.isFinite(beforeIdRaw) ? beforeIdRaw : null;

    const { rows } = await pool.query(
      `SELECT id,
              wallet_address AS "walletAddress",
              display_name AS "displayName",
              avatar_url AS "avatarUrl",
              role,
              message,
              client_nonce AS "clientNonce",
              reply_to_id AS "replyToId",
              created_at AS "createdAt"
         FROM chat_messages
        WHERE chain_id = $1
          AND campaign_address = $2
          AND is_hidden = FALSE
          AND deleted_at IS NULL
          AND ($3::bigint IS NULL OR id < $3)
        ORDER BY id DESC
        LIMIT $4`,
      [chainId, campaignAddress, beforeId, limit]
    );

    const items = [...rows].reverse();
    const nextBeforeId = rows.length === limit ? rows[rows.length - 1]?.id ?? null : null;
    return json(res, 200, { items, nextBeforeId });
  } catch (e) {
    const code = e?.code;
    console.error("[api/chat/history]", e);
    if (code === "42P01" || code === "42703") {
      return json(res, 200, { items: [], nextBeforeId: null, warning: "DB schema missing chat tables" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
