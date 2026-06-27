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
    throw new Error(preflight?.reasons?.[0] || "Launchpad security preflight blocked this action.");
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
  claimedByProgram: Record<string, string>;
  totalClaimableAmount: string;
  claimedLifetimeAmount: string;
  lastClaimedAt: string | null;
  materializedAt: string | null;
};

export type RecruiterSignupStatus = {
  walletAddress: string;
  isRecruiter: boolean;
  recruiter: RecruiterSummary | null;
  canStartSignup: boolean;
  signupApiAvailable: boolean;
};

export type RecruiterCodeAvailability = {
  code: string;
  isAvailable: boolean | null;
  checkedVia: "signup-endpoint" | "summary-fallback" | "unavailable";
  message: string | null;
};

export type RecruiterSignupNonceResponse = {
  nonce: string;
};

export type RecruiterSignupPayload = {
  walletAddress: string;
  chainId?: number | null;
  displayName: string;
  desiredCode: string;
  email: string;
  telegram: string;
  discord: string;
  xHandle: string;
  pitch: string;
  acceptTerms: boolean;
  nonce: string;
  signature: string;
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

function unwrapRecruiterSummary(json: any): RecruiterSummary | null {
  return (json?.recruiter ?? json ?? null) as RecruiterSummary | null;
}

function unwrapSquadSummary(json: any): SquadSummary | null {
  return (json?.squad ?? json ?? null) as SquadSummary | null;
}

export async function fetchRecruiterLeaderboard(limit = 100, status?: string | null): Promise<RecruiterSummary[]> {
  const json = await getJson(`/api/recruiters${buildQuery({ limit, status })}`);
  return Array.isArray(json?.recruiters) ? json.recruiters as RecruiterSummary[] : [];
}

export async function fetchRecruiterSummary(code: string): Promise<RecruiterSummary> {
  const json = await getJson(`/api/recruiters/${encodeURIComponent(code)}/summary`);
  const recruiter = unwrapRecruiterSummary(json);
  if (!recruiter || (json?.exists === false)) throw new Error("Recruiter not found");
  return recruiter;
}

export async function fetchRecruiterSummaryByWallet(walletAddress: string): Promise<RecruiterSummary> {
  const json = await getJson(`/api/recruiters/wallet/${encodeURIComponent(walletAddress)}/summary`);
  const recruiter = unwrapRecruiterSummary(json);
  if (!recruiter || (json?.exists === false)) throw new Error("Recruiter not found");
  return recruiter;
}

export async function fetchRecruiterReplacements(code: string, limit = 5) {
  return getJson(`/api/recruiters/${encodeURIComponent(code)}/replacements${buildQuery({ limit })}`);
}

export async function fetchSquadSummary(recruiterCode: string): Promise<SquadSummary> {
  const json = await getJson(`/api/squads/${encodeURIComponent(recruiterCode)}/summary`);
  const squad = unwrapSquadSummary(json);
  if (!squad || (json?.exists === false)) throw new Error("Squad summary not found");
  return squad;
}

export async function fetchWalletAttributionState(walletAddress: string): Promise<WalletAttributionPublicState> {
  const json = await getJson(`/api/attribution/wallet/${encodeURIComponent(walletAddress)}`);
  return json?.state as WalletAttributionPublicState;
}

export async function fetchWalletRewardSummary(walletAddress: string): Promise<WalletRewardSummary> {
  return getJson(`/api/rewards/me${buildQuery({ address: walletAddress })}`);
}

export async function fetchWalletRewardHistory(walletAddress: string, limit = 50, program?: string | null) {
  const json = await getJson(`/api/rewards/me/history${buildQuery({ address: walletAddress, limit, program })}`);
  return Array.isArray(json?.items) ? json.items : [];
}

export async function fetchWalletRewardClaims(walletAddress: string, limit = 50, program?: string | null) {
  const json = await getJson(`/api/rewards/me/claims${buildQuery({ address: walletAddress, limit, program })}`);
  return Array.isArray(json?.claims) ? json.claims : [];
}

function normalizeWalletAddress(walletAddress: string): string {
  return String(walletAddress || "").trim().toLowerCase();
}

function normalizeRecruiterCode(code: string): string {
  return String(code || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildRecruiterSignupMessage(input: {
  walletAddress: string;
  chainId?: number | null;
  nonce: string;
  displayName: string;
  desiredCode: string;
  email: string;
  telegram: string;
  discord: string;
  xHandle: string;
  pitch: string;
}) {
  return [
    "MemeWarzone Recruiter Signup",
    "Action: RECRUITER_SIGNUP",
    `Wallet: ${normalizeWalletAddress(input.walletAddress)}`,
    `ChainId: ${input.chainId ?? ""}`,
    `Nonce: ${String(input.nonce || "").trim()}`,
    "",
    `DisplayName: ${String(input.displayName || "").trim()}`,
    `DesiredCode: ${normalizeRecruiterCode(input.desiredCode)}`,
    `Email: ${String(input.email || "").trim()}`,
    `Telegram: ${String(input.telegram || "").trim()}`,
    `Discord: ${String(input.discord || "").trim()}`,
    `X: ${String(input.xHandle || "").trim()}`,
    "",
    `Pitch: ${String(input.pitch || "").trim()}`,
  ].join("\n");
}

export async function fetchRecruiterSignupStatus(walletAddress: string): Promise<RecruiterSignupStatus> {
  const normalized = normalizeWalletAddress(walletAddress);

  const res = await apiFetch(`/api/recruiter-signup/status${buildQuery({ walletAddress: normalized })}`);

  if (res.ok) {
    const json = await parseJson(res);
    const isRecruiter = Boolean(json?.isRecruiter);
    let recruiter = (json?.recruiter ?? null) as RecruiterSummary | null;

    if (isRecruiter && !recruiter) {
      recruiter = await fetchRecruiterSummaryByWallet(normalized).catch(() => null);
    }

    return {
      walletAddress: normalized,
      isRecruiter,
      recruiter,
      canStartSignup: Boolean(json?.canStartSignup ?? !isRecruiter),
      signupApiAvailable: true,
    };
  }

  if (res.status === 404) {
    return {
      walletAddress: normalized,
      isRecruiter: false,
      recruiter: null,
      canStartSignup: true,
      signupApiAvailable: true,
    };
  }

  await parseJson(res);
  return {
    walletAddress: normalized,
    isRecruiter: false,
    recruiter: null,
    canStartSignup: true,
    signupApiAvailable: false,
  };
}

export async function checkRecruiterCodeAvailability(code: string): Promise<RecruiterCodeAvailability> {
  const normalized = normalizeRecruiterCode(code);
  if (!normalized) {
    return {
      code: normalized,
      isAvailable: null,
      checkedVia: "unavailable",
      message: "Enter a recruiter code to check availability.",
    };
  }

  try {
    const res = await apiFetch(`/api/recruiter-signup/code-availability${buildQuery({ code: normalized })}`);
    if (res.ok) {
      const json = await parseJson(res);
      return {
        code: normalized,
        isAvailable: typeof json?.isAvailable === "boolean" ? Boolean(json.isAvailable) : null,
        checkedVia: "signup-endpoint",
        message: json?.message ? String(json.message) : null,
      };
    }
    if (res.status !== 404) await parseJson(res);
  } catch {
    // Fall through to the summary-based fallback.
  }

  try {
    await fetchRecruiterSummary(normalized);
    return {
      code: normalized,
      isAvailable: false,
      checkedVia: "summary-fallback",
      message: "This recruiter code is already taken.",
    };
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("404") || message.toLowerCase().includes("not found")) {
      return {
        code: normalized,
        isAvailable: true,
        checkedVia: "summary-fallback",
        message: "This recruiter code looks available.",
      };
    }
    return {
      code: normalized,
      isAvailable: null,
      checkedVia: "unavailable",
      message: "We could not verify code availability right now.",
    };
  }
}

export async function requestRecruiterSignupNonce(
  walletAddress: string,
  chainId: number,
): Promise<RecruiterSignupNonceResponse> {
  const normalized = normalizeWalletAddress(walletAddress);
  const json = await postJson("/api/recruiter-signup/nonce", {
    walletAddress: normalized,
    chainId,
  });
  if (!json?.nonce) throw new Error("Recruiter signup nonce missing from response.");
  return { nonce: String(json.nonce) };
}

export async function submitRecruiterSignup(payload: RecruiterSignupPayload) {
  return postJson("/api/recruiter-signup", {
    ...payload,
    walletAddress: normalizeWalletAddress(payload.walletAddress),
    desiredCode: normalizeRecruiterCode(payload.desiredCode),
  });
}