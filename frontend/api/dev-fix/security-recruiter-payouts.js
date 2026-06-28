import { pool } from "../../server/db.js";
import { badMethod, json, readJson } from "../../server/http.js";

const CHAINS = [
  { chain: "bnb", token: "BNB" },
  { chain: "solana", token: "SOL" },
];

const CLAIM_STATUSES = new Set(["created", "submitted", "confirmed", "failed", "retriable"]);

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function rawAmount(value) {
  if (value == null) return "0";
  return String(value).replace(/\.0+$/, "");
}

function normalizeClaimStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return CLAIM_STATUSES.has(status) ? status : "";
}

function balanceStatus({ claimableRaw, pendingRaw, payoutWallet }) {
  const claimable = BigInt(claimableRaw || "0");
  const pending = BigInt(pendingRaw || "0");
  if (!payoutWallet && (claimable > 0n || pending > 0n)) return "missing_payout_wallet";
  if (claimable > 0n) return "claimable";
  if (pending > 0n) return "pending_finality";
  return payoutWallet ? "pending_finality" : "missing_payout_wallet";
}

function emptyBalances(payoutWallets = new Map()) {
  return CHAINS.map(({ chain, token }) => ({
    chain,
    token,
    claimableRaw: "0",
    pendingRaw: "0",
    payoutWallet: payoutWallets.get(chain) || null,
    status: payoutWallets.get(chain) ? "pending_finality" : "missing_payout_wallet",
  }));
}

function claimShape(row) {
  return {
    id: String(row.id),
    recruiterId: String(row.recruiter_id),
    chain: row.chain,
    token: row.token,
    amountRaw: rawAmount(row.amount_raw),
    payoutWallet: row.payout_wallet,
    status: row.status,
    txHash: row.tx_hash || null,
    error: row.error || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function auditAction({ action, target, oldValue = "", newValue = "", reason = "", txHash = null }) {
  await pool.query(
    `insert into public.security_actions (admin_email, action, target, old_value, new_value, reason, tx_hash, source_system)
     values ($1, $2, $3, $4, $5, $6, $7, 'web-dashboard')`,
    [process.env.SECURITY_ADMIN_EMAIL || "ops@memewar.zone", action, target, oldValue, newValue, reason, txHash],
  );
}

async function loadPayoutState() {
  const { rows } = await pool.query(
    `with ledger as (
       select recruiter_id,
              chain,
              token,
              coalesce(sum(amount_raw) filter (where status in ('claimable', 'retriable') and claim_id is null), 0)::numeric(78,0) as claimable_raw,
              coalesce(sum(amount_raw) filter (where status in ('pending', 'pending_finality')), 0)::numeric(78,0) as pending_raw
         from public.recruiter_reward_ledger
        group by recruiter_id, chain, token
     ), wallets as (
       select recruiter_id,
              chain,
              max(wallet_address) filter (where verified_at is not null) as payout_wallet
         from public.recruiter_payout_wallets
        group by recruiter_id, chain
     )
     select a.recruiter_id,
            a.code,
            a.display_name,
            coalesce(a.total_estimated_usd, 0)::float8 as total_estimated_usd,
            l.chain,
            l.token,
            l.claimable_raw::text as claimable_raw,
            l.pending_raw::text as pending_raw,
            w.payout_wallet
       from public.recruiter_accounts a
       left join ledger l on l.recruiter_id = a.recruiter_id
       left join wallets w on w.recruiter_id = a.recruiter_id and w.chain = l.chain
      order by a.updated_at desc nulls last, a.created_at desc
      limit 250`,
  );

  const claimsResult = await pool.query(
    `select id, recruiter_id, chain, token, amount_raw::text as amount_raw, payout_wallet, status, tx_hash, error, created_at, updated_at
       from public.recruiter_reward_claims
      order by created_at desc
      limit 250`,
  );

  const recruiters = new Map();

  for (const row of rows) {
    const recruiterId = String(row.recruiter_id);
    if (!recruiters.has(recruiterId)) {
      recruiters.set(recruiterId, {
        recruiterId,
        code: row.code || null,
        displayName: row.display_name || null,
        totalEstimatedUsd: Number(row.total_estimated_usd || 0),
        balances: [],
        claims: [],
      });
    }

    if (!row.chain) continue;

    const claimableRaw = rawAmount(row.claimable_raw);
    const pendingRaw = rawAmount(row.pending_raw);
    const payoutWallet = row.payout_wallet || null;
    recruiters.get(recruiterId).balances.push({
      chain: row.chain,
      token: row.token || (row.chain === "solana" ? "SOL" : "BNB"),
      claimableRaw,
      pendingRaw,
      payoutWallet,
      status: balanceStatus({ claimableRaw, pendingRaw, payoutWallet }),
    });
  }

  for (const claim of claimsResult.rows.map(claimShape)) {
    if (!recruiters.has(claim.recruiterId)) continue;
    recruiters.get(claim.recruiterId).claims.push(claim);
  }

  const items = Array.from(recruiters.values()).map((recruiter) => {
    const existing = new Set(recruiter.balances.map((balance) => balance.chain));
    const payoutWallets = new Map(recruiter.balances.map((balance) => [balance.chain, balance.payoutWallet]));
    const missing = emptyBalances(payoutWallets).filter((balance) => !existing.has(balance.chain));
    return { ...recruiter, balances: [...recruiter.balances, ...missing] };
  });

  return { recruiters: items };
}

async function updateClaim(req, res) {
  const body = await readJson(req);
  const action = String(body.action || "").trim();
  const claimId = String(body.claimId || "").trim();
  const reason = String(body.reason || "").trim();
  const txHash = String(body.txHash || "").trim() || null;
  const errorMessage = String(body.error || "").trim() || null;
  if (!claimId) return json(res, 400, { error: "Missing claimId" });
  if (!reason) return json(res, 400, { error: "Reason is required for payout claim admin actions." });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      `select id, recruiter_id, chain, token, amount_raw::text as amount_raw, payout_wallet, status, tx_hash
         from public.recruiter_reward_claims
        where id = $1
        for update`,
      [claimId],
    );
    const claim = current.rows[0];
    if (!claim) {
      await client.query("rollback");
      return json(res, 404, { error: "Claim not found" });
    }

    let nextStatus = "";
    let ledgerStatus = "";
    let clearClaimId = false;
    if (action === "mark-submitted") {
      nextStatus = "submitted";
      ledgerStatus = "submitted";
    } else if (action === "mark-confirmed") {
      nextStatus = "confirmed";
      ledgerStatus = "claimed";
    } else if (action === "mark-retriable") {
      nextStatus = "retriable";
      ledgerStatus = "claimable";
      clearClaimId = true;
    } else if (action === "mark-failed") {
      nextStatus = "failed";
      ledgerStatus = "failed";
    } else {
      nextStatus = normalizeClaimStatus(body.status);
      if (!nextStatus) {
        await client.query("rollback");
        return json(res, 400, { error: "Unsupported payout claim action" });
      }
      ledgerStatus = nextStatus === "confirmed" ? "claimed" : nextStatus;
    }

    const updated = await client.query(
      `update public.recruiter_reward_claims
          set status = $2,
              tx_hash = coalesce($3, tx_hash),
              error = $4,
              updated_at = now()
        where id = $1
        returning id, recruiter_id, chain, token, amount_raw::text as amount_raw, payout_wallet, status, tx_hash, error, created_at, updated_at`,
      [claimId, nextStatus, txHash, errorMessage],
    );

    if (clearClaimId) {
      await client.query(`update public.recruiter_reward_ledger set status = $2, claim_id = null, updated_at = now() where claim_id = $1`, [claimId, ledgerStatus]);
    } else {
      await client.query(`update public.recruiter_reward_ledger set status = $2, updated_at = now() where claim_id = $1`, [claimId, ledgerStatus]);
    }

    await client.query(
      `insert into public.security_actions (admin_email, action, target, old_value, new_value, reason, tx_hash, source_system)
       values ($1, $2, $3, $4, $5, $6, $7, 'web-dashboard')`,
      [process.env.SECURITY_ADMIN_EMAIL || "ops@memewar.zone", `recruiter-payout-${action}`, claimId, claim.status, nextStatus, reason, txHash],
    );
    await client.query("commit");

    return json(res, 200, { ok: true, claim: claimShape(updated.rows[0]) });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export default async function securityRecruiterPayouts(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;

  try {
    if (req.method === "POST") return updateClaim(req, res);
    return json(res, 200, await loadPayoutState());
  } catch (error) {
    if (!schemaMissing(error)) console.error("[security] recruiter payouts failed", error);
    return json(res, 200, { recruiters: [], schemaReady: false });
  }
}
