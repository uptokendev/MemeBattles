import { isAddress } from "../../server/http.js";

function normalizeAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function cleanText(value, max = 600) {
  return String(value || "").trim().slice(0, max);
}

export async function insertPrepareNotification(pool, input) {
  if (!pool) return null;

  const wallet = normalizeAddress(input?.walletAddress);
  if (!wallet) return null;

  const eventType = cleanText(input?.eventType || "prepare", 80) || "prepare";
  const targetType = cleanText(input?.targetType || "draft", 80) || "draft";
  const targetId = cleanText(input?.targetId || "", 120);
  const title = cleanText(input?.title || "Prepare Mode update", 160) || "Prepare Mode update";
  const body = cleanText(input?.body || "", 600);
  const metadata = input?.metadata && typeof input.metadata === "object" ? input.metadata : {};

  if (!targetId) return null;

  try {
    const result = await pool.query(
      `insert into public.prepare_mode_notifications
        (wallet_address, event_type, target_type, target_id, title, body, metadata_json)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       returning id`,
      [wallet, eventType, targetType, targetId, title, body, JSON.stringify(metadata)],
    );

    return result.rows[0] || null;
  } catch (err) {
    console.warn("[prepare-notify] failed to insert notification", err?.message || err);
    return null;
  }
}

export async function notifyDraftOwner(pool, draft, input) {
  const owner = normalizeAddress(draft?.creatorWallet || draft?.creator_wallet);
  if (!owner) return null;

  return insertPrepareNotification(pool, {
    walletAddress: owner,
    targetType: "draft",
    targetId: String(draft?.id || ""),
    ...input,
  });
}
