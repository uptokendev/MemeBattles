import { getActiveChainId, getFactoryAddress } from "@/lib/chainConfig";
import { apiFetch } from "@/lib/apiBase";

const SESSION_KEY = "mwz:recruiter:session";
const FINGERPRINT_KEY = "mwz:recruiter:fingerprint";
const MEMBER_ROLE_KEY = "mwz:recruiter:memberRole";

export type RecruiterMemberRole = "creator" | "trader";

type StoredRecruiterSession = {
  sessionToken: string;
  clientFingerprint: string;
};

export type LaunchpadPreflight = {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
  schemaReady?: boolean;
  tier?: string;
  rules?: Record<string, unknown>;
  creator?: Record<string, unknown> | null;
  walletRisk?: Record<string, unknown> | null;
  cluster?: Record<string, unknown> | null;
  campaign?: Record<string, unknown> | null;
  lookupErrors?: string[];
};

export class LaunchpadPreflightBlockedError extends Error {
  preflight: LaunchpadPreflight;

  constructor(preflight: LaunchpadPreflight) {
    const reasons = Array.isArray(preflight?.reasons)
      ? preflight.reasons.map(String).filter(Boolean)
      : [];
    const message = reasons.length
      ? reasons.slice(0, 3).join(" ")
      : "Safety preflight blocked this action.";

    super(message);
    this.name = "LaunchpadPreflightBlockedError";
    this.preflight = preflight;
  }
}

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

function normalizeMemberRole(value?: string | null): RecruiterMemberRole | null {
  const role = String(value || "").trim().toLowerCase();
  return role === "creator" || role === "trader" ? role : null;
}

function openTokenSafetyDropdown() {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mwz:openTokenSafety"));
      window.dispatchEvent(new CustomEvent("mwz:refreshTokenSafety"));
    }
  } catch {
    // ignore
  }
}

export function setRecruiterReferralMemberRole(role: RecruiterMemberRole) {
  try {
    window.localStorage.setItem(MEMBER_ROLE_KEY, role);
  } catch {
    // ignore storage failures
  }
}

export function getRecruiterReferralMemberRole(): RecruiterMemberRole | null {
  try {
    return normalizeMemberRole(window.localStorage.getItem(MEMBER_ROLE_KEY));
  } catch {
    return null;
  }
}

