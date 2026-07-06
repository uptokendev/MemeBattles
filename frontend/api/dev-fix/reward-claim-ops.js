import { pool } from "../../server/db.js";
import { readJson } from "../../server/http.js";

function methodAllowed(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: "Method not allowed" });
  return false;
}

function json(res, status, payload) {
  return res.status(status).json({ ok: status < 400, ...payload });
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function readMeta(row) {
  const meta = row?.metadata;
  if (!meta) return {};
  if (typeof meta === "object") return meta;
  try {
    const parsed = JSON.parse(String(meta));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function ledgerItem(row) {
  return {
    id: String(row.id),
    rewardType: row.reward_type,
    sourceId: row.source_id || null,
    sourceLabel: row.source_label || null,
    walletAddress: row.wallet_address,
    userId: row.user_id || null,
    chain: row.chain,
    chainId: Number(row.chain) || null,
    tokenSymbol: row.token_symbol,
    amount: String(row.amount ?? "0"),
    amountUsd: row.amount_usd == null ? null : String(row.amount_usd),
    status: row.status,
    claimBatchId: row.claim_batch_id || null,
    claimTxHash: row.claim_tx_hash || null,
    claimError: row.claim_error || null,
    metadata: readMeta(row),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    claimableAt: toIso(row.claimable_at),
    claimedAt: toIso(row.claimed_at),
    expiresAt: toIso(row.expires_at),
  };
}

function actorId(req) {
  return String(req?.headers?.["x-admin-email"] || req?.headers?.["x-user-email"] || "api");
}

async function writeAudit(client, { rewardLedgerId, action, oldValue, newValue, reason, txHash, req, metadata = {} }) {
  const { rows } = await client.query(`select batch_id from public.reward_batch_items where reward_ledger_id = $1::uuid limit 1`, [rewardLedgerId]);
  await client.query(
    `insert into public.reward_audit_logs (batch_id, reward_ledger_id, actor_type, actor_id, action, old_value, new_value, reason, tx_hash, metadata)
     values ($1, $2, 'api', $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [rows[0]?.batch_id || null, rewardLedgerId, actorId(req), action, oldValue, newValue, reason, txHash || null, JSON.stringify(metadata || {})],
  );
}

async function refreshBatchCounts(client, rewardLedgerId) {
  const { rows } = await client.query(`select batch_id from public.reward_batch_items where reward_ledger_id = $1::uuid limit 1`, [rewardLedgerId]);
  const batchId = rows[0]?.batch_id;
  if (!batchId) return;

  await client.query(
    `update public.reward_batches rb
        set recipient_count = stats.recipient_count,
            claimable_count = stats.claimable_count,
            claimed_count = stats.claimed_count,
            failed_count = stats.failed_count,
            updated_at = now()
       from (
         select count(*)::int as recipient_count,
                count(*) filter (where coalesce(rl.status, rbi.status) = 'claimable')::int as claimable_count,
                count(*) filter (where coalesce(rl.status, rbi.status) = 'claimed')::int as claimed_count,
                count(*) filter (where coalesce(rl.status, rbi.status) = 'failed')::int as failed_count
           from public.reward_batch_items rbi
           left join public.reward_ledger rl on rl.id = rbi.reward_ledger_id
          where rbi.batch_id = $1::uuid
       ) stats
      where rb.id = $1::uuid`,
    [batchId],
  );
}

async function updateClaimStatus(req, res, targetStatus) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const id = String(req.params?.id || body.rewardLedgerId || body.id || "").trim();
  if (!id) return json(res, 400, { error: "Missing reward ledger id" });

  const txHash = String(body.txHash || body.claimTxHash || "").trim() || null;
  const claimError = String(body.claimError || body.error || "").trim() || null;
  if (targetStatus === "claimed" && !txHash) return json(res, 400, { error: "Missing txHash for claimed reward" });
  if (targetStatus === "failed" && !claimError) return json(res, 400, { error: "Missing claimError for failed reward" });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: beforeRows } = await client.query(`select * from public.reward_ledger where id = $1::uuid for update`, [id]);
    const before = beforeRows[0];
    if (!before) {
      await client.query("rollback");
      return json(res, 404, { error: "Reward ledger entry not found" });
    }

    if (Number(before.chain) === 101 || String(before.chain).toLowerCase() === "solana") {
      await client.query("rollback");
      return json(res, 409, { error: "Solana reward claiming is not enabled yet." });
    }

    const { rows } = await client.query(
      `update public.reward_ledger
          set status = $2,
              claim_tx_hash = case when $2 = 'claimed' then $3 else claim_tx_hash end,
              claim_error = case when $2 = 'failed' then $4 else null end,
              claimed_at = case when $2 = 'claimed' then coalesce(claimed_at, now()) else claimed_at end,
              updated_at = now()
        where id = $1::uuid
          and status in ('claimable', 'claim_pending', 'failed')
        returning *`,
      [id, targetStatus, txHash, claimError],
    );

    if (!rows[0]) {
      await client.query("rollback");
      return json(res, 409, { error: `Reward cannot move from ${before.status} to ${targetStatus}` });
    }

    await client.query(
      `update public.reward_batch_items
          set status = $2
        where reward_ledger_id = $1::uuid`,
      [id, targetStatus],
    );
    await refreshBatchCounts(client, id);
    await writeAudit(client, {
      rewardLedgerId: id,
      action: targetStatus === "claimed" ? "claim_completed" : "claim_failed",
      oldValue: before.status,
      newValue: targetStatus,
      reason: body.reason || (targetStatus === "claimed" ? "Claim transaction confirmed" : "Claim transaction failed"),
      txHash,
      req,
      metadata: { claimError },
    });
    await client.query("commit");
    return json(res, 200, { item: ledgerItem(rows[0]), materializedAt: new Date().toISOString() });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (schemaMissing(error)) return json(res, 503, { error: "Reward ledger schema is not installed.", code: "REWARD_SCHEMA_MISSING" });
    console.error(`[internal/reward-claim-${targetStatus}]`, error);
    return json(res, 500, { error: "Server error" });
  } finally {
    client.release();
  }
}

export async function internalRewardClaimComplete(req, res) {
  return updateClaimStatus(req, res, "claimed");
}

export async function internalRewardClaimFail(req, res) {
  return updateClaimStatus(req, res, "failed");
}
