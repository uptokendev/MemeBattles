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
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
};

function getProvider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const solana = (window as any).solana as SolanaProvider | undefined;
  if (solana?.isPhantom || solana?.connect || solana?.signMessage) return solana;
  return null;
}

// WeakSet to track providers we have already attached listeners to (prevents duplicates and MaxListeners warnings)
const attachedPhantomProviders = new WeakSet<object>();

/**
 * Attach direct Phantom provider listeners for connect/disconnect/accountChanged so that
 * the rest of the app reacts immediately when Phantom auto-connects on reload or when the
 * user connects/disconnects Phantom (even if EVM wallet is also active).
 * Also attempts a silent { onlyIfTrusted: true } connect on first attach to recover the
 * publicKey after reload without prompting the user again.
 */
export function ensurePhantomListeners(provider?: SolanaProvider | null): void {
  const p = provider || getProvider();
  if (!p || attachedPhantomProviders.has(p as object)) return;
  attachedPhantomProviders.add(p as object);

  try {
    // Many providers support this; harmless if not present.
    if (typeof (p as any).setMaxListeners === "function") {
      (p as any).setMaxListeners(0);
    }
  } catch {
    // ignore
  }

  const pushCurrent = () => {
    try {
      const key = normalizePublicKey(p.publicKey?.toString?.() || "");
      notifySolanaWalletChanged(key);
    } catch {
      // ignore
    }
  };

  const onConnect = (maybePk?: any) => {
    try {
      const key = normalizePublicKey(
        (maybePk && typeof maybePk.toString === "function" ? maybePk.toString() : "") ||
          p.publicKey?.toString?.() ||
          ""
      );
      if (key) {
        notifySolanaWalletChanged(key);
      } else {
        pushCurrent();
      }
    } catch {
      pushCurrent();
    }
  };

  const onDisconnect = () => {
    notifySolanaWalletChanged("");
  };

  const onAccountChanged = (pk?: any) => {
    try {
      const key = normalizePublicKey(
        (pk && typeof pk.toString === "function" ? pk.toString() : "") ||
          p.publicKey?.toString?.() ||
          ""
      );
      notifySolanaWalletChanged(key);
    } catch {
      pushCurrent();
    }
  };

  try { p.on?.("connect", onConnect); } catch {}
  try { p.on?.("disconnect", onDisconnect); } catch {}
  try { p.on?.("accountChanged", onAccountChanged); } catch {}

  // Fire a best-effort silent reconnect. If the site was previously trusted by Phantom,
  // this will populate provider.publicKey and fire 'connect' (or we read it after).
  // Errors are expected and ignored when not connected or first visit.
  if (typeof p.connect === "function") {
    // Defer one microtask so initial render isn't blocked.
    Promise.resolve().then(() => {
      p.connect!({ onlyIfTrusted: true } as any)
        .then((res: any) => {
          const k = normalizePublicKey(
            (res?.publicKey && typeof res.publicKey.toString === "function"
              ? res.publicKey.toString()
              : "") || p.publicKey?.toString?.() || ""
          );
          if (k) notifySolanaWalletChanged(k);
        })
        .catch(() => {
          // silent expected when no prior approval
        });
    });
  }
}

function normalizePublicKey(value: string) {
  return String(value || "").trim();
}

function notifySolanaWalletChanged(publicKey: string) {
  if (typeof window === "undefined") return;
  try {
    const key = SOLANA_WALLET_STORAGE_KEY;
    if (publicKey) {
      window.localStorage.setItem(key, publicKey);
      // Simulate storage event for same-tab listeners (real 'storage' event only fires cross-tab).
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: publicKey,
        oldValue: window.localStorage.getItem(key),
      }));
    } else {
      window.localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: null,
        oldValue: window.localStorage.getItem(key),
      }));
    }
    window.dispatchEvent(new CustomEvent(SOLANA_WALLET_EVENT, { detail: { publicKey } }));
  } catch {
    // Ignore storage/event failures.
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
  if (!res.ok || !json?.nonce) {
    const msg = String(json?.error || json?.message || "Server error");
    // The 500 "Server error" typically means the dev backend (Railway) /api/auth/nonce does not yet
    // support Solana (chainId 101 + base58 address). Per project rules, all API/backend changes
    // must be made on the dev branch (this frontend staging only proxies to it). Make sure dev
    // branch has the Solana nonce fixes (normalizeAddress for base58, isSolanaChain, etc.).
    throw new Error(msg === "Server error" ? "Server error (backend may not support Solana nonce yet — check dev branch)" : msg);
  }
  return String(json.nonce);
}

export function getSolanaProvider(): SolanaProvider | null {
  return getProvider();
}

export function getStoredSolanaWallet(): string {
  // Always ensure listeners are attached so we catch auto-connect / accountChanged from Phantom.
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
  const provider = getProvider();
  ensurePhantomListeners(provider);
  if (!provider?.connect) throw new Error("Phantom wallet not detected.");

  // Force a real user-facing connect prompt from Phantom (for Solana).
  // Some previous "silent onlyIfTrusted" or cached trust can make connect() resolve instantly
  // without popup, leading to "connected to nothing" (storage pubkey but no active approval).
  // Disconnect first (if supported), then connect with explicit onlyIfTrusted: false to ensure popup.
  if (provider.disconnect) {
    try {
      await provider.disconnect();
    } catch {
      // ignore disconnect errors (e.g. not connected)
    }
  }
  const result = await provider.connect({ onlyIfTrusted: false } as any);
  const publicKey = normalizePublicKey(result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "");
  if (!publicKey) throw new Error("No Solana public key returned.");
  notifySolanaWalletChanged(publicKey);
  return publicKey;
}

export async function disconnectSolanaWallet(): Promise<void> {
  const provider = getProvider();
  ensurePhantomListeners(provider);
  if (provider?.disconnect) await provider.disconnect();
  notifySolanaWalletChanged("");
}

export async function signSolanaDraftAction(input: {
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId?: string | null;
}): Promise<DraftActionAuth & { walletType: "solana" }> {
  const provider = getProvider();
  ensurePhantomListeners(provider);
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

// Best-effort: attach listeners as soon as this module is imported in the browser.
// Combined with the calls inside getStored/connect and the button's probes, this makes
// Phantom auto-connect on reload visible to the UI even if EVM wallet also reconnects.
if (typeof window !== "undefined") {
  // Immediate + delayed attempts cover extension load ordering and provider readiness.
  ensurePhantomListeners();
  window.setTimeout(() => ensurePhantomListeners(), 50);
  window.setTimeout(() => ensurePhantomListeners(), 200);
  window.setTimeout(() => ensurePhantomListeners(), 800);
  window.addEventListener("focus", () => ensurePhantomListeners());
  // Also try once on visibility change (tab switch back).
  document?.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "visible") ensurePhantomListeners();
  });
}
