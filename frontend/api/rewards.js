import { pool } from "../server/db.js";
import {
  badMethod,
  getQuery,
  isAddress,
  isSolanaAddress,
  json,
  normalizeWalletFlexible,
  readJson,
} from "../server/http.js";
import { discoverSolanaRewardClaim } from "./lib/solanaRewardReconciliation.js";

const SOLANA_CHAINS = new Set([101, 102]);
const RECOVERABLE_REWARD_TYPES = new Set(["airdrop", "squad"]);
const RECOVERABLE_STATUSES = new Set(["claim_pending", "failed"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function refreshBatchCounts(client, rewardLedgerId) {
  const { rows } = await client.query(
    `select distinct batch_id
       from public.reward_batch_items
      where reward_ledger_id = $1::uuid
        and batch_id is not null`,
    [rewardLedgerId],
  );

  for (const row of rows) {
    await client.query(
      `update public.reward_batches rb
          set recipient_count = stats.recipient_count,
              claimable_count = stats.claimable_count,
              claimed_count = stats.claimed_count,
              failed_count = stats.failed_count,
              metadata = coalesce(rb.metadata, '{}'::jsonb) || jsonb_build_object(
                'claimPendingCount', stats.claim_pending_count,
                'claimPendingAmount', stats.claim_pending_amount,
                'lastClaimStatusRefreshAt', now()
              ),
              updated_at = now()
         from (
           select count(*)::int as recipient_count,
                  count(*) filter (where coalesce(rl.status, rbi.status) = 'claimable')::int as claimable_count,
                  count(*) filter (where coalesce(rl.status, rbi.status) = 'claim_pending')::int as claim_pending_count,
                  count(*) filter (where coalesce(rl.status, rbi.status) = 'claimed')::int as claimed_count,
                  count(*) filter (where coalesce(rl.status, rbi.status) = 'failed')::int as failed_count,
                  coalesce(sum(coalesce(rl.amount, rbi.amount)) filter (where coalesce(rl.status, rbi.status) = 'claim_pending'), 0)::text as claim_pending_amount
             from public.reward_batch_items rbi
             left join public.reward_ledger rl on rl.id = rbi.reward_ledger_id
            where rbi.batch_id = $1::uuid
         ) stats
        where rb.id = $1::uuid`,
      [row.batch_id],
    );
  }
}

async function finalizeRecoveredClaim(row, verification) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      `select *
         from public.reward_ledger
        where id = $1::uuid
        for update`,
      [row.id],
    );
    const current = rows[0];
    if (!current) {
      await client.query("rollback");
      return { rewardLedgerId: String(row.id), status: "missing" };
    }

    if (String(current.wallet_address || "") !== String(row.wallet_address || "") || Number(current.chain) !== Number(row.chain)) {
      const error = new Error("Reward entitlement changed during reconciliation");
      error.code = "REWARD_RECONCILE_ROW_CHANGED";
      throw error;
    }

    if (current.status === "claimed") {
      await client.query("commit");
      return {
        rewardLedgerId: String(current.id),
        status: "already_claimed",
        txHash: current.claim_tx_hash || verification.txHash,
      };
    }

    if (!RECOVERABLE_STATUSES.has(String(current.status || ""))) {
      await client.query("commit");
      return { rewardLedgerId: String(current.id), status: "not_recoverable" };
    }

    const reused = await client.query(
      `select id
         from public.reward_ledger
        where claim_tx_hash = $1
          and id <> $2::uuid
        limit 1`,
      [verification.txHash, current.id],
    );
    if (reused.rows.length) {
      const error = new Error("Confirmed Solana claim signature is already attached to another reward entitlement");
      error.code = "SOLANA_CLAIM_TX_REUSED";
      throw error;
    }

    const reconciledAt = new Date().toISOString();
    const claimVerification = {
      ...verification,
      reconciliationSource: "deterministic_claim_receipt",
      reconciledAt,
    };

    await client.query(
      `update public.reward_ledger
          set status = 'claimed',
              claim_tx_hash = $2,
              claim_error = null,
              claimed_at = coalesce(claimed_at, now()),
              metadata = coalesce(metadata, '{}'::jsonb)
                || jsonb_build_object(
                  'claimVerification', $3::jsonb,
                  'claimReconciledAt', $4::text
                ),
              updated_at = now()
        where id = $1::uuid`,
      [current.id, verification.txHash, JSON.stringify(claimVerification), reconciledAt],
    );

    await client.query(
      `update public.reward_batch_items
          set status = 'claimed',
              updated_at = now()
        where reward_ledger_id = $1::uuid`,
      [current.id],
    );

    await client.query(
      `insert into public.reward_audit_logs
        (reward_ledger_id, actor_type, actor_id, action, old_value, new_value, reason, tx_hash, metadata)
       values
        ($1::uuid, 'system', 'solana-reconciler', 'claim_reconciled_onchain', $2, 'claimed',
         'Recovered confirmed Solana claim from deterministic receipt PDA', $3, $4::jsonb)`,
      [current.id, current.status, verification.txHash, JSON.stringify(claimVerification)],
    );

    await refreshBatchCounts(client, current.id);
    await client.query("commit");
    return {
      rewardLedgerId: String(current.id),
      status: "reconciled",
      txHash: verification.txHash,
      claimReceiptAddress: verification.claimReceiptAddress || null,
      slot: verification.slot ?? null,
    };
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function reconcileSolanaClaims(req, res) {
  if (!pool) return json(res, 500, { error: "Server misconfigured: DATABASE_URL missing" });
  const body = await readJson(req);
  if (String(body?.action || "") !== "reconcile-solana-claims") {
    return json(res, 400, { error: "Unsupported rewards action" });
  }

  const chainId = Number(body?.chainId);
  const walletAddress = normalizeWalletFlexible(body?.walletAddress || body?.address);
  const rawIds = Array.isArray(body?.rewardLedgerIds) ? body.rewardLedgerIds : [];
  const rewardLedgerIds = Array.from(new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean)));

  if (!SOLANA_CHAINS.has(chainId)) return json(res, 400, { error: "Reconciliation is only available for Solana reward chains" });
  if (!walletAddress || !isSolanaAddress(walletAddress)) return json(res, 400, { error: "Invalid Solana wallet address" });
  if (!rewardLedgerIds.length) return json(res, 200, { reconciledCount: 0, items: [], unresolved: [] });
  if (rewardLedgerIds.length > 10) return json(res, 400, { error: "At most 10 reward claims can be reconciled per request" });
  if (rewardLedgerIds.some((id) => !UUID_RE.test(id))) return json(res, 400, { error: "Invalid reward ledger id" });

  try {
    const { rows } = await pool.query(
      `select *
         from public.reward_ledger
        where id = any($1::uuid[])
          and wallet_address = $2
          and chain::text = $3::text
          and reward_type = any($4::text[])
          and status = any($5::text[])
        order by created_at asc`,
      [
        rewardLedgerIds,
        walletAddress,
        String(chainId),
        Array.from(RECOVERABLE_REWARD_TYPES),
        Array.from(RECOVERABLE_STATUSES),
      ],
    );

    const items = [];
    const unresolved = [];

    // Keep these sequential: each strict verification may perform multiple RPC reads and
    // there are deliberately only a few incentive cards per wallet. This prevents a page
    // refresh from creating an RPC burst during recovery.
    for (const row of rows) {
      try {
        const verification = await discoverSolanaRewardClaim({
          row,
          walletAddress,
          signatureLimit: 8,
        });
        if (!verification) {
          unresolved.push({
            rewardLedgerId: String(row.id),
            reason: "receipt_missing",
            code: "SOLANA_CLAIM_RECEIPT_MISSING",
          });
          continue;
        }
        items.push(await finalizeRecoveredClaim(row, verification));
      } catch (error) {
        console.warn(`[api/rewards] Solana reconciliation deferred for ${row.id}:`, error?.code || error?.message || error);
        unresolved.push({
          rewardLedgerId: String(row.id),
          reason: "verification_pending",
          code: error?.code || "SOLANA_CLAIM_RECONCILE_PENDING",
        });
      }
    }

    return json(res, 200, {
      walletAddress,
      chainId,
      requestedCount: rewardLedgerIds.length,
      checkedCount: rows.length,
      reconciledCount: items.filter((item) => item.status === "reconciled").length,
      items,
      unresolved,
      reconciledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/rewards:reconcile]", error);
    if (error?.code === "42P01" || error?.code === "42703") {
      return json(res, 503, { error: "Reward reconciliation schema is not installed", code: "REWARD_SCHEMA_MISSING" });
    }
    return json(res, 500, { error: "Server error", code: error?.code || "REWARD_RECONCILE_FAILED" });
  }
}

