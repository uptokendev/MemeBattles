import type { JsonRpcSigner } from "ethers";
import { apiFetch } from "@/lib/apiBase";

export type DraftAuthAction =
  | "create_draft"
  | "read_draft"
  | "save_promotion"
  | "publish_promotion"
  | "archive_draft"
  | "deploy_draft"
  | "follow_draft"
  | "comment_draft"
  | "arm_draft_notifications"
  | "draft_owner_session";

export type DraftActionAuth = {
  action: DraftAuthAction;
  walletAddress: string;
  chainId: number;
  draftId?: string | null;
  nonce: string;
  message: string;
  signature: string;
};

type NonceResult = {
  nonce: string;
  expiresAt: string | null;
};

const OWNER_SESSION_ACTION: DraftAuthAction = "draft_owner_session";
const OWNER_SESSION_CACHE_PREFIX = "mwz:draft-owner-session:v2:";
const LEGACY_OWNER_SESSION_CACHE_PREFIX = "mwz:draft-owner-session:";
const OWNER_SESSION_SAFETY_WINDOW_MS = 15 * 1000;
const OWNER_SESSION_MAX_AGE_MS = 9 * 60 * 1000;
const OWNER_SESSION_ACTIONS = new Set<DraftAuthAction>([
  "read_draft",
  "save_promotion",
  "publish_promotion",
  "archive_draft",
  "deploy_draft",
]);
const OWNER_SESSION_IN_FLIGHT = new Map<string, Promise<DraftActionAuth>>();

function normalizeWallet(value: string) {
  return String(value || "").trim().toLowerCase();
}

function buildDraftAuthMessage(input: {
  action: DraftAuthAction;
  walletAddress: string;
  chainId: number;
  nonce: string;
  draftId?: string | null;
}) {
  const lines = [
    "MemeWarzone Prepare Mode",
    `Action: ${input.action}`,
    `Wallet: ${normalizeWallet(input.walletAddress)}`,
    `Chain ID: ${Number(input.chainId)}`,
  ];

  if (input.draftId) lines.push(`Draft ID: ${input.draftId}`);
  lines.push(`Nonce: ${input.nonce}`);

  return lines.join("\n");
}

async function fetchNonce(chainId: number, walletAddress: string): Promise<NonceResult> {
  const qs = new URLSearchParams({
    chainId: String(chainId),
    address: normalizeWallet(walletAddress),
  });

  const res = await apiFetch(`/api/auth/nonce?${qs.toString()}`, {
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.nonce) {
    throw new Error(String(json?.error || json?.message || "Could not create wallet auth nonce."));
  }

  return {
    nonce: String(json.nonce),
    expiresAt: json?.expiresAt ? String(json.expiresAt) : null,
  };
}

function ownerSessionCacheKey(input: { walletAddress: string; chainId: number; draftId: string }) {
  return `${OWNER_SESSION_CACHE_PREFIX}${Number(input.chainId)}:${normalizeWallet(input.walletAddress)}:${input.draftId}`;
}

function legacyOwnerSessionCacheKey(input: { walletAddress: string; chainId: number; draftId: string }) {
  return `${LEGACY_OWNER_SESSION_CACHE_PREFIX}${Number(input.chainId)}:${normalizeWallet(input.walletAddress)}:${input.draftId}`;
}

function ownerSessionInFlightKey(input: { walletAddress: string; chainId: number; draftId: string }) {
  return ownerSessionCacheKey(input);
}

export function clearCachedDraftOwnerSession(input: { walletAddress: string; chainId: number; draftId: string }) {
  if (typeof window === "undefined") return;

  const normalized = {
    walletAddress: normalizeWallet(input.walletAddress),
    chainId: Number(input.chainId),
    draftId: input.draftId,
  };

  try {
    window.sessionStorage.removeItem(ownerSessionCacheKey(normalized));
    window.sessionStorage.removeItem(legacyOwnerSessionCacheKey(normalized));
  } catch {
    // Ignore storage failures. The user can still sign again.
  }

  OWNER_SESSION_IN_FLIGHT.delete(ownerSessionInFlightKey(normalized));
}

function readCachedOwnerSession(input: { walletAddress: string; chainId: number; draftId: string }): DraftActionAuth | null {
  if (typeof window === "undefined") return null;

  try {
    const key = ownerSessionCacheKey(input);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { auth?: DraftActionAuth; cachedAt?: number; expiresAt?: string | null };
    const auth = parsed?.auth;
    if (!auth) return null;

    const now = Date.now();
    const expiresAtMs = parsed.expiresAt ? new Date(parsed.expiresAt).getTime() : 0;
    const cachedAt = Number(parsed.cachedAt || 0);

    if (auth.action !== OWNER_SESSION_ACTION) return null;
    if (normalizeWallet(auth.walletAddress) !== normalizeWallet(input.walletAddress)) return null;
    if (Number(auth.chainId) !== Number(input.chainId)) return null;
    if (String(auth.draftId || "") !== input.draftId) return null;
    if (cachedAt <= 0 || now - cachedAt > OWNER_SESSION_MAX_AGE_MS) return null;
    if (expiresAtMs && expiresAtMs <= now + OWNER_SESSION_SAFETY_WINDOW_MS) return null;

    return auth;
  } catch {
    return null;
  }
}

function cacheOwnerSession(input: {
  auth: DraftActionAuth;
  walletAddress: string;
  chainId: number;
  draftId: string;
  expiresAt: string | null;
}) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      ownerSessionCacheKey(input),
      JSON.stringify({ auth: input.auth, cachedAt: Date.now(), expiresAt: input.expiresAt })
    );
  } catch {
    // Ignore storage failures. The user can still sign per action.
  }
}

