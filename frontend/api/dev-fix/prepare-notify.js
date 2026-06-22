import { isSolanaChain, normalizeAddress as centralNormalize } from "../../server/http.js";

function normalizeAddress(value, chainId) {
  // Use central server normalizer for full Solana (raw base58) + EVM support
  return centralNormalize(value, chainId);
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
  const chainId = draft?.chainId ?? draft?.chain_id ?? null;
  const owner = normalizeAddress(draft?.creatorWallet || draft?.creator_wallet, chainId);
  if (!owner) return null;

  return insertPrepareNotification(pool, {
    walletAddress: owner,
    targetType: "draft",
    targetId: String(draft?.id || ""),
    ...input,
  });
}

export async function notifyDraftSubscribers(pool, draft, input) {
  if (!pool || !draft?.id) return { count: 0 };

  try {
    await pool.query(`
      create table if not exists public.campaign_draft_notification_subscriptions (
        draft_id uuid not null references public.campaign_drafts(id) on delete cascade,
        wallet_address text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (draft_id, wallet_address)
      )
    `);

    const chainId = draft?.chainId ?? draft?.chain_id ?? null;
    const owner = normalizeAddress(draft?.creatorWallet || draft?.creator_wallet, chainId);
    const result = await pool.query(
      `select wallet_address
         from public.campaign_draft_notification_subscriptions
        where draft_id = $1`,
      [String(draft.id)],
    );

    let count = 0;
    for (const row of result.rows) {
      const wallet = normalizeAddress(row.wallet_address, chainId);
      if (!wallet || (owner && wallet === owner)) continue;
      const inserted = await insertPrepareNotification(pool, {
        walletAddress: wallet,
        targetType: "draft",
        targetId: String(draft.id),
        ...input,
      });
      if (inserted) count += 1;
    }

    return { count };
  } catch (err) {
    console.warn("[prepare-notify] failed to notify subscribers", err?.message || err);
    return { count: 0 };
  }
}
