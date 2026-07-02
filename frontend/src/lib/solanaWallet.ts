import type { DraftActionAuth, DraftAuthAction } from "@/lib/draftAuth";
import { apiFetch } from "@/lib/apiBase";

export const SOLANA_WALLET_STORAGE_KEY = "mwz:solana_wallet";
export const SOLANA_WALLET_NAME_STORAGE_KEY = "mwz:solana_wallet_name";
export const SOLANA_WALLET_ID_STORAGE_KEY = "mwz:solana_wallet_id";
export const SOLANA_WALLET_DISCONNECTED_KEY = "mwz:solana_wallet_disconnected";
export const SOLANA_WALLET_EVENT = "memewarzone:solana-wallet-changed";

export type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString: () => string } | null;
  connect?: (args?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, encoding?: "utf8") => Promise<{ signature: Uint8Array } | Uint8Array>;
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  [key: string]: unknown;
};

export type DetectedSolanaWallet = {
  id: string;
  name: string;
  icon: string;
  provider: SolanaProvider;
};

function normalizePublicKey(value: string) {
  return String(value || "").trim();
}

function getWindowAny() {
  return typeof window === "undefined" ? {} : (window as any);
}

function solanaDisconnected() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOLANA_WALLET_DISCONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

function setSolanaDisconnected(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(SOLANA_WALLET_DISCONNECTED_KEY, "1");
    else window.localStorage.removeItem(SOLANA_WALLET_DISCONNECTED_KEY);
  } catch {
    // ignore storage failures
  }
}

function addWallet(wallets: DetectedSolanaWallet[], seen: Set<SolanaProvider>, wallet: DetectedSolanaWallet | null) {
  if (!wallet?.provider || seen.has(wallet.provider)) return;
  if (wallets.some((item) => item.id === wallet.id)) return;
  if (typeof wallet.provider.connect !== "function") return;
  wallets.push(wallet);
  seen.add(wallet.provider);
}

export function detectSolanaWallets(): DetectedSolanaWallet[] {
  const w = getWindowAny();
  const wallets: DetectedSolanaWallet[] = [];
  const seen = new Set<SolanaProvider>();

  addWallet(wallets, seen, w.solana?.isPhantom ? { id: "phantom", name: "Phantom", icon: "👻", provider: w.solana } : null);
  addWallet(wallets, seen, w.phantom?.solana ? { id: "phantom", name: "Phantom", icon: "👻", provider: w.phantom.solana } : null);
  addWallet(wallets, seen, w.solflare ? { id: "solflare", name: "Solflare", icon: "☀️", provider: w.solflare } : null);
  addWallet(wallets, seen, w.solana?.isSolflare ? { id: "solflare", name: "Solflare", icon: "SOL", provider: w.solana } : null);
  addWallet(wallets, seen, w.backpack?.solana ? { id: "backpack", name: "Backpack", icon: "🎒", provider: w.backpack.solana } : null);
  addWallet(wallets, seen, w.glowSolana ? { id: "glow", name: "Glow", icon: "✨", provider: w.glowSolana } : null);

  return wallets;
}

export function getSolanaProvider(walletId?: string | null): SolanaProvider | null {
  const wallets = detectSolanaWallets();

  if (walletId) {
    return wallets.find((wallet) => wallet.id === walletId || wallet.name === walletId)?.provider || null;
  }

  const storedId = getStoredSolanaWalletId();
  if (storedId) {
    const stored = wallets.find((wallet) => wallet.id === storedId);
    if (stored) return stored.provider;
  }

  return wallets[0]?.provider || null;
}

function notifySolanaWalletChanged(publicKey: string, wallet?: DetectedSolanaWallet | null) {
  if (typeof window === "undefined") return;

  try {
    if (publicKey) {
      if (solanaDisconnected()) return;
      window.localStorage.setItem(SOLANA_WALLET_STORAGE_KEY, publicKey);
      if (wallet?.name) window.localStorage.setItem(SOLANA_WALLET_NAME_STORAGE_KEY, wallet.name);
      if (wallet?.id) window.localStorage.setItem(SOLANA_WALLET_ID_STORAGE_KEY, wallet.id);
    } else {
      window.localStorage.removeItem(SOLANA_WALLET_STORAGE_KEY);
      window.localStorage.removeItem(SOLANA_WALLET_NAME_STORAGE_KEY);
      window.localStorage.removeItem(SOLANA_WALLET_ID_STORAGE_KEY);
    }

    window.dispatchEvent(new CustomEvent(SOLANA_WALLET_EVENT, {
      detail: {
        publicKey,
        walletId: wallet?.id || "",
        walletName: wallet?.name || "",
      },
    }));
  } catch {
    // Ignore storage/event failures.
  }
}

