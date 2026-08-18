import { ethers } from "ethers";
import { pool } from "../../server/db.js";
import { getServerReadProvider } from "./getServerReadProvider.js";

const VOTE_TREASURY_ABI = ["function feeReceiver() view returns (address)"];

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function configuredAddress(chainId, name) {
  const id = Number(chainId);
  return firstEnv(
    `${name}_${id}`,
    `VITE_${name}_${id}`,
    ...(id === 56 ? [name, `VITE_${name}`] : []),
  );
}

export async function readNativeUpvoteRevenue(network) {
  if (network.chain !== "bnb") return { approved: false, aggregate: null, reason: "CHAIN_NOT_SUPPORTED" };

  const voteTreasury = configuredAddress(network.chainId, "VOTE_TREASURY_ADDRESS");
  const protocolRevenueVault = configuredAddress(network.chainId, "PROTOCOL_REVENUE_VAULT_ADDRESS");
  if (!ethers.isAddress(voteTreasury) || !ethers.isAddress(protocolRevenueVault)) {
    return { approved: false, aggregate: null, reason: "REVENUE_DESTINATION_NOT_CONFIGURED" };
  }

  const provider = await getServerReadProvider(network.chainId);
  const treasury = new ethers.Contract(voteTreasury, VOTE_TREASURY_ABI, provider);
  const receiver = String(await treasury.feeReceiver()).toLowerCase();
  if (receiver !== protocolRevenueVault.toLowerCase()) {
    return { approved: false, aggregate: null, reason: "FEE_RECEIVER_NOT_PROTOCOL_REVENUE_VAULT" };
  }

  const { rows } = await pool.query(
    `select min(block_timestamp) as period_start,
            max(block_timestamp) as period_end,
            count(*)::int as evidence_count,
            coalesce(sum(amount_raw), 0)::text as amount_raw
       from public.votes
      where chain_id = $1
        and status = 'confirmed'
        and lower(asset_address) = lower($2)`,
    [network.chainId, ethers.ZeroAddress],
  );
  const row = rows[0] || {};
  const raw = String(row.amount_raw || "0");
  if (!/^\d+$/.test(raw) || BigInt(raw) === 0n || !row.period_start || !row.period_end) {
    return { approved: true, aggregate: null, reason: null };
  }

  return {
    approved: true,
    reason: null,
    aggregate: {
      amountRaw: raw,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      evidenceCount: Number(row.evidence_count || 0),
    },
  };
}