async function createSignedDraftAction(input: {
  signer: JsonRpcSigner;
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId: string | null;
  shouldUseOwnerSession: boolean;
}): Promise<DraftActionAuth> {
  const actionToSign = input.shouldUseOwnerSession ? OWNER_SESSION_ACTION : input.action;
  const { nonce, expiresAt } = await fetchNonce(input.chainId, input.walletAddress);

  const message = buildDraftAuthMessage({
    action: actionToSign,
    walletAddress: input.walletAddress,
    chainId: input.chainId,
    nonce,
    draftId: input.draftId,
  });

  const signature = await input.signer.signMessage(message);

  const auth: DraftActionAuth = {
    action: actionToSign,
    walletAddress: input.walletAddress,
    chainId: input.chainId,
    draftId: input.draftId,
    nonce,
    message,
    signature,
  };

  if (input.shouldUseOwnerSession && input.draftId) {
    cacheOwnerSession({
      auth,
      walletAddress: input.walletAddress,
      chainId: input.chainId,
      draftId: input.draftId,
      expiresAt,
    });
  }

  return auth;
}

export async function signDraftAction(input: {
  signer: JsonRpcSigner | null | undefined;
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId?: string | null;
  forceNewOwnerSession?: boolean;
}): Promise<DraftActionAuth> {
  if (!input.signer) {
    throw new Error("Wallet signer unavailable. Reconnect your wallet and try again.");
  }

  const walletAddress = normalizeWallet(input.walletAddress);
  if (!walletAddress) {
    throw new Error("Wallet address missing. Reconnect your wallet and try again.");
  }

  const chainId = Number(input.chainId);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("Invalid wallet chain. Reconnect your wallet and try again.");
  }

  const draftId = input.draftId || null;
  const shouldUseOwnerSession = Boolean(
    draftId && OWNER_SESSION_ACTIONS.has(input.action)
  );

  if (shouldUseOwnerSession && draftId) {
    const cacheInput = { walletAddress, chainId, draftId };

    if (!input.forceNewOwnerSession) {
      const cached = readCachedOwnerSession(cacheInput);
      if (cached) return cached;

      const inFlightKey = ownerSessionInFlightKey(cacheInput);
      const inFlight = OWNER_SESSION_IN_FLIGHT.get(inFlightKey);
      if (inFlight) return inFlight;
    } else {
      clearCachedDraftOwnerSession(cacheInput);
    }

    const promise = createSignedDraftAction({
      signer: input.signer,
      walletAddress,
      chainId,
      action: input.action,
      draftId,
      shouldUseOwnerSession,
    });

    OWNER_SESSION_IN_FLIGHT.set(ownerSessionInFlightKey(cacheInput), promise);

    try {
      return await promise;
    } finally {
      OWNER_SESSION_IN_FLIGHT.delete(ownerSessionInFlightKey(cacheInput));
    }
  }

  return createSignedDraftAction({
    signer: input.signer,
    walletAddress,
    chainId,
    action: input.action,
    draftId,
    shouldUseOwnerSession,
  });
}
