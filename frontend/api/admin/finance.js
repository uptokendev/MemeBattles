import { pool } from "../../server/db.js";
import { requireAdminOrOps } from "../lib/apiAuth.js";

const FINANCE_NETWORKS = new Map([
  [56, { chain: "bnb", decimals: 18, asset: "BNB", environment: "mainnet" }],
  [97, { chain: "bnb", decimals: 18, asset: "BNB", environment: "testnet" }],
  [101, { chain: "solana", decimals: 9, asset: "SOL", environment: "devnet" }],
  [102, { chain: "solana", decimals: 9, asset: "SOL", environment: "mainnet" }],
]);

function methodAllowed(req, res) {
  if (String(req.method || "GET").toUpperCase() === "GET") return true;
  res.setHeader("Allow", "GET");
  res.status(405).json({ ok: false, error: "Method not allowed" });
  return false;
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function atomicToDecimal(value, decimals) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const normalized = raw.replace(/^0+(?=\d)/, "") || "0";
  if (normalized === "0") return "0";
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function safeAsset(value, fallback) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9._-]{1,20}$/.test(text) ? text : fallback;
}

function selectedNetwork(req) {
  const chainId = Number(req.query?.chainId ?? 97);
  const network = FINANCE_NETWORKS.get(chainId);
  if (!network) return null;
  return { chainId, ...network };
}

function rewardState(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "allocated") return "allocated";
  if (normalized === "claimable") return "claimable";
  if (normalized === "claimed") return "claimed";
  if (normalized === "expired") return "expired";
  if (normalized === "returned" || normalized === "rolled_over") return "returned";
  if (normalized === "claim_pending" || normalized === "pending" || normalized === "failed") return "pending";
  return null;
}

function rewardChainCandidates(chainId) {
  if (chainId === 101) return ["101", "solana", "solana-devnet"];
  if (chainId === 102) return ["102", "solana-mainnet"];
  return [String(chainId)];
}

async function financeRewards(req, res, network) {
  try {
    const { rows } = await pool.query(
      `select chain::text as chain,
              coalesce(nullif(token_symbol, ''), '') as token_symbol,
              reward_type,
              status,
              count(*)::int as evidence_count,
              count(distinct wallet_address)::int as recipient_count,
              coalesce(sum(amount), 0)::text as amount_raw,
              min(created_at) as period_start,
              max(coalesce(claimed_at, updated_at, created_at)) as period_end
         from public.reward_ledger
        where chain::text = any($1::text[])
        group by chain::text, token_symbol, reward_type, status
        order by period_end desc nulls last`,
      [rewardChainCandidates(network.chainId)],
    );

    const aggregates = [];
    for (const [index, row] of rows.entries()) {
      const state = rewardState(row.status);
      const nativeAmount = atomicToDecimal(row.amount_raw, network.decimals);
      const periodStart = toIso(row.period_start);
      const periodEnd = toIso(row.period_end);
      if (!state || nativeAmount == null || !periodStart || !periodEnd) continue;

      aggregates.push({
        id: `reward:${network.chainId}:${String(row.reward_type || "unknown")}:${String(row.status || "unknown")}:${index}`,
        periodStart,
        periodEnd,
        chain: network.chain,
        program: String(row.reward_type || "reward"),
        assetSymbol: safeAsset(row.token_symbol, network.asset),
        state,
        nativeAmount,
        recipientCount: Number(row.recipient_count || 0),
        evidenceCount: Number(row.evidence_count || 0),
      });
    }

    return res.status(200).json({
      schemaVersion: "finance-rewards-v1",
      generatedAt: new Date().toISOString(),
      source: "dashboard-api",
      aggregates,
      coverage: [],
    });
  } catch (error) {
    if (schemaMissing(error)) {
      return res.status(200).json({
        schemaVersion: "finance-rewards-v1",
        generatedAt: new Date().toISOString(),
        source: "dashboard-api",
        aggregates: [],
        coverage: [],
      });
    }
    throw error;
  }
}

async function financeRevenue(req, res, network) {
  if (network.chain !== "bnb") {
    return res.status(200).json({
      schemaVersion: "finance-revenue-v1",
      generatedAt: new Date().toISOString(),
      source: "dashboard-api",
      aggregates: [],
      quarantine: [],
    });
  }

  try {
    const { rows } = await pool.query(
      `select min(occurred_at) as period_start,
              max(occurred_at) as period_end,
              count(*)::int as evidence_count,
              coalesce(sum(protocol_amount), 0)::text as amount_raw
         from public.reward_events
        where chain_id = $1
          and route_kind = 'trade'
          and protocol_amount > 0`,
      [network.chainId],
    );
    const row = rows[0] || {};
    const nativeAmount = atomicToDecimal(row.amount_raw, network.decimals);
    const periodStart = toIso(row.period_start);
    const periodEnd = toIso(row.period_end);
    const aggregates = nativeAmount && nativeAmount !== "0" && periodStart && periodEnd
      ? [{
          id: `bonding-route:${network.chainId}`,
          periodStart,
          periodEnd,
          chain: network.chain,
          lane: "bonding_curve_fee",
          assetSymbol: network.asset,
          sourceInventoryId: `treasury-router:${network.chainId}`,
          nativeAmount,
          evidenceCount: Number(row.evidence_count || 0),
        }]
      : [];

    return res.status(200).json({
      schemaVersion: "finance-revenue-v1",
      generatedAt: new Date().toISOString(),
      source: "dashboard-api",
      aggregates,
      quarantine: [],
    });
  } catch (error) {
    if (schemaMissing(error)) {
      return res.status(200).json({
        schemaVersion: "finance-revenue-v1",
        generatedAt: new Date().toISOString(),
        source: "dashboard-api",
        aggregates: [],
        quarantine: [],
      });
    }
    throw error;
  }
}

