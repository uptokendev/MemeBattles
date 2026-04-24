import { getActiveChainId, getFactoryAddress } from "@/lib/chainConfig";

const SESSION_KEY = "mwz:recruiter:session";
const FINGERPRINT_KEY = "mwz:recruiter:fingerprint";

type StoredRecruiterSession = {
  sessionToken: string;
  clientFingerprint: string;
};

function ensureStorageValue(key: string): string {
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export function getRecruiterSession(): StoredRecruiterSession {
  return {
    sessionToken: ensureStorageValue(SESSION_KEY),
    clientFingerprint: ensureStorageValue(FINGERPRINT_KEY),
  };
}

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

export async function captureRecruiterReferral(recruiterCode: string, walletAddress?: string | null) {
  const session = getRecruiterSession();
  const res = await fetch(`/api/recruiters/${encodeURIComponent(recruiterCode)}/referral/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recruiterCode,
      walletAddress: walletAddress ?? null,
      sessionToken: session.sessionToken,
      clientFingerprint: session.clientFingerprint,
    }),
  });
  return parseJson(res);
}

export async function syncWalletRecruiterAttribution(walletAddress: string) {
  const session = getRecruiterSession();
  const res = await fetch("/api/attribution/wallet-connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      sessionToken: session.sessionToken,
      clientFingerprint: session.clientFingerprint,
    }),
  });
  return parseJson(res);
}

export async function fetchCampaignCreateAuthorization(walletAddress: string, walletChainId?: number | null) {
  const chainId = getActiveChainId(walletChainId);
  const factoryAddress = getFactoryAddress(chainId);
  if (!factoryAddress) throw new Error(`Factory address missing for chain ${chainId}`);

  const res = await fetch("/api/recruiter-routing/create-authorization", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      chainId,
      factoryAddress,
    }),
  });
  return parseJson(res);
}

export async function fetchCampaignTradeAuthorization(
  walletAddress: string,
  campaignAddress: string,
  walletChainId?: number | null,
) {
  const chainId = getActiveChainId(walletChainId);
  const res = await fetch("/api/recruiter-routing/trade-authorization", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      campaignAddress,
      chainId,
    }),
  });
  return parseJson(res);
}

export type RecruiterSummary = {
  recruiterId: number;
  walletAddress: string;
  code: string;
  displayName: string | null;
  isOg: boolean;
  status: string;
  closedAt: string | null;
  linkedWalletCount: number;
  linkedCreatorsCount: number;
  linkedTradersCount: number;
  activeSquadMemberCount: number;
  referredEventCount: number;
  referredVolumeRaw: string;
  recruiterRouteAmountRaw: string;
  lastReferredEventAt: string | null;
  latestLinkedActivityAt: string | null;
  pendingEarningsRaw: string;
  claimableEarningsRaw: string;
  totalEarnedRaw: string;
  claimedLifetimeRaw: string;
  lastClaimedAt: string | null;
  weightedScore?: number;
  createdAt: string | null;
  updatedAt: string | null;
  materializedAt: string | null;
};

export type SquadSummary = {
  recruiterId: number;
  recruiterWalletAddress: string;
  recruiterCode: string;
  recruiterDisplayName: string | null;
  recruiterIsOg: boolean;
  recruiterStatus: string;
  activeMemberCount: number;
  eligibleMemberCount: number;
  totalEligibleScore: string;
  routedEventCount: number;
  routedSquadAmountTotal: string;
  currentEpochRoutedSquadAmount: string;
  estimatedPendingPoolAmount: string;
  lastRoutedAt: string | null;
  currentEpochId: number | null;
  currentEpochStartAt: string | null;
  currentEpochEndAt: string | null;
  materializedAt: string | null;
};

export type WalletAttributionPublicState = {
  walletAddress: string;
  hasActivity: boolean;
  recruiterLinkState: string;
  recruiterCode: string | null;
  recruiterDisplayName: string | null;
  recruiterIsOg: boolean;
  squadState: string;
};

export type WalletRewardSummary = {
  walletAddress: string;
  pendingByProgram: Record<string, string>;
  claimableByProgram: Record<string, string>;
  claimedByProgram: Record<string, string>;
  totalClaimableAmount: string;
  claimedLifetimeAmount: string;
  lastClaimedAt: string | null;
  materializedAt: string | null;
};

function buildQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function fetchRecruiterLeaderboard(limit = 100, status?: string | null): Promise<RecruiterSummary[]> {
  const res = await fetch(`/api/recruiters${buildQuery({ limit, status })}`);
  const json = await parseJson(res);
  return Array.isArray(json?.recruiters) ? json.recruiters as RecruiterSummary[] : [];
}

export async function fetchRecruiterSummary(code: string): Promise<RecruiterSummary> {
  const res = await fetch(`/api/recruiters/${encodeURIComponent(code)}/summary`);
  return parseJson(res);
}

export async function fetchRecruiterSummaryByWallet(walletAddress: string): Promise<RecruiterSummary> {
  const res = await fetch(`/api/recruiters/wallet/${encodeURIComponent(walletAddress)}/summary`);
  return parseJson(res);
}

export async function fetchRecruiterReplacements(code: string, limit = 5) {
  const res = await fetch(`/api/recruiters/${encodeURIComponent(code)}/replacements${buildQuery({ limit })}`);
  return parseJson(res);
}

export async function fetchSquadSummary(recruiterCode: string): Promise<SquadSummary> {
  const res = await fetch(`/api/squads/${encodeURIComponent(recruiterCode)}/summary`);
  return parseJson(res);
}

export async function fetchWalletAttributionState(walletAddress: string): Promise<WalletAttributionPublicState> {
  const res = await fetch(`/api/attribution/wallet/${encodeURIComponent(walletAddress)}`);
  const json = await parseJson(res);
  return json?.state as WalletAttributionPublicState;
}

export async function fetchWalletRewardSummary(walletAddress: string): Promise<WalletRewardSummary> {
  const res = await fetch(`/api/rewards/me${buildQuery({ address: walletAddress })}`);
  return parseJson(res);
}

export async function fetchWalletRewardHistory(walletAddress: string, limit = 50, program?: string | null) {
  const res = await fetch(`/api/rewards/me/history${buildQuery({ address: walletAddress, limit, program })}`);
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items : [];
}

export async function fetchWalletRewardClaims(walletAddress: string, limit = 50, program?: string | null) {
  const res = await fetch(`/api/rewards/me/claims${buildQuery({ address: walletAddress, limit, program })}`);
  const json = await parseJson(res);
  return Array.isArray(json?.claims) ? json.claims : [];
}
