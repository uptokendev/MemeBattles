type InternalHeaders = {
  authorization?: string;
};

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

function authHeaders(token?: string | null): InternalHeaders {
  const trimmed = String(token || "").trim();
  return trimmed ? { authorization: `Bearer ${trimmed}` } : {};
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

export type RewardPublicationState = {
  id: number | null;
  resourceType: "airdrop_winners" | "recruiter_leaderboard" | "squad_leaderboard";
  resourceKey: string;
  isPublished: boolean;
  changedBy: string | null;
  reason: string | null;
  metadataJson: Record<string, unknown>;
  publishedAt: string | null;
  unpublishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function fetchWalletRewardEligibility(walletAddress: string, limit = 20, program?: string | null): Promise<WalletEligibilityItem[]> {
  const res = await fetch(`/api/rewards/me/eligibility${buildQuery({ address: walletAddress, limit, program })}`);
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as WalletEligibilityItem[] : [];
}

export async function fetchAirdropWinners(params: {
  epochId?: number | null;
  program?: string | null;
  walletAddress?: string | null;
  limit?: number;
} = {}): Promise<AirdropWinner[]> {
  const res = await fetch(`/api/airdrops/winners${buildQuery(params)}`);
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items as AirdropWinner[] : [];
}

export async function fetchSquadLeaderboard(epochId?: number | null) {
  const res = await fetch(`/api/squads${buildQuery({ epochId })}`);
  return parseJson(res);
}

export async function fetchSquadMembers(params: {
  epochId?: number | null;
  recruiterCode?: string | null;
  walletAddress?: string | null;
  limit?: number;
}) {
  const res = await fetch(`/api/squads/members${buildQuery(params)}`);
  return parseJson(res);
}

export async function fetchInternalRewardPublications(token: string) {
  const res = await fetch("/internal/rewards/publications", {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function updateInternalRewardPublication(token: string, body: {
  resourceType: RewardPublicationState["resourceType"];
  resourceKey?: string | null;
  isPublished: boolean;
  actedBy?: string | null;
  reason?: string | null;
}) {
  const res = await fetch("/internal/rewards/publications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchInternalRewardRoutingDiagnostics(token: string, chainId?: number | null) {
  const res = await fetch(`/internal/rewards/ops/routing${buildQuery({ chainId })}`, {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function fetchInternalRewardClaimVault(token: string) {
  const res = await fetch("/internal/rewards/ops/claim-vault", {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function fetchInternalRewardEpochStatus(token: string, limit = 20) {
  const res = await fetch(`/internal/rewards/ops/epoch-status${buildQuery({ limit })}`, {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function fetchInternalRewardAlerts(token: string) {
  const res = await fetch("/internal/rewards/ops/alerts", {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function fetchInternalRewardAdminActions(token: string, limit = 50) {
  const res = await fetch(`/internal/rewards/ops/admin-actions${buildQuery({ limit })}`, {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function fetchInternalAirdropDraws(token: string, params: {
  epochId?: number | null;
  program?: string | null;
  status?: string | null;
  limit?: number;
} = {}) {
  const res = await fetch(`/internal/rewards/airdrops/draws${buildQuery(params)}`, {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function runInternalAirdropDraw(token: string, epochId: number, body: {
  program?: string | null;
  publish?: boolean;
  seed?: string | null;
  actedBy?: string | null;
  reason?: string | null;
}) {
  const res = await fetch(`/internal/rewards/airdrops/epochs/${encodeURIComponent(String(epochId))}/draws/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}