export function clearRecruiterReferralMemberRole() {
  try {
    window.localStorage.removeItem(MEMBER_ROLE_KEY);
  } catch {
    // ignore storage failures
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

async function getJson(path: string) {
  return parseJson(await apiFetch(path));
}

async function postJson(path: string, body: any) {
  return parseJson(
    await apiFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function postPreflight(path: string, body: any): Promise<LaunchpadPreflight> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const preflight = (json?.preflight ?? json) as LaunchpadPreflight;
  if (!preflight || typeof preflight.allowed !== "boolean") {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return preflight;
}

function assertPreflightAllowed(preflight: LaunchpadPreflight): LaunchpadPreflight {
  if (!preflight?.allowed) {
    openTokenSafetyDropdown();
    throw new LaunchpadPreflightBlockedError(preflight);
  }
  return preflight;
}

export async function captureRecruiterReferral(recruiterCode: string, walletAddress?: string | null) {
  const session = getRecruiterSession();
  return postJson(`/api/recruiters/${encodeURIComponent(recruiterCode)}/referral/capture`, {
    recruiterCode,
    walletAddress: walletAddress ?? null,
    sessionToken: session.sessionToken,
    clientFingerprint: session.clientFingerprint,
  });
}

export async function syncWalletRecruiterAttribution(walletAddress: string, memberRole?: RecruiterMemberRole | null) {
  const session = getRecruiterSession();
  const role = normalizeMemberRole(memberRole) || getRecruiterReferralMemberRole();
  const result = await postJson("/api/attribution/wallet-connect", {
    walletAddress,
    sessionToken: session.sessionToken,
    clientFingerprint: session.clientFingerprint,
    memberRole: role,
  });
  if (result?.linked && role) clearRecruiterReferralMemberRole();
  return result;
}

export async function fetchLaunchpadCreateEligibility(walletAddress: string, walletChainId?: number | null): Promise<LaunchpadPreflight> {
  const chainId = getActiveChainId(walletChainId);
  const factoryAddress = getFactoryAddress(chainId);
  return postPreflight("/api/launchpad/preflight-create", { walletAddress, chainId, factoryAddress });
}

export async function fetchLaunchpadCreatePreflight(walletAddress: string, walletChainId?: number | null): Promise<LaunchpadPreflight> {
  return assertPreflightAllowed(await fetchLaunchpadCreateEligibility(walletAddress, walletChainId));
}

export async function fetchLaunchpadBuyPreflight(
  walletAddress: string,
  campaignAddress: string,
  walletChainId?: number | null,
): Promise<LaunchpadPreflight> {
  const chainId = getActiveChainId(walletChainId);
  const preflight = await postPreflight("/api/launchpad/preflight-buy", { walletAddress, campaignAddress, chainId });
  return assertPreflightAllowed(preflight);
}

export async function fetchLaunchpadSellPreflight(
  walletAddress: string,
  campaignAddress: string,
  walletChainId?: number | null,
): Promise<LaunchpadPreflight> {
  const chainId = getActiveChainId(walletChainId);
  const preflight = await postPreflight("/api/launchpad/preflight-sell", { walletAddress, campaignAddress, chainId });
  return assertPreflightAllowed(preflight);
}

export async function fetchCampaignCreateAuthorization(walletAddress: string, walletChainId?: number | null) {
  const chainId = getActiveChainId(walletChainId);
  const factoryAddress = getFactoryAddress(chainId);
  if (!factoryAddress) throw new Error(`Factory address missing for chain ${chainId}`);

  return postJson("/api/routing/create-authorization", {
    walletAddress,
    chainId,
    factoryAddress,
  });
}

export async function fetchCampaignTradeAuthorization(
  walletAddress: string,
  campaignAddress: string,
  walletChainId?: number | null,
) {
  const chainId = getActiveChainId(walletChainId);
  return postJson("/api/routing/trade-authorization", {
    walletAddress,
    campaignAddress,
    chainId,
  });
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
  totalEarnedByProgram: Record<string, string>;
  claimableTotalRaw: string;
  pendingTotalRaw: string;
  totalEarnedRaw: string;
  updatedAt: string | null;
};

export type RecruiterApplication = {
  displayName: string;
  socialHandle?: string;
  telegramHandle?: string;
  website?: string;
  pitch?: string;
  specialties?: string[];
};

export async function fetchRecruiterSummary(code: string): Promise<RecruiterSummary | null> {
  const json = await getJson(`/api/recruiters/${encodeURIComponent(code)}/summary`);
  return json?.summary ?? null;
}
export async function fetchRecruiterSummaryByWallet(walletAddress: string): Promise<RecruiterSummary | null> {
  if (!walletAddress) return null;

  try {
    const json = await getJson(`/api/recruiters/wallet/${encodeURIComponent(walletAddress)}/summary`);
    return json?.summary ?? json ?? null;
  } catch (error: any) {
    if (String(error?.message || "").includes("Recruiter not found")) return null;
    throw error;
  }
}
export async function fetchRecruiterLeaderboard(
  limit = 100,
  status: "active" | "inactive" | "closed" | "all" = "active",
): Promise<RecruiterSummary[]> {
  const qs = new URLSearchParams({
    limit: String(limit),
    status,
  });

  const json = await getJson(`/api/recruiters?${qs.toString()}`);
  return Array.isArray(json?.recruiters) ? json.recruiters : [];
}
export async function fetchWalletAttributionState(walletAddress: string): Promise<WalletAttributionPublicState | null> {
  return fetchWalletAttribution(walletAddress);
}
export async function fetchSquadSummary(code: string): Promise<SquadSummary | null> {
  const json = await getJson(`/api/recruiters/${encodeURIComponent(code)}/squad`);
  return json?.summary ?? null;
}

export async function applyRecruiter(walletAddress: string, application: RecruiterApplication) {
  return postJson("/api/recruiters/apply", { walletAddress, ...application });
}

export async function fetchWalletAttribution(walletAddress: string): Promise<WalletAttributionPublicState | null> {
  if (!walletAddress) return null;
  const qs = new URLSearchParams({ walletAddress });
  const json = await getJson(`/api/attribution/wallet?${qs.toString()}`);
  return json?.state ?? null;
}

export async function fetchWalletRewards(walletAddress: string): Promise<WalletRewardSummary | null> {
  if (!walletAddress) return null;
  const qs = new URLSearchParams({ walletAddress });
  const json = await getJson(`/api/rewards/wallet?${qs.toString()}`);
  return json?.summary ?? null;
}

export async function fetchRecruiterRewards(code: string): Promise<WalletRewardSummary | null> {
  const json = await getJson(`/api/recruiters/${encodeURIComponent(code)}/rewards`);
  return json?.summary ?? null;
}
