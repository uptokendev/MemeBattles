import { badMethod, json, readJson } from "../../server/http.js";
import { pool } from "../../server/db.js";
import {
  enforceRateLimit,
  ensureChatSchema,
  ensureNotMuted,
  loadSessionFromRequest,
  mapMessageRow,
  maybePublishChatMessage,
  normalizeAddress,
  sanitizeChatMessage,
} from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);
  try {
    await ensureChatSchema();
    const b = await readJson(req);
    const chainId = Number(b.chainId);
    const campaignAddress = normalizeAddress(b.campaignAddress);
    const clientNonce = String(b.clientNonce ?? "").trim().slice(0, 120) || null;
    const text = sanitizeChatMessage(b.message);

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!campaignAddress) return json(res, 400, { error: "Invalid campaignAddress" });

    const session = await loadSessionFromRequest(req, chainId, campaignAddress);
    await ensureNotMuted({ chainId, campaignAddress, walletAddress: session.wallet_address });
    await enforceRateLimit({ chainId, campaignAddress, walletAddress: session.wallet_address });

    if (clientNonce) {
      const existing = await pool.query(
        `SELECT id, chain_id, campaign_address, wallet_address, display_name, avatar_url, role, message, client_nonce, created_at
         FROM public.chat_messages
         WHERE chain_id = $1 AND campaign_address = $2 AND wallet_address = $3 AND client_nonce = $4
         LIMIT 1`,
        [chainId, campaignAddress, session.wallet_address, clientNonce]
      );
      if (existing.rows[0]) {
        return json(res, 200, { item: mapMessageRow(existing.rows[0]), duplicate: true });
      }
    }

    let inserted;
    try {
      inserted = await pool.query(
        `INSERT INTO public.chat_messages (
          chain_id, campaign_address, wallet_address, display_name, avatar_url, role, message, client_nonce
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, chain_id, campaign_address, wallet_address, display_name, avatar_url, role, message, client_nonce, created_at`,
        [
          chainId,
          campaignAddress,
          session.wallet_address,
          session.display_name || null,
          session.avatar_url || null,
          session.role || "trader",
          text,
          clientNonce,
        ]
      );
    } catch (e) {
      if (e?.code === "23505" && clientNonce) {
        const existing = await pool.query(
          `SELECT id, chain_id, campaign_address, wallet_address, display_name, avatar_url, role, message, client_nonce, created_at
           FROM public.chat_messages
           WHERE chain_id = $1 AND campaign_address = $2 AND wallet_address = $3 AND client_nonce = $4
           LIMIT 1`,
          [chainId, campaignAddress, session.wallet_address, clientNonce]
        );
        if (existing.rows[0]) {
          return json(res, 200, { item: mapMessageRow(existing.rows[0]), duplicate: true });
        }
      }
      throw e;
    }

    const item = mapMessageRow(inserted.rows[0]);
    await maybePublishChatMessage({ chainId, campaignAddress, message: item });
    return json(res, 200, { item });
  } catch (e) {
    const msg = String(e?.message ?? "");
    const status = /session/i.test(msg) ? 401 : /muted|slow down/i.test(msg) ? 429 : /message/i.test(msg) ? 400 : 500;
    console.error("[api/chat/send]", e);
    return json(res, status, {
      error: status >= 500 ? "Server error" : msg,
      details: process.env.NODE_ENV !== "production" ? msg : undefined,
    });
  }
}
