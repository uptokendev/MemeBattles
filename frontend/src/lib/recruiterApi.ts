import { getActiveChainId, getFactoryAddress } from "@/lib/chainConfig";
import { buildRealtimeApiUrl } from "@/lib/realtimeApi";

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
  const res = await fetch(buildRealtimeApiUrl(`/api/recruiters/${encodeURIComponent(recruiterCode)}/referral/capture`), {
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
  const res = await fetch(buildRealtimeApiUrl("/api/attribution/wallet-connect"), {
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

  const res = await fetch(buildRealtimeApiUrl("/api/recruiter-routing/create-authorization"), {
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
  const res = await fetch(buildRealtimeApiUrl("/api/recruiter-routing/trade-authorization"), {
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

export async function fetchRecruiterLeaderboard(limit = 100, status?: string | null): Promise<RecruiterSummary[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/recruiters${buildQuery({ limit, status })}`));
  const json = await parseJson(res);
  return Array.isArray(json?.recruiters) ? json.recruiters as RecruiterSummary[] : [];
}

export async function fetchRecruiterSummary(code: string): Promise<RecruiterSummary> {
  const res = await fetch(buildRealtimeApiUrl(`/api/recruiters/${encodeURIComponent(code)}/summary`));
  return parseJson(res);
}

export async function fetchRecruiterSummaryByWallet(walletAddress: string): Promise<RecruiterSummary> {
  const res = await fetch(buildRealtimeApiUrl(`/api/recruiters/wallet/${encodeURIComponent(walletAddress)}/summary`));
  return parseJson(res);
}

export async function fetchRecruiterReplacements(code: string, limit = 5) {
  const res = await fetch(buildRealtimeApiUrl(`/api/recruiters/${encodeURIComponent(code)}/replacements${buildQuery({ limit })}`));
  return parseJson(res);
}

export async function fetchSquadSummary(recruiterCode: string): Promise<SquadSummary> {
  const res = await fetch(buildRealtimeApiUrl(`/api/squads/${encodeURIComponent(recruiterCode)}/summary`));
  return parseJson(res);
}

export async function fetchWalletAttributionState(walletAddress: string): Promise<WalletAttributionPublicState> {
  const res = await fetch(buildRealtimeApiUrl(`/api/attribution/wallet/${encodeURIComponent(walletAddress)}`));
  const json = await parseJson(res);
  return json?.state as WalletAttributionPublicState;
}

export async function fetchWalletRewardSummary(walletAddress: string): Promise<WalletRewardSummary> {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me${buildQuery({ address: walletAddress })}`));
  return parseJson(res);
}

export async function fetchWalletRewardHistory(walletAddress: string, limit = 50, program?: string | null) {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me/history${buildQuery({ address: walletAddress, limit, program })}`));
  const json = await parseJson(res);
  return Array.isArray(json?.items) ? json.items : [];
}

export async function fetchWalletRewardClaims(walletAddress: string, limit = 50, program?: string | null) {
  const res = await fetch(buildRealtimeApiUrl(`/api/rewards/me/claims${buildQuery({ address: walletAddress, limit, program })}`));
  const json = await parseJson(res);
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

  try {
    const res = await fetch(`/api/recruiter-signup/status${buildQuery({ walletAddress: normalized })}`);
    if (res.ok) {
      const json = await parseJson(res);
      return {
        walletAddress: normalized,
        isRecruiter: Boolean(json?.isRecruiter),
        recruiter: (json?.recruiter ?? null) as RecruiterSummary | null,
        canStartSignup: Boolean(json?.canStartSignup ?? !json?.isRecruiter),
        signupApiAvailable: true,
      };
    }

    if (res.status !== 404) {
      await parseJson(res);
    }
  } catch {
    // Fall through to the summary-based fallback.
  }

  try {
    const recruiter = await fetchRecruiterSummaryByWallet(normalized);
    return {
      walletAddress: normalized,
      isRecruiter: true,
      recruiter,
      canStartSignup: false,
      signupApiAvailable: false,
    };
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("404") || message.toLowerCase().includes("not found")) {
      return {
        walletAddress: normalized,
        isRecruiter: false,
        recruiter: null,
        canStartSignup: true,
        signupApiAvailable: false,
      };
    }
    throw error;
  }
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
    const res = await fetch(`/api/recruiter-signup/code-availability${buildQuery({ code: normalized })}`);
    if (res.ok) {
      const json = await parseJson(res);
      return {
        code: normalized,
        isAvailable: typeof json?.isAvailable === "boolean" ? Boolean(json.isAvailable) : null,
        checkedVia: "signup-endpoint",
        message: json?.message ? String(json.message) : null,
      };
    }

    if (res.status !== 404) {
      await parseJson(res);
    }
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

export async function requestRecruiterSignupNonce(walletAddress: string): Promise<RecruiterSignupNonceResponse> {
  const normalized = normalizeWalletAddress(walletAddress);
  const res = await fetch("/api/recruiter-signup/nonce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress: normalized }),
  });

  if (res.status === 404) {
    throw new Error("Recruiter signup is not enabled on this environment yet.");
  }

  const json = await parseJson(res);
  if (!json?.nonce) throw new Error("Recruiter signup nonce missing from response.");
  return { nonce: String(json.nonce) };
}

export async function submitRecruiterSignup(payload: RecruiterSignupPayload) {
  const res = await fetch("/api/recruiter-signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...payload,
      walletAddress: normalizeWalletAddress(payload.walletAddress),
      desiredCode: normalizeRecruiterCode(payload.desiredCode),
    }),
  });

  if (res.status === 404) {
    throw new Error("Recruiter signup submission is not enabled on this environment yet.");
  }

  return parseJson(res);
}