async function financeInventory(req, res, network) {
  const items = [];
  const seenAddresses = new Set();
  const add = (id, kind, label, address, role) => {
    const value = String(address || "").trim();
    if (!value) return;
    const key = `${network.chain}:${value.toLowerCase()}`;
    if (seenAddresses.has(key)) return;
    seenAddresses.add(key);
    items.push({
      id,
      chain: network.chain,
      kind,
      label,
      address: value,
      role,
      status: "configured",
    });
  };

  if (network.chain === "bnb") {
    const suffix = network.chainId === 97 ? "97" : "56";
    const env = (name) => process.env[`${name}_${suffix}`] || process.env[`VITE_${name}_${suffix}`] || (network.chainId === 56 ? process.env[name] || process.env[`VITE_${name}`] : undefined);
    add(`bnb${network.chainId}-factory`, "contract", "Launch Factory", env("FACTORY_ADDRESS"), "campaign creation authority");
    add(`bnb${network.chainId}-treasury-router`, "contract", "Treasury Router", env("TREASURY_ROUTER_ADDRESS"), "fee route authority");
    add(`bnb${network.chainId}-treasury-vault`, "vault", "Treasury Vault", env("TREASURY_VAULT_ADDRESS"), "treasury custody");
    add(`bnb${network.chainId}-protocol-revenue`, "vault", "Protocol Revenue Vault", env("PROTOCOL_REVENUE_VAULT_ADDRESS"), "protocol revenue custody");
    add(`bnb${network.chainId}-community-rewards`, "vault", "Community Rewards Vault", env("COMMUNITY_REWARDS_VAULT_ADDRESS"), "community reward obligations");
    add(`bnb${network.chainId}-recruiter-rewards`, "vault", "Recruiter Rewards Vault", env("RECRUITER_REWARDS_VAULT_ADDRESS"), "recruiter reward obligations");
    add(`bnb${network.chainId}-lp-locker`, "contract", "Permanent LP Locker", env("PERMANENT_LP_LOCKER_ADDRESS") || env("LP_LOCKER_ADDRESS"), "permanently locked graduation liquidity");
    add(`bnb${network.chainId}-vote-treasury`, "contract", "UP Vote Treasury", env("VOTE_TREASURY_ADDRESS"), "verified paid-vote collection");
  } else if (network.chainId === 101) {
    add("sol101-protocol-treasury", "wallet", "Solana Protocol Treasury", process.env.SOLANA_DEVNET_PROTOCOL_TREASURY_ADDRESS || process.env.SOLANA_PROTOCOL_TREASURY_ADDRESS || process.env.SOLANA_VOTE_TREASURY_ADDRESS, "protocol revenue destination");
    add("sol101-operator", "wallet", "Solana LP Operator", process.env.SOLANA_DEVNET_OPERATOR_ADDRESS || process.env.SOLANA_OPERATOR_ADDRESS || process.env.SOLANA_HARVEST_OPERATOR_ADDRESS, "Meteora position operator");
  } else {
    add("sol102-protocol-treasury", "wallet", "Solana Protocol Treasury", process.env.SOLANA_MAINNET_PROTOCOL_TREASURY_ADDRESS || process.env.SOLANA_MAINNET_VOTE_TREASURY_ADDRESS, "protocol revenue destination");
    add("sol102-operator", "wallet", "Solana LP Operator", process.env.SOLANA_MAINNET_OPERATOR_ADDRESS || process.env.SOLANA_MAINNET_HARVEST_OPERATOR_ADDRESS, "Meteora position operator");
  }

  return res.status(200).json({
    schemaVersion: "finance-inventory-v1",
    generatedAt: new Date().toISOString(),
    source: "dashboard-api",
    network: {
      chainId: network.chainId,
      chain: network.chain,
      environment: network.environment,
    },
    items,
  });
}

export default async function financeAdmin(req, res) {
  if (!methodAllowed(req, res)) return;
  const auth = await requireAdminOrOps(req, res, { routeLabel: "admin/finance", allowOps: true });
  if (!auth) return;

  const network = selectedNetwork(req);
  if (!network) {
    return res.status(400).json({ ok: false, error: "Finance network must be chainId 56, 97, 101, or 102." });
  }

  const pathname = String(req.path || new URL(req.url, "http://localhost").pathname);
  try {
    if (pathname === "/api/admin/finance/rewards") return await financeRewards(req, res, network);
    if (pathname === "/api/admin/finance/revenue") return await financeRevenue(req, res, network);
    if (pathname === "/api/admin/finance/inventory") return await financeInventory(req, res, network);
    return res.status(404).json({ ok: false, error: "Unknown finance admin route." });
  } catch (error) {
    console.error("[api/admin/finance]", pathname, error);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: "Finance read model failed." });
    }
  }
}