export function getStoredSolanaWallet(): string {
  if (typeof window === "undefined" || solanaDisconnected()) return "";
  try {
    return normalizePublicKey(window.localStorage.getItem(SOLANA_WALLET_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

export function getStoredSolanaWalletName(): string {
  if (typeof window === "undefined" || solanaDisconnected()) return "";
  try {
    return window.localStorage.getItem(SOLANA_WALLET_NAME_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function getStoredSolanaWalletId(): string {
  if (typeof window === "undefined" || solanaDisconnected()) return "";
  try {
    return window.localStorage.getItem(SOLANA_WALLET_ID_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function refreshSolanaWalletFromProvider(walletId?: string | null): string {
  if (solanaDisconnected()) return "";
  const wallets = detectSolanaWallets();
  const selected =
    (walletId ? wallets.find((wallet) => wallet.id === walletId || wallet.name === walletId) : null) ||
    wallets.find((wallet) => wallet.id === getStoredSolanaWalletId());

  const publicKey = normalizePublicKey(selected?.provider?.publicKey?.toString?.() || "");
  if (publicKey) notifySolanaWalletChanged(publicKey, selected);
  return publicKey;
}

const attachedSolanaProviders = new WeakSet<object>();

export function ensureSolanaListeners(options: { readExistingAccount?: boolean } = {}): void {
  const wallets = detectSolanaWallets();

  wallets.forEach((wallet) => {
    const provider = wallet.provider;
    if (!provider || typeof provider !== "object") return;
    if (attachedSolanaProviders.has(provider as object)) return;

    attachedSolanaProviders.add(provider as object);

    const sync = (clearIfEmpty = false) => {
      if (solanaDisconnected()) return;
      const key = normalizePublicKey(provider.publicKey?.toString?.() || "");
      if (key || clearIfEmpty) notifySolanaWalletChanged(key, wallet);
    };

    try { provider.on?.("connect", () => sync(true)); } catch {}
    try { provider.on?.("disconnect", () => notifySolanaWalletChanged("")); } catch {}
    try { provider.on?.("accountChanged", () => sync(true)); } catch {}

    if (options.readExistingAccount) sync(false);
  });
}

export async function connectSolanaWallet(walletId?: string): Promise<{ publicKey: string; walletId: string; walletName: string }> {
  setSolanaDisconnected(false);
  const wallets = detectSolanaWallets();
  const wallet = wallets.find((item) => item.id === walletId || item.name === walletId) || wallets[0];

  if (!wallet?.provider?.connect) {
    throw new Error("No supported Solana wallet detected. Install Phantom, Solflare, Backpack, or Glow.");
  }

  let result: { publicKey?: { toString: () => string } } | undefined;

  if (wallet.id === "phantom") {
    try {
      await wallet.provider.disconnect?.();
    } catch {
      // ignore Phantom disconnect errors
    }
    result = await wallet.provider.connect({ onlyIfTrusted: false } as any);
  } else {
    result = await wallet.provider.connect();
  }

  const publicKey = normalizePublicKey(result?.publicKey?.toString() || wallet.provider.publicKey?.toString?.() || "");
  if (!publicKey) throw new Error("No Solana public key returned.");

  notifySolanaWalletChanged(publicKey, wallet);

  return {
    publicKey,
    walletId: wallet.id,
    walletName: wallet.name,
  };
}

export async function disconnectSolanaWallet(): Promise<void> {
  const provider = getSolanaProvider();
  setSolanaDisconnected(true);
  try {
    await provider?.disconnect?.();
  } finally {
    notifySolanaWalletChanged("");
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export async function signSolanaMessage(message: string, walletAddress?: string): Promise<{ walletAddress: string; signature: string }> {
  const storedId = getStoredSolanaWalletId();
  const provider = getSolanaProvider(storedId || null);
  if (!provider?.signMessage) throw new Error("This Solana wallet does not support message signing.");

  let publicKey = normalizePublicKey(provider.publicKey?.toString?.() || "");
  if (!publicKey && provider.connect) {
    const result = await provider.connect({ onlyIfTrusted: false } as any);
    publicKey = normalizePublicKey(result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "");
  }
  if (!publicKey) throw new Error("Solana wallet not connected.");
  if (walletAddress && normalizePublicKey(walletAddress) !== publicKey) throw new Error("Connected Solana wallet does not match the selected payout wallet.");

  const encoded = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encoded, "utf8");
  const signature = signed instanceof Uint8Array ? signed : signed.signature;
  if (!signature?.length) throw new Error("Solana wallet did not return a signature.");

  notifySolanaWalletChanged(publicKey, detectSolanaWallets().find((wallet) => wallet.id === storedId) || null);
  return { walletAddress: publicKey, signature: bytesToBase64(signature) };
}

async function fetchNonce(chainId: number, walletAddress: string) {
  const qs = new URLSearchParams({ chainId: String(chainId), address: walletAddress });
  const res = await apiFetch(`/api/auth/nonce?${qs.toString()}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.nonce) {
    throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
  }

  return String(json.nonce);
}

export async function signSolanaDraftAction(input: {
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId?: string | null;
}): Promise<DraftActionAuth & { walletType: "solana" }> {
  const provider = getSolanaProvider();

  if (!provider?.signMessage) {
    throw new Error("This Solana wallet does not support message signing.");
  }

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
  const signature = signed instanceof Uint8Array ? signed : signed.signature;
  if (!signature?.length) throw new Error("Solana wallet did not return a signature.");

  notifySolanaWalletChanged(walletAddress, detectSolanaWallets().find((wallet) => wallet.provider === provider) || null);
  return { walletType: "solana", walletAddress, signature: bytesToBase64(signature), message };
}
