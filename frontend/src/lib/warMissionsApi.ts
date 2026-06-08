import { apiFetch } from "@/lib/apiBase";

const WM_CREDENTIALS: RequestCredentials = "include";

export type WarMissionsProfile = {
  id: string;
  walletAddress: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
  riskScore?: number;
  isBanned?: boolean;
  xpTotal?: number;
};

export type WarMissionsAuthNonceResponse = {
  nonce: string;
  message: string;
  expiresAt: string | null;
};

export type WarMissionsRecruiterApplication = {
  id: string;
  userId: string;
  walletAddress: string;
  xUsername: string;
  telegramUsername: string;
  discordUsername: string;
  motivation: string;
  expectedRecruits: number | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
};

export type WarMissionsReferralLink = {
  id: string;
  recruiterUserId: string | null;
  code: string;
  url: string;
  active: boolean;
  createdAt: string | null;
};

export type WarMissionsRecruiterSummary = {
  total: number;
  pending: number;
  linked: number;
  verified: number;
  locked: number;
  rejected: number;
};

export type WarMissionsRecruit = {
  id: string;
  status: string;
  referralCode: string | null;
  firstSeenAt: string | null;
  walletConnectedAt: string | null;
  verifiedAt: string | null;
  user: {
    id: string;
    walletAddress: string;
    displayName: string | null;
    role: string;
    isBanned: boolean;
  } | null;
};

export type WarMissionsRecruiterState = {
  profile: WarMissionsProfile | null;
  role: string;
  application: WarMissionsRecruiterApplication | null;
  referralLink: WarMissionsReferralLink | null;
  summary: WarMissionsRecruiterSummary;
  recruits: WarMissionsRecruit[];
};

type RecruiterApplicationPayload = {
  xUsername?: string;
  telegramUsername?: string;
  discordUsername?: string;
  motivation: string;
  expectedRecruits?: number | null;
};

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any)?.ok === false) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

async function wmFetch(path: string, init?: RequestInit) {
  return parseJson(
    await apiFetch(path, {
      credentials: WM_CREDENTIALS,
      cache: "no-store",
      ...(init || {}),
    }),
  );
}

function normalizeApplication(value: any): WarMissionsRecruiterApplication | null {
  if (!value) return null;
  return {
    id: String(value.id || ""),
    userId: String(value.userId || value.user_id || ""),
    walletAddress: String(value.walletAddress || value.wallet_address || ""),
    xUsername: String(value.xUsername || value.x_username || ""),
    telegramUsername: String(value.telegramUsername || value.telegram_username || ""),
    discordUsername: String(value.discordUsername || value.discord_username || ""),
    motivation: String(value.motivation || ""),
    expectedRecruits:
      value.expectedRecruits == null && value.expected_recruits == null
        ? null
        : Number(value.expectedRecruits ?? value.expected_recruits),
    status: String(value.status || "submitted"),
    reviewedBy: value.reviewedBy || value.reviewed_by || null,
    reviewedAt: value.reviewedAt || value.reviewed_at || null,
    createdAt: value.createdAt || value.created_at || null,
  };
}

function normalizeReferralLink(value: any): WarMissionsReferralLink | null {
  if (!value) return null;
  return {
    id: String(value.id || ""),
    recruiterUserId: value.recruiterUserId || value.recruiter_user_id || null,
    code: String(value.code || ""),
    url: String(value.url || ""),
    active: value.active !== false,
    createdAt: value.createdAt || value.created_at || null,
  };
}

function normalizeRecruit(value: any): WarMissionsRecruit {
  return {
    id: String(value?.id || ""),
    status: String(value?.status || "pending"),
    referralCode: value?.referralCode || value?.referral_code || null,
    firstSeenAt: value?.firstSeenAt || value?.first_seen_at || null,
    walletConnectedAt: value?.walletConnectedAt || value?.wallet_connected_at || null,
    verifiedAt: value?.verifiedAt || value?.verified_at || null,
    user: value?.user
      ? {
          id: String(value.user.id || ""),
          walletAddress: String(value.user.walletAddress || value.user.wallet_address || ""),
          displayName: value.user.displayName || value.user.display_name || null,
          role: String(value.user.role || "user"),
          isBanned: Boolean(value.user.isBanned || value.user.is_banned),
        }
      : null,
  };
}

export async function requestWarMissionsAuthNonce(address: string): Promise<WarMissionsAuthNonceResponse> {
  const json = await wmFetch(`/api/wm-auth-nonce?address=${encodeURIComponent(address)}`);
  return {
    nonce: String(json?.nonce || ""),
    message: String(json?.message || ""),
    expiresAt: json?.expiresAt || null,
  };
}

export async function verifyWarMissionsAuth(address: string, signature: string) {
  return wmFetch("/api/wm-auth-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature }),
  });
}

export async function fetchWarMissionsRecruiterState(): Promise<WarMissionsRecruiterState> {
  const json = await wmFetch("/api/wm-referral-stats");
  return {
    profile: (json?.profile || null) as WarMissionsProfile | null,
    role: String(json?.role || json?.profile?.role || "user"),
    application: normalizeApplication(json?.application),
    referralLink: normalizeReferralLink(json?.referralLink),
    summary: {
      total: Number(json?.summary?.total || 0),
      pending: Number(json?.summary?.pending || 0),
      linked: Number(json?.summary?.linked || 0),
      verified: Number(json?.summary?.verified || 0),
      locked: Number(json?.summary?.locked || 0),
      rejected: Number(json?.summary?.rejected || 0),
    },
    recruits: Array.isArray(json?.recruits) ? json.recruits.map(normalizeRecruit) : [],
  };
}

export async function submitWarMissionsRecruiterApplication(payload: RecruiterApplicationPayload) {
  const json = await wmFetch("/api/wm-recruiter-apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return {
    profile: (json?.profile || null) as WarMissionsProfile | null,
    application: normalizeApplication(json?.application),
  };
}