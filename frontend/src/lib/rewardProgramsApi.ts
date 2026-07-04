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

export async function fetchWalletRewardEligibility(walletAddress: string, limit = 20, program?: string | null): Promise<WalletEligibilityItem[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me/eligibility${buildQuery({ address: walletAddress, limit, program })}`));
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as WalletEligibilityItem[] : [];
}

export async function fetchAirdropWinners(params: {
  epochId?: number | null;
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
