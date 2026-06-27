import { pool } from "../../server/db.js";
import { badMethod, json } from "../../server/http.js";

const CHAINS = [
  { chain: "bnb", token: "BNB" },
  { chain: "solana", token: "SOL" },
];

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

function balanceStatus({ claimableRaw, pendingRaw, payoutWallet }) {
  const claimable = BigInt(claimableRaw || "0");
  const pending = BigInt(pendingRaw || "0");
  if (!payoutWallet && (claimable > 0n || pending > 0n)) return "missing_payout_wallet";
  if (claimable > 0n) return "claimable";
  if (pending > 0n) return "pending_finality";
  return "pending_finality";
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

export default async function securityRecruiterPayouts(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  try {
    const { rows } = await pool.query(
      `with ledger as (
         select recruiter_id,
                chain,
                token,
                coalesce(sum(amount_raw) filter (where status = 'claimable'), 0)::numeric(78,0) as claimable_raw,
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

    const items = Array.from(recruiters.values()).map((recruiter) => {
      const existing = new Set(recruiter.balances.map((balance) => balance.chain));
      const payoutWallets = new Map(recruiter.balances.map((balance) => [balance.chain, balance.payoutWallet]));
      const missing = emptyBalances(payoutWallets).filter((balance) => !existing.has(balance.chain));
      return { ...recruiter, balances: [...recruiter.balances, ...missing] };
    });

    return json(res, 200, { recruiters: items });
  } catch (error) {
    if (!schemaMissing(error)) console.error("[security] recruiter payouts failed", error);
    return json(res, 200, { recruiters: [], schemaReady: false });
  }
}
