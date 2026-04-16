import Ably from "ably";
import { badMethod, json, readJson, isAddress } from "../../server/http.js";
import { pool } from "../../server/db.js";
import {
  getBearerToken,
  lookupChatSession,
  normalizeAddress,
  resolveCampaignRole,
  roomChannelName,
  sanitizeMessage,
} from "./_lib.js";

function p(v) {
  return String(v ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function resolveAblyApiKey() {
  const raw = p(process.env.ABLY_API_KEY);
  const keyName = p(process.env.ABLY_API_KEY_NAME || process.env.ABLY_KEY_NAME);
  const keySecret = p(process.env.ABLY_API_KEY_SECRET || process.env.ABLY_KEY_SECRET);

  if (raw.includes(":")) return raw;
  if (raw && keySecret) return `${raw}:${keySecret}`;
  if (keyName && keySecret) return `${keyName}:${keySecret}`;
  return raw;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);

  try {
    const sessionToken = getBearerToken(req);
    const session = await lookupChatSession(sessionToken);
    if (!session) return json(res, 401, { error: "Unauthorized" });

    const body = await readJson(req);
    const chainId = Number(body.chainId);
    const campaignAddress = normalizeAddress(body.campaignAddress);
    const clientNonce = String(body.clientNonce ?? "").trim().slice(0, 80) || null;
    const message = sanitizeMessage(body.message);

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(campaignAddress)) return json(res, 400, { error: "Invalid campaignAddress" });
    if (!message) return json(res, 400, { error: "Message is empty" });
    if (message.length > 500) return json(res, 400, { error: "Message too long" });

    const walletAddress = normalizeAddress(session.walletAddress);
    const role = await resolveCampaignRole(chainId, campaignAddress, walletAddress);

    const rate = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM chat_messages
        WHERE chain_id = $1
          AND campaign_address = $2
          AND wallet_address = $3
          AND created_at > NOW() - INTERVAL '10 seconds'`,
      [chainId, campaignAddress, walletAddress]
    );
    const recentCount = Number(rate.rows?.[0]?.count ?? 0);
    if (recentCount >= 5) {
      return json(res, 429, { error: "Slow down a bit." });
    }

    const dupe = await pool.query(
      `SELECT id
         FROM chat_messages
        WHERE chain_id = $1
          AND campaign_address = $2
          AND wallet_address = $3
          AND message = $4
          AND created_at > NOW() - INTERVAL '20 seconds'
        LIMIT 1`,
      [chainId, campaignAddress, walletAddress, message]
    );
    if (dupe.rows?.[0]?.id) {
      return json(res, 409, { error: "Duplicate message blocked." });
    }

    const inserted = await pool.query(
      `INSERT INTO chat_messages (
         chain_id,
         campaign_address,
         wallet_address,
         display_name,
         avatar_url,
         role,
         message,
         reply_to_id,
         client_nonce
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)
       ON CONFLICT (chain_id, campaign_address, wallet_address, client_nonce)
       DO UPDATE SET id = chat_messages.id
       RETURNING id,
                 wallet_address AS "walletAddress",
                 display_name AS "displayName",
                 avatar_url AS "avatarUrl",
                 role,
                 message,
                 client_nonce AS "clientNonce",
                 reply_to_id AS "replyToId",
                 created_at AS "createdAt"`,
      [
        chainId,
        campaignAddress,
        walletAddress,
        session.displayName ?? null,
        session.avatarUrl ?? null,
        role,
        message,
        clientNonce,
      ]
    );

    const item = inserted.rows[0] ?? null;

    try {
      const ablyKey = resolveAblyApiKey();
      if (ablyKey) {
        const rest = new Ably.Rest({ key: ablyKey });
        const channel = rest.channels.get(roomChannelName(chainId, campaignAddress));
        await channel.publish("message:new", item);
      }
    } catch (pubErr) {
      console.error("[api/chat/send publish]", pubErr);
    }

    return json(res, 200, { item });
  } catch (e) {
    const code = e?.code;
    console.error("[api/chat/send]", e);
    if (code === "42P01" || code === "42703") {
      return json(res, 500, { error: "DB schema missing chat tables" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
