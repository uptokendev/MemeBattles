import { ethers } from "ethers";

export type RewardItem = {
  period: "weekly" | "monthly";
  epochStart: string;
  epochEnd: string;
  expiresAt?: string | null;
  category: string;
  rank: number;
  amountRaw: string;
  payload: any;
  computedAt?: string;
};

export function buildLeagueClaimMessage(args: {
  chainId: number;
  recipient: string;
  period: "weekly" | "monthly";
  epochStart: string;
  category: string;
  rank: number;
  nonce: string;
}): string {
  const { chainId, recipient, period, epochStart, category, rank, nonce } = args;
  return [
    "MemeBattles League",
    "Action: LEAGUE_CLAIM",
    `ChainId: ${chainId}`,
    `Recipient: ${recipient.toLowerCase()}`,
    `Period: ${period}`,
    `EpochStart: ${epochStart}`,
    `Category: ${category}`,
    `Rank: ${rank}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export async function fetchClaimableRewards(chainId: number, address: string): Promise<RewardItem[]> {
  const qs = new URLSearchParams({ chainId: String(chainId), address: address.toLowerCase() });
  const r = await fetch(`/api/rewards?${qs.toString()}`);
  const j = await r.json();
  return Array.isArray(j?.rewards) ? (j.rewards as RewardItem[]) : [];
}

export async function submitLeagueClaim(params: {
  chainId: number;
  period: "weekly" | "monthly";
  epochStart: string;
  category: string;
  rank: number;
  recipient: string;
  nonce: string;
  signature: string;
}): Promise<{ ok: boolean; claimedAt?: string | null; amountRaw?: string }> {
  const r = await fetch(`/api/league`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "claim", ...params }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || "Claim failed");
  return j;
}

export function formatWeiToBnb(weiLike: string | number | bigint, decimals = 18): string {
  try {
    const v = typeof weiLike === "bigint" ? weiLike : BigInt(String(weiLike));
    return ethers.formatUnits(v, decimals);
  } catch {
    return "0";
  }
}
