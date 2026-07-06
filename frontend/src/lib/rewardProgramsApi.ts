import { buildRealtimeApiUrl } from "@/lib/realtimeApi";

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

async function getJsonWithFallback(paths: string[]) {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const res = await fetch(buildRealtimeApiUrl(path));
      return await parseJson(res);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function buildQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type WalletEligibilityItem = {
  id: number;
  epochId: number;
  chainId: number;
  epochType: string;
  epochLabel?: string | null;
  startAt: string | null;
  endAt: string | null;
  program: string;
  isEligible: boolean;
  reasonCodes: string[];
  activityScore?: string;
  computedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AirdropCurrent = {
  id: number | null;
  chain: "BNB" | "SOL";
  chainId: number;
  prizePoolAmount: string;
  prizePoolUsd?: string | null;
  tokenSymbol: string;
  status: "funding" | "ready" | "drop_complete" | "claim_open" | "closed";
  nextDropAt: string;
  epochLabel: string;
  startsAt?: string | null;
  endsAt?: string | null;
  publishedAt?: string | null;
  empty?: boolean;
};

export type AirdropWinner = {
  id: number;
  drawId: number;
  epochId: number;
  epochLabel?: string;
  date?: string;
  chainId: number;
  chain?: "BNB" | "SOL";
  program: string;
  role?: "creator" | "trader";
  walletAddress: string;
  winnerRank: number;
  weightTier: number;
  weightValue: number;
  activityScore: string;
  payoutAmount: string;
  amount?: string;
  tokenSymbol?: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ClaimableReward = {
  id: number;
  rewardId: string;
  type: "airdrop" | string;
  program: string;
  epochId: number;
  epochLabel: string;
  chainId: number;
  chain: "BNB" | "SOL";
  tokenSymbol: string;
  walletAddress: string;
  role?: "creator" | "trader";
  amountRaw: string;
  amount: string;
  status: "claimable" | "submitted" | "claimed" | "failed" | "expired";
  claimStatus: string;
  winnerRank?: number;
  claimId?: number | null;
  merkleIndex?: number | null;
  merkleProof?: string[];
  merkleRoot?: string | null;
  contractAddress?: string | null;
  claimExecutionEnabled?: boolean;
  claimDisabledReason?: string | null;
  txHash?: string | null;
  claimedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type RewardsMe = {
  address: string;
  chainId: number | null;
  claimable: ClaimableReward[];
  totals: {
    claimableAmount: string;
    claimedAmount: string;
    expiredAmount: string;
  };
  materializedAt: string | null;
};

export type SquadLeaderboardItem = {
  recruiterId: number;
  recruiterCode: string | null;
  recruiterDisplayName: string | null;
  recruiterStatus: string | null;
  recruiterIsOg: boolean;
  rawScore: string;
  effectiveScore: string;
  estimatedAllocationAmount: string;
  globalCapAmount: string;
  globalCapApplied: boolean;
  activeMemberCount: number;
  eligibleMemberCount: number;
  currentEpochId: number;
  currentEpochStartAt: string;
  currentEpochEndAt: string;
};

export type SquadMemberItem = {
  walletAddress: string;
  recruiterId: number;
  recruiterCode: string | null;
  recruiterDisplayName: string | null;
  isEligible: boolean;
  reasonCodes: string[];
  rawScore: string;
  estimatedPayoutAmount: string;
  memberCapAmount: string;
  memberCapApplied: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function fetchWalletRewardEligibility(walletAddress: string, limit = 20, program?: string | null): Promise<WalletEligibilityItem[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me/eligibility${buildQuery({ address: walletAddress, limit, program })}`));
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as WalletEligibilityItem[] : [];
}

export async function fetchAirdropCurrent(chainId?: number | null): Promise<AirdropCurrent | null> {
  const query = buildQuery({ chainId });
  const json = await getJsonWithFallback([
    `/api/airdrops/current${query}`,
    `/api/internal/rewards/ops/epoch-status${query}`,
  ]);
  return json?.current ?? null;
}

export async function fetchAirdropWinners(params: {
  epochId?: number | null;
  chainId?: number | null;
  program?: string | null;
  walletAddress?: string | null;
  limit?: number;
} = {}): Promise<AirdropWinner[]> {
  const query = buildQuery(params);
  const json = await getJsonWithFallback([
    `/api/airdrops/previous-winners${query}`,
    `/api/airdrops/winners${query}`,
  ]);
  return Array.isArray(json?.items) ? json.items as AirdropWinner[] : [];
}

export async function fetchRewardsMe(params: { address: string; chainId?: number | null; limit?: number }): Promise<RewardsMe> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me${buildQuery(params)}`));
  return parseJson(res) as Promise<RewardsMe>;
}

export async function fetchRewardClaims(params: { address: string; chainId?: number | null; limit?: number }): Promise<ClaimableReward[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me/claims${buildQuery(params)}`));
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as ClaimableReward[] : [];
}

export async function fetchRewardHistory(params: { address: string; chainId?: number | null; limit?: number }): Promise<ClaimableReward[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me/history${buildQuery(params)}`));
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as ClaimableReward[] : [];
}

export async function prepareRewardClaim(input: { rewardId: string; id?: number; address: string; chainId?: number | null }) {
  const res = await fetch(buildRealtimeApiUrl("/api/rewards/me/claims"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function fetchSquadLeaderboard(epochId?: number | null) {
  const res = await fetch(buildRealtimeApiUrl(`/api/squads${buildQuery({ epochId })}`));
  return parseJson(res);
}

export async function fetchSquadMembers(params: {
  epochId?: number | null;
  recruiterCode?: string | null;
  walletAddress?: string | null;
  limit?: number;
}) {
  const res = await fetch(buildRealtimeApiUrl(`/api/squads/members${buildQuery(params)}`));
  return parseJson(res);
}
