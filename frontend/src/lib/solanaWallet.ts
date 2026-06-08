import type { DraftActionAuth, DraftAuthAction } from "@/lib/draftAuth";
import { apiFetch } from "@/lib/apiBase";

export const SOLANA_WALLET_STORAGE_KEY = "mwz:solana_wallet";
export const SOLANA_WALLET_EVENT = "memewarzone:solana-wallet-changed";

export type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString: () => string } | null;
  connect?: (args?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, encoding?: "utf8") => Promise<{ signature: Uint8Array }>;
  // Phantom (and some other Solana wallets) emit these
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
};

function getProvider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const solana = (window as any).solana as SolanaProvider | undefined;
  if (solana?.isPhantom || solana?.connect || solana?.signMessage) return solana;
  return null;
}

function normalizePublicKey(value: string) {
  return String(value || "").trim();
}

function notifySolanaWalletChanged(publicKey: string) {
  if (typeof window === "undefined") return;
  try {
    if (publicKey) window.localStorage.setItem(SOLANA_WALLET_STORAGE_KEY, publicKey);
    else window.localStorage.removeItem(SOLANA_WALLET_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(SOLANA_WALLET_EVENT, { detail: { publicKey } }));
  } catch {
    // Ignore storage/event failures.
  }
}

// --- Global Phantom provider listener attachment (ensures app-wide immediate reaction) ---
// This makes getStoredSolanaWallet() + SOLANA_WALLET_EVENT always reflect live
// connect/disconnect/accountChanged even if no component manually subscribed.
let phantomListenersAttached = false;
let attachedPhantomProvider: SolanaProvider | null = null;

function ensurePhantomListeners() {
  if (typeof window === "undefined" || phantomListenersAttached) return;

  const provider = getProvider();
  if (!provider) return;

  // Avoid re-attaching to the exact same provider instance
  if (attachedPhantomProvider === provider) {
    phantomListenersAttached = true;
    return;
  }

  // Detach from previous if provider instance changed
  if (attachedPhantomProvider?.removeListener) {
    // We don't keep handler refs here for the global one (cheap to leave a couple listeners behind on rare re-inject).
  }

  attachedPhantomProvider = provider;
  phantomListenersAttached = true;

  // Many wallet injected providers (and their internal streams) use EventEmitters
  // with a low default max listener count (10). Adding our few listeners (plus
  // the extension's own 'close'/'end' listeners for streams) can trigger the
  // MaxListenersExceededWarning. Raise the limit for this provider.
  try {
    if (typeof (provider as any).setMaxListeners === "function") {
      (provider as any).setMaxListeners(0); // 0 = unlimited for this emitter
    }
  } catch {
    // ignore
  }

  const onConnect = () => {
    const key = normalizePublicKey(provider.publicKey?.toString?.() || "");
    if (key) notifySolanaWalletChanged(key);
  };

  const onDisconnect = () => {
    notifySolanaWalletChanged("");
  };

  const onAccountChanged = (newPublicKey: unknown) => {
    if (newPublicKey) {
      const key = normalizePublicKey(
        typeof newPublicKey === "string" ? newPublicKey : (newPublicKey as any)?.toString?.() || ""
      );
      if (key) notifySolanaWalletChanged(key);
    } else {
      notifySolanaWalletChanged("");
    }
  };

  try {
    provider.on?.("connect", onConnect);
    provider.on?.("disconnect", onDisconnect);
    provider.on?.("accountChanged", onAccountChanged);
    provider.on?.("accountsChanged", onAccountChanged);
  } catch {
    // provider may not support events; getStored will still poll on focus etc.
  }

  // If it was already connected when we attached, make sure storage/event reflects it now.
  const current = normalizePublicKey(provider.publicKey?.toString?.() || "");
  if (current) {
    // Only notify if different from storage to avoid unnecessary events
    try {
      const stored = window.localStorage.getItem(SOLANA_WALLET_STORAGE_KEY) || "";
      if (normalizePublicKey(stored) !== current) {
        notifySolanaWalletChanged(current);
      }
    } catch {
      notifySolanaWalletChanged(current);
    }
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function fetchNonce(chainId: number, walletAddress: string) {
  const qs = new URLSearchParams({ chainId: String(chainId), address: walletAddress });
  const res = await apiFetch(`/api/auth/nonce?${qs.toString()}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.nonce) throw new Error(String(json?.error || json?.message || "Could not create Solana auth nonce."));
  return String(json.nonce);
}

export function getSolanaProvider(): SolanaProvider | null {
  ensurePhantomListeners();
  return getProvider();
}

export function getStoredSolanaWallet(): string {
  ensurePhantomListeners();
  const providerKey = normalizePublicKey(getProvider()?.publicKey?.toString?.() || "");
  if (providerKey) return providerKey;
  if (typeof window === "undefined") return "";
  try {
    return normalizePublicKey(window.localStorage.getItem(SOLANA_WALLET_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

export async function connectSolanaWallet(): Promise<string> {
  ensurePhantomListeners();
  const provider = getProvider();
  if (!provider?.connect) throw new Error("Phantom wallet not detected.");
  const result = await provider.connect();
  const publicKey = normalizePublicKey(result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "");
  if (!publicKey) throw new Error("No Solana public key returned.");
  notifySolanaWalletChanged(publicKey);
  return publicKey;
}

export async function disconnectSolanaWallet(): Promise<void> {
  ensurePhantomListeners();
  const provider = getProvider();
  if (provider?.disconnect) await provider.disconnect();
  notifySolanaWalletChanged("");
}

export async function signSolanaDraftAction(input: {
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId?: string | null;
}): Promise<DraftActionAuth & { walletType: "solana" }> {
  ensurePhantomListeners();
  const provider = getProvider();
  if (!provider?.signMessage) throw new Error("Phantom message signing is unavailable.");

  const walletAddress = normalizePublicKey(input.walletAddress || provider.publicKey?.toString?.() || getStoredSolanaWallet());
  if (!walletAddress) throw new Error("Solana wallet not connected.");

  const nonce = await fetchNonce(input.chainId, walletAddress);
  const lines = [
    "MemeWarzone Prepare Mode",
    `Action: ${input.action}`,
    `Wallet: ${walletAddress}`,
    `Chain ID: ${Number(input.chainId)}`,
  ];
  if (input.draftId) lines.push(`Draft ID: ${input.draftId}`);
  lines.push(`Nonce: ${nonce}`);
  const message = lines.join("\n");
  const encoded = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encoded, "utf8");

  return {
    action: input.action,
    walletType: "solana",
    walletAddress,
    chainId: Number(input.chainId),
    draftId: input.draftId || null,
    nonce,
    message,
    signature: bytesToBase64(signed.signature),
  };
}