// GET /api/rewards?chainId=56&address=0x...
// Returns *unclaimed* League prizes for the recipient.
// POST /api/rewards with action=reconcile-solana-claims is a proof-only state repair:
// it cannot move funds and only advances stale DB state after strict on-chain verification.
export default async function handler(req, res) {
  if (req.method === "POST") return reconcileSolanaClaims(req, res);
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const address = normalizeWalletFlexible(q.address);
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!address || (!isAddress(address) && !isSolanaAddress(address))) {
      return json(res, 400, { error: "Invalid address" });
    }
    if (!pool) return json(res, 500, { error: "Server misconfigured: DATABASE_URL missing" });

    const recipientClause = isSolanaAddress(address)
      ? "(w.recipient_address = $2 OR lower(w.recipient_address) = lower($2))"
      : "lower(w.recipient_address) = $2";

    const { rows } = await pool.query(
      `SELECT
          w.period,
          w.epoch_start AS "epochStart",
          w.epoch_end AS "epochEnd",
          w.expires_at AS "expiresAt",
          w.category,
          w.rank,
          w.amount_raw AS "amountRaw",
          w.payload,
          w.computed_at AS "computedAt"
        FROM league_epoch_winners w
        LEFT JOIN league_epoch_claims c
          ON c.chain_id = w.chain_id
         AND c.period = w.period
         AND c.epoch_start = w.epoch_start
         AND c.category = w.category
         AND c.rank = w.rank
        WHERE w.chain_id = $1
          AND ${recipientClause}
          AND c.claimed_at IS NULL
          AND (w.expires_at IS NULL OR w.expires_at > NOW())
        ORDER BY w.epoch_start DESC, w.period DESC, w.category ASC, w.rank ASC`,
      [chainId, address]
    );

    return json(res, 200, {
      address,
      chainId,
      rewards: rows.map((r) => ({
        period: r.period,
        epochStart: r.epochStart,
        epochEnd: r.epochEnd,
        expiresAt: r.expiresAt,
        category: r.category,
        rank: r.rank,
        amountRaw: r.amountRaw,
        payload: r.payload,
        computedAt: r.computedAt,
      })),
    });
  } catch (e) {
    const code = e?.code;
    console.error("[api/rewards]", e);
    if (code === "42P01" || code === "42703") {
      return json(res, 200, { rewards: [], warning: "DB schema missing league epoch tables" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
