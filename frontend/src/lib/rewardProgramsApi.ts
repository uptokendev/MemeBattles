import { buildRealtimeApiUrl } from "@/lib/realtimeApi";

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
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

export type RewardLedgerItem = {
  id: string;
  rewardType: string;
  sourceId: string | null;
  sourceLabel: string | null;
  walletAddress: string;
  userId: string | null;
  chain: string;
  chainId: number | null;
  tokenSymbol: string;
  amount: string;
  amountUsd: string | null;
  status: "pending" | "approved" | "claimable" | "claim_pending" | "claimed" | "failed" | "expired" | "cancelled";
  claimBatchId: string | null;
  claimTxHash: string | null;
  claimError: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
  claimableAt: string | null;
  claimedAt: string | null;
  expiresAt: string | null;
};

export type RewardsMeResponse = {
  address: string;
  chainId: number | null;
  claimable: RewardLedgerItem[];
  items: RewardLedgerItem[];
  totals: {
    claimableAmount: string;
    claimedAmount: string;
    expiredAmount: string;
  };
  materializedAt: string | null;
};

export type AirdropCurrent = {
  status: string;
  currentEpochId: number | null;
  current: {
    id: string;
    rewardType: string;
    chain: string;
    chainId: number | null;
    tokenSymbol: string;
    status: string;
    totalAmount: string;
    recipientCount: number;
    claimableCount: number;
    claimedCount: number;
    failedCount: number;
    source: string | null;
    metadata: Record<string, unknown>;
    createdAt: string | null;
    publishedAt: string | null;
    closedAt: string | null;
  } | null;
  prizePool: {
    chain: string;
    tokenSymbol: string;
    amount: string;
    status: string;
  } | null;
  materializedAt: string | null;
};

export type WalletEligibilityItem = {
  id: number;
  epochId: number;
  chainId: number;
  epochType: string;
  startAt: string;
  endAt: string;
  program: string;
  isEligible: boolean;
  reasonCodes: string[];
  computedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AirdropWinner = {
  id: number;
  drawId: number;
  epochId: number;
  chainId: number;
  program: string;
  walletAddress: string;
  winnerRank: number;
  weightTier: number;
  weightValue: number;
  activityScore: string;
  payoutAmount: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export async function fetchRewardsMe(params: {
  walletAddress: string;
  chainId?: number | null;
  rewardType?: string | null;
  limit?: number;
}): Promise<RewardsMeResponse> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me${buildQuery({
    address: params.walletAddress,
    chainId: params.chainId,
    rewardType: params.rewardType,
    limit: params.limit ?? 100,
  })}`));
  const json = await parseJson(res);
  return {
    address: String(json?.address || params.walletAddress),
    chainId: json?.chainId ?? params.chainId ?? null,
    claimable: Array.isArray(json?.claimable) ? json.claimable : [],
    items: Array.isArray(json?.items) ? json.items : [],
    totals: json?.totals || { claimableAmount: "0", claimedAmount: "0", expiredAmount: "0" },
    materializedAt: json?.materializedAt || null,
  };
}

export async function fetchRewardClaims(params: {
  walletAddress: string;
  chainId?: number | null;
  rewardType?: string | null;
  limit?: number;
}): Promise<RewardLedgerItem[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me/claims${buildQuery({
    address: params.walletAddress,
    chainId: params.chainId,
    rewardType: params.rewardType,
    limit: params.limit ?? 100,
  })}`));
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as RewardLedgerItem[] : [];
}

export async function requestRewardClaim(input: {
  walletAddress: string;
  chainId?: number | null;
  rewardLedgerIds: string[];
}): Promise<RewardLedgerItem[]> {
  const res = await fetch(buildRealtimeApiUrl("/api/rewards/me/claims"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as RewardLedgerItem[] : [];
}

export async function fetchAirdropCurrent(chainId?: number | null): Promise<AirdropCurrent> {
  const res = await fetch(buildRealtimeApiUrl(`/api/internal/rewards/ops/epoch-status${buildQuery({ chainId })}`));
  const json = await parseJson(res);
  return {
    status: String(json?.status || "empty"),
    currentEpochId: json?.currentEpochId ?? null,
    current: json?.current ?? null,
    prizePool: json?.prizePool ?? null,
    materializedAt: json?.materializedAt || null,
  };
}

export async function fetchWalletRewardEligibility(walletAddress: string, limit = 20, program?: string | null): Promise<WalletEligibilityItem[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me/eligibility${buildQuery({ address: walletAddress, limit, program })}`));
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as WalletEligibilityItem[] : [];
}

export async function fetchAirdropWinners(params: {
  epochId?: number | null;
  chainId?: number | null;
  program?: string | null;
  walletAddress?: string | null;
  limit?: number;
} = {}): Promise<AirdropWinner[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/airdrops/winners${buildQuery(params)}`));
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as AirdropWinner[] : [];
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