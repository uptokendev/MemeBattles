import type { JsonRpcSigner } from "ethers";
import { apiFetch } from "@/lib/apiBase";

export type DraftAuthAction =
  | "create_draft"
  | "read_draft"
  | "save_promotion"
  | "publish_promotion"
  | "archive_draft"
  | "deploy_draft"
  | "manage_ticker_reservation"
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
  walletType?: "evm" | "solana";
};

type NonceResult = {
  nonce: string;
  expiresAt: string | null;
};

const OWNER_SESSION_ACTION: DraftAuthAction = "draft_owner_session";
const OWNER_SESSION_CACHE_PREFIX = "mwz:draft-owner-session:v3:";
const LEGACY_OWNER_SESSION_CACHE_PREFIXES = [
  "mwz:draft-owner-session:v2:",
  "mwz:draft-owner-session:",
];
const OWNER_SESSION_SAFETY_WINDOW_MS = 15 * 1000;
const OWNER_SESSION_MAX_AGE_MS = 9 * 60 * 1000;
const OWNER_SESSION_ACTIONS = new Set<DraftAuthAction>([
  "read_draft",
  "save_promotion",
  "publish_promotion",
  "archive_draft",
  "deploy_draft",
  "manage_ticker_reservation",
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

function ownerSessionInFlightKey(input: { walletAddress: string; chainId: number; draftId: string }) {
  return ownerSessionCacheKey(input);
}

function readCachedOwnerSession(input: { walletAddress: string; chainId: number; draftId: string }): DraftActionAuth | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ownerSessionCacheKey(input));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { auth?: DraftActionAuth; cachedAt?: number; expiresAt?: string | null };
    const auth = parsed?.auth;
    const now = Date.now();
    const cachedAt = Number(parsed.cachedAt || 0);
    const expiresAtMs = parsed.expiresAt ? new Date(parsed.expiresAt).getTime() : 0;

    if (!auth || auth.action !== OWNER_SESSION_ACTION) return null;
    if (normalizeWallet(auth.walletAddress) !== normalizeWallet(input.walletAddress)) return null;
    if (Number(auth.chainId) !== Number(input.chainId)) return null;
    if (String(auth.draftId || "") !== input.draftId) return null;
    if (!auth.nonce || !auth.message || !auth.signature) return null;
    if (cachedAt <= 0 || now - cachedAt > OWNER_SESSION_MAX_AGE_MS) return null;
    if (expiresAtMs && expiresAtMs <= now + OWNER_SESSION_SAFETY_WINDOW_MS) return null;

    return auth;
  } catch {
    return null;
  }
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
    for (const prefix of LEGACY_OWNER_SESSION_CACHE_PREFIXES) {
      window.sessionStorage.removeItem(`${prefix}${normalized.chainId}:${normalized.walletAddress}:${normalized.draftId}`);
    }
  } catch {
    // Ignore storage failures. The user can still sign again.
  }

  OWNER_SESSION_IN_FLIGHT.delete(ownerSessionInFlightKey(normalized));
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
      JSON.stringify({ auth: input.auth, cachedAt: Date.now(), expiresAt: input.expiresAt }),
    );
  } catch {
    // Ignore storage failures. The user can still sign again.
  }
}

export function cacheDraftOwnerSessionFromCreateAuth(_input: {
  auth: DraftActionAuth;
  walletAddress: string;
  chainId: number;
  draftId: string;
}) {
  // A create_draft signature is intentionally not promoted into an owner session.
  // Draft-scoped access requires a separate draft_owner_session signature.
}

async function createSignedDraftAction(input: {
  signer: JsonRpcSigner;
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId: string | null;
}): Promise<DraftActionAuth> {
  const { nonce, expiresAt } = await fetchNonce(input.chainId, input.walletAddress);
  const message = buildDraftAuthMessage({
    action: input.action,
    walletAddress: input.walletAddress,
    chainId: input.chainId,
    nonce,
    draftId: input.draftId,
  });
  const signature = await input.signer.signMessage(message);

  const auth: DraftActionAuth = {
    action: input.action,
    walletAddress: normalizeWallet(input.walletAddress),
    chainId: input.chainId,
    draftId: input.draftId,
    nonce,
    message,
    signature,
    walletType: "evm",
  };

  if (input.action === OWNER_SESSION_ACTION && input.draftId) {
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
  const useOwnerSession = Boolean(draftId && OWNER_SESSION_ACTIONS.has(input.action));
  if (!useOwnerSession || !draftId) {
    return createSignedDraftAction({
      signer: input.signer,
      walletAddress,
      chainId,
      action: input.action,
      draftId,
    });
  }

  const cacheInput = { walletAddress, chainId, draftId };
  if (input.forceNewOwnerSession) {
    clearCachedDraftOwnerSession(cacheInput);
  } else {
    const cached = readCachedOwnerSession(cacheInput);
    if (cached) return cached;
  }

  const inFlightKey = ownerSessionInFlightKey(cacheInput);
  const existing = OWNER_SESSION_IN_FLIGHT.get(inFlightKey);
  if (existing) return existing;

  const signing = createSignedDraftAction({
    signer: input.signer,
    walletAddress,
    chainId,
    action: OWNER_SESSION_ACTION,
    draftId,
  }).finally(() => {
    OWNER_SESSION_IN_FLIGHT.delete(inFlightKey);
  });

  OWNER_SESSION_IN_FLIGHT.set(inFlightKey, signing);
  return signing;
}
