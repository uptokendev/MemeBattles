import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { syncWalletRecruiterAttribution } from "@/lib/recruiterApi";

export type WalletType =
  | "metamask"
  | "rabby"
  | "coinbase"
  | "binance"
  | "trust"
  | "okx"
  | "phantom"
  | "rainbow"
  | "brave"
  | "frame"
  | "injected"
  | (string & {});

type Eip1193RequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export type Eip1193Provider = {
  request<T = unknown>(args: Eip1193RequestArgs): Promise<T>;
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  selectedAddress?: string | null;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  isBinance?: boolean;
  isBinanceChain?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isPhantom?: boolean;
  isBraveWallet?: boolean;
  [key: string]: unknown;
};

type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
};

export type DetectedWallet = {
  id: WalletType;
  name: string;
  description: string;
  rdns: string;
  icon?: string;
  provider: Eip1193Provider;
  source: "eip6963" | "legacy";
  installed: true;
  sortScore: number;
};

export type WalletHook = {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string;
  chainId?: number;
  connecting: boolean;
  connectingWalletId: WalletType | null;
  detectedWallets: DetectedWallet[];
  hasInjectedWallets: boolean;
  connect: (wallet?: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
  detectWallets: () => DetectedWallet[];
  isConnected: boolean;
};

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
    "eip6963:requestProvider": Event;
    "memebattles:openWalletModal": CustomEvent<void>;
  }

  interface Window {
    ethereum?: Eip1193Provider;
    BinanceChain?: Eip1193Provider;
    binanceChain?: Eip1193Provider;
  }
}

const SELECTED_WALLET_KEY = "mwz:selected_wallet";
const DISCONNECTED_KEY = "mwz:wallet:disconnected";
const LEGACY_CONNECTED_KEY = "mwz_wallet_connected";

const EIP6963_WALLETS = new Map<string, Eip6963ProviderDetail>();
const EIP6963_SUBSCRIBERS = new Set<() => void>();
let eip6963ListenerStarted = false;

function normalizeHexAddress(value?: string | null): string {
  const v = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(v) ? v.toLowerCase() : "";
}

function normalizeAccounts(accounts: unknown): string[] {
  if (!Array.isArray(accounts)) return [];
  return accounts.map((account) => normalizeHexAddress(String(account))).filter(Boolean);
}

function clearWarRoomSessionCache() {
  if (typeof window === "undefined") return;

  try {
    const toDelete: string[] = [];

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;

      if (
        key.startsWith("mwz:warroom:") ||
        key.startsWith("mwz:chat:") ||
        key.startsWith("mwz:tokenchat:")
      ) {
        toDelete.push(key);
      }
    }

    toDelete.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage failures in private windows or restricted browsers.
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedObject(value: unknown, key: string): Record<string, unknown> {
  if (!isObject(value)) return {};
  const nested = value[key];
  return isObject(nested) ? nested : {};
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getFlag(provider: Eip1193Provider, key: string): boolean {
  return Boolean(provider[key]);
}

function getProviderMeta(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>) {
  const providerInfo = getNestedObject(provider, "providerInfo");
  const legacyInfo = getNestedObject(provider, "info");
  const metadata = getNestedObject(provider, "metadata");

  const name =
    info?.name ||
    getString(providerInfo.name) ||
    getString(legacyInfo.name) ||
    getString(metadata.name) ||
    getString(provider.name) ||
    getString(provider._walletName);

  const rdns =
    info?.rdns ||
    getString(providerInfo.rdns) ||
    getString(legacyInfo.rdns) ||
    getString(metadata.rdns) ||
    getString(provider.rdns) ||
    getString(provider._rdns);

  return {
    name,
    nameLower: name.toLowerCase(),
    rdns,
    rdnsLower: rdns.toLowerCase(),
    icon: info?.icon || getString(providerInfo.icon) || getString(legacyInfo.icon) || getString(metadata.icon),
    uuid: info?.uuid || getString(providerInfo.uuid) || getString(legacyInfo.uuid),
  };
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function sanitizeWalletId(value: string): WalletType {
  const sanitized = value
    .toLowerCase()
    .replace(/^com\./, "")
    .replace(/^io\./, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return (sanitized || "injected") as WalletType;
}

type WalletBrand = {
  id: WalletType;
  name: string;
  description: string;
  score: number;
};

function classifyWallet(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>): WalletBrand {
  const meta = getProviderMeta(provider, info);
  const { nameLower, rdnsLower } = meta;

  if (getFlag(provider, "isRabby") || includesAny(nameLower, ["rabby"]) || includesAny(rdnsLower, ["rabby"])) {
    return { id: "rabby", name: meta.name || "Rabby", description: "Risk-aware EVM wallet with transaction previews.", score: 98 };
  }

  if (
    getFlag(provider, "isBinance") ||
    getFlag(provider, "isBinanceChain") ||
    includesAny(nameLower, ["binance"]) ||
    includesAny(rdnsLower, ["binance"])
  ) {
    return { id: "binance", name: meta.name || "Binance Wallet", description: "BNB Chain-native EVM wallet.", score: 96 };
  }

  if (getFlag(provider, "isCoinbaseWallet") || includesAny(nameLower, ["coinbase"]) || includesAny(rdnsLower, ["coinbase"])) {
    return { id: "coinbase", name: meta.name || "Coinbase Wallet", description: "Coinbase self-custody EVM wallet.", score: 94 };
  }

  if (
    getFlag(provider, "isTrust") ||
    getFlag(provider, "isTrustWallet") ||
    includesAny(nameLower, ["trust"]) ||
    includesAny(rdnsLower, ["trust"])
  ) {
    return { id: "trust", name: meta.name || "Trust Wallet", description: "Mobile-first wallet with BNB Chain support.", score: 92 };
  }

  if (
    getFlag(provider, "isOkxWallet") ||
    getFlag(provider, "isOKExWallet") ||
    includesAny(nameLower, ["okx", "okex"]) ||
    includesAny(rdnsLower, ["okx", "okex"])
  ) {
    return { id: "okx", name: meta.name || "OKX Wallet", description: "Multi-chain EVM wallet.", score: 88 };
  }

  if (getFlag(provider, "isPhantom") || includesAny(nameLower, ["phantom"]) || includesAny(rdnsLower, ["phantom"])) {
    return { id: "phantom", name: meta.name || "Phantom", description: "Multi-chain wallet with EVM support.", score: 86 };
  }

  if (includesAny(nameLower, ["rainbow"]) || includesAny(rdnsLower, ["rainbow"])) {
    return { id: "rainbow", name: meta.name || "Rainbow", description: "Ethereum and EVM wallet.", score: 84 };
  }

  if (getFlag(provider, "isBraveWallet") || includesAny(nameLower, ["brave"]) || includesAny(rdnsLower, ["brave"])) {
    return { id: "brave", name: meta.name || "Brave Wallet", description: "Built-in Brave browser wallet.", score: 82 };
  }

  if (includesAny(nameLower, ["frame"]) || includesAny(rdnsLower, ["frame"])) {
    return { id: "frame", name: meta.name || "Frame", description: "Desktop EVM wallet.", score: 80 };
  }

  if (
    getFlag(provider, "isMetaMask") ||
    getFlag(provider, "_metamask") ||
    includesAny(nameLower, ["metamask"]) ||
    includesAny(rdnsLower, ["metamask"])
  ) {
    return { id: "metamask", name: meta.name || "MetaMask", description: "Popular injected EVM browser wallet.", score: 90 };
  }

  const idSource = meta.rdns || meta.name || meta.uuid || "injected";

  return {
    id: sanitizeWalletId(idSource),
    name: meta.name || "Injected EVM Wallet",
    description: "Detected EVM-compatible injected wallet.",
    score: 50,
  };
}

function dedupeProviders(candidates: Array<Eip1193Provider | null | undefined>) {
  const seen = new Set<Eip1193Provider>();
  const out: Eip1193Provider[] = [];

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || typeof candidate.request !== "function") continue;
    seen.add(candidate);
    out.push(candidate);
  }

  return out;
}

function getLegacyInjectedProviders() {
  if (typeof window === "undefined") return [];

  return dedupeProviders([
    ...(Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : []),
    window.ethereum,
    window.BinanceChain,
    window.binanceChain,
  ]);
}

function startEip6963Discovery() {
  if (typeof window === "undefined" || eip6963ListenerStarted) return;

  const onAnnounce = (event: WindowEventMap["eip6963:announceProvider"]) => {
    const detail = event.detail;
    if (!detail?.provider || typeof detail.provider.request !== "function") return;

    const meta = getProviderMeta(detail.provider, detail.info);
    const key = detail.info?.uuid || meta.rdns || meta.name || String(EIP6963_WALLETS.size + 1);
    EIP6963_WALLETS.set(key, detail);
    EIP6963_SUBSCRIBERS.forEach((subscriber) => subscriber());
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  eip6963ListenerStarted = true;
}

function requestEip6963Providers() {
  if (typeof window === "undefined") return;

  startEip6963Discovery();

  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // Ignore older browser event issues.
  }
}

function makeDetectedWallet(
  provider: Eip1193Provider,
  source: "eip6963" | "legacy",
  info?: Partial<Eip6963ProviderInfo>,
): DetectedWallet {
  const meta = getProviderMeta(provider, info);
  const brand = classifyWallet(provider, info);

  return {
    id: brand.id,
    name: brand.name,
    description: brand.description,
    rdns: meta.rdns,
    icon: meta.icon,
    provider,
    source,
    installed: true,
    sortScore: brand.score + (source === "eip6963" ? 8 : 0),
  };
}

function getDetectedWalletsSnapshot(): DetectedWallet[] {
  if (typeof window === "undefined") return [];

  requestEip6963Providers();

  const eip6963 = [...EIP6963_WALLETS.values()].map((detail) =>
    makeDetectedWallet(detail.provider, "eip6963", detail.info),
  );
  const legacy = getLegacyInjectedProviders().map((provider) => makeDetectedWallet(provider, "legacy"));

  const seenProviders = new Set<Eip1193Provider>();
  const seenKeys = new Set<string>();
  const seenIds = new Map<string, number>();
  const wallets: DetectedWallet[] = [];

  for (const wallet of [...eip6963, ...legacy]) {
    if (seenProviders.has(wallet.provider)) continue;

    const providerKey = wallet.rdns || `${wallet.name}:${wallet.source}`.toLowerCase();
    if (providerKey && seenKeys.has(providerKey) && wallet.source === "legacy") continue;

    const existingIdCount = seenIds.get(wallet.id) ?? 0;
    const id = existingIdCount > 0 ? (`${wallet.id}-${existingIdCount + 1}` as WalletType) : wallet.id;

    seenProviders.add(wallet.provider);
    if (providerKey) seenKeys.add(providerKey);
    seenIds.set(wallet.id, existingIdCount + 1);
    wallets.push({ ...wallet, id });
  }

  return wallets.sort((a, b) => b.sortScore - a.sortScore || a.name.localeCompare(b.name));
}

function subscribeToWalletDiscovery(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;

  startEip6963Discovery();
  EIP6963_SUBSCRIBERS.add(callback);
  requestEip6963Providers();

  const timeout = window.setTimeout(callback, 350);

  return () => {
    EIP6963_SUBSCRIBERS.delete(callback);
    window.clearTimeout(timeout);
  };
}

function findDetectedWallet(walletId: WalletType | null | undefined) {
  const wallets = getDetectedWalletsSnapshot();
  if (!walletId) return wallets[0] ?? null;

  return (
    wallets.find((wallet) => wallet.id === walletId) ||
    wallets.find((wallet) => wallet.id.startsWith(`${walletId}-`)) ||
    wallets.find((wallet) => classifyWallet(wallet.provider).id === walletId) ||
    null
  );
}

async function choosePrimaryAccount(selectedProvider: Eip1193Provider, accounts: string[]) {
  const normalized = accounts.map((account) => normalizeHexAddress(account)).filter(Boolean);
  const selectedAddress = normalizeHexAddress(selectedProvider.selectedAddress);

  if (selectedAddress && normalized.includes(selectedAddress)) return selectedAddress;

  try {
    const fromEthAccounts = await selectedProvider.request<unknown>({ method: "eth_accounts" });
    const active = normalizeAccounts(fromEthAccounts);

    if (selectedAddress && active.includes(selectedAddress)) return selectedAddress;
    if (active[0]) return active[0];
  } catch {
    // Ignore read-only account failures; eth_requestAccounts may still succeed.
  }

  return normalized[0] ?? "";
}

function parseChainId(value: unknown): number | undefined {
  try {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string") return Number(BigInt(value));
  } catch {
    return undefined;
  }

  return undefined;
}

function isUserRejectedRequest(error: unknown) {
  if (!isObject(error)) return false;

  const code = error.code;
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";

  return code === 4001 || message.includes("user rejected") || message.includes("user denied");
}

function getErrorMessage(error: unknown) {
  if (isObject(error) && typeof error.message === "string") return error.message;
  return String(error || "Wallet connection failed.");
}

function dispatchOpenWalletModal() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
}

export function useWallet(): WalletHook {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [connecting, setConnecting] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<WalletType | null>(null);
  const [detectedWallets, setDetectedWallets] = useState<DetectedWallet[]>([]);

  const eip1193Ref = useRef<Eip1193Provider | null>(null);
  const selectedWalletTypeRef = useRef<WalletType | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const syncRecruiterAttribution = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;

    try {
      await syncWalletRecruiterAttribution(walletAddress);
    } catch {
      // Best-effort sync. Do not block wallet UX on attribution API issues.
    }
  }, []);

  const detectWallets = useCallback(() => {
    const wallets = getDetectedWalletsSnapshot();
    setDetectedWallets(wallets);
    return wallets;
  }, []);

  const resetWalletState = useCallback(() => {
    eip1193Ref.current = null;
    setAccount("");
    setSigner(null);
    setProvider(null);
    setChainId(undefined);
    clearWarRoomSessionCache();
  }, []);

  const bindEip1193Listeners = useCallback(
    (selectedProvider: Eip1193Provider) => {
      cleanupRef.current?.();
      cleanupRef.current = null;

      if (!selectedProvider.on) return;

      const rebuildState = async () => {
        try {
          const bp = new BrowserProvider(selectedProvider);
          setProvider(bp);

          const network = await bp.getNetwork();
          setChainId(Number(network.chainId));

          const accounts = await selectedProvider.request<unknown>({ method: "eth_accounts" });
          const chosen = await choosePrimaryAccount(selectedProvider, normalizeAccounts(accounts));
          setAccount(chosen);

          if (!chosen) {
            setSigner(null);
            clearWarRoomSessionCache();
            return;
          }

          void syncRecruiterAttribution(chosen);
          const nextSigner = await bp.getSigner(chosen);
          setSigner(nextSigner);
        } catch {
          setSigner(null);
        }
      };

      const onAccountsChanged = async (accounts: unknown) => {
        const chosen = await choosePrimaryAccount(selectedProvider, normalizeAccounts(accounts));

        setAccount((prev) => {
          if (prev && chosen && prev.toLowerCase() !== chosen.toLowerCase()) {
            clearWarRoomSessionCache();
          }

          return chosen;
        });

        if (!chosen) {
          setSigner(null);
          clearWarRoomSessionCache();
          return;
        }

        void syncRecruiterAttribution(chosen);

        try {
          const bp = new BrowserProvider(selectedProvider);
          setProvider(bp);
          const nextSigner = await bp.getSigner(chosen);
          setSigner(nextSigner);
        } catch {
          setSigner(null);
        }
      };

      const onChainChanged = async (nextChainId: unknown) => {
        setChainId(parseChainId(nextChainId));
        await rebuildState();
      };

      const onDisconnect = () => {
        resetWalletState();
      };

      const onVisibilityOrFocus = async () => {
        await rebuildState();
      };

      selectedProvider.on("accountsChanged", onAccountsChanged);
      selectedProvider.on("chainChanged", onChainChanged);
      selectedProvider.on("disconnect", onDisconnect);
      window.addEventListener("focus", onVisibilityOrFocus);
      document.addEventListener("visibilitychange", onVisibilityOrFocus);

      cleanupRef.current = () => {
        try {
          selectedProvider.removeListener?.("accountsChanged", onAccountsChanged);
          selectedProvider.removeListener?.("chainChanged", onChainChanged);
          selectedProvider.removeListener?.("disconnect", onDisconnect);
        } catch {
          // Ignore wallet listener cleanup failures.
        }

        window.removeEventListener("focus", onVisibilityOrFocus);
        document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      };
    },
    [resetWalletState, syncRecruiterAttribution],
  );

  const hydrateSelectedProvider = useCallback(async () => {
    if (typeof window === "undefined") return;

    detectWallets();

    const explicitlyDisconnected = window.localStorage.getItem(DISCONNECTED_KEY) === "1";
    if (explicitlyDisconnected) return;

    const storedType = window.localStorage.getItem(SELECTED_WALLET_KEY) as WalletType | null;
    selectedWalletTypeRef.current = storedType;

    const selectedWallet = findDetectedWallet(storedType);
    const selected = selectedWallet?.provider;
    if (!selected) return;

    try {
      const accounts = await selected.request<unknown>({ method: "eth_accounts" });
      const chosen = await choosePrimaryAccount(selected, normalizeAccounts(accounts));
      if (!chosen) return;

      eip1193Ref.current = selected;
      bindEip1193Listeners(selected);

      const bp = new BrowserProvider(selected);
      setProvider(bp);
      setAccount(chosen);
      void syncRecruiterAttribution(chosen);

      const nextSigner = await bp.getSigner(chosen);
      setSigner(nextSigner);

      const network = await bp.getNetwork();
      setChainId(Number(network.chainId));

      window.localStorage.setItem(SELECTED_WALLET_KEY, selectedWallet.id);
      window.localStorage.removeItem(DISCONNECTED_KEY);
    } catch {
      // Never prompt during hydration. The modal handles interactive connection.
    }
  }, [bindEip1193Listeners, detectWallets, syncRecruiterAttribution]);

  useEffect(() => {
    const unsubscribe = subscribeToWalletDiscovery(() => {
      setDetectedWallets(getDetectedWalletsSnapshot());
    });

    setDetectedWallets(getDetectedWalletsSnapshot());
    void hydrateSelectedProvider();

    return () => {
      unsubscribe();
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [hydrateSelectedProvider]);

  const connect = useCallback(
    async (wallet?: WalletType) => {
      if (typeof window === "undefined") {
        throw new Error("No browser environment detected.");
      }

      if (!wallet) {
        dispatchOpenWalletModal();
        return;
      }

      const selectedWallet = findDetectedWallet(wallet);
      const selected = selectedWallet?.provider;

      if (!selected) {
        throw new Error("Wallet not detected. Install an EVM wallet or open MemeWarzone inside your wallet browser.");
      }

      setConnecting(true);
      setConnectingWalletId(selectedWallet.id);

      try {
        try {
          await selected.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
        } catch (error) {
          if (isUserRejectedRequest(error)) throw error;
          // Some wallets do not implement wallet_requestPermissions. eth_requestAccounts is the fallback.
        }

        const accounts = await selected.request<unknown>({ method: "eth_requestAccounts" });
        const chosen = await choosePrimaryAccount(selected, normalizeAccounts(accounts));

        if (!chosen) {
          throw new Error("No wallet account returned.");
        }

        eip1193Ref.current = selected;
        selectedWalletTypeRef.current = selectedWallet.id;
        bindEip1193Listeners(selected);

        const browserProvider = new BrowserProvider(selected);
        setProvider(browserProvider);
        setAccount(chosen);
        void syncRecruiterAttribution(chosen);

        const nextSigner = await browserProvider.getSigner(chosen);
        setSigner(nextSigner);

        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));

        window.localStorage.setItem(SELECTED_WALLET_KEY, selectedWallet.id);
        window.localStorage.removeItem(DISCONNECTED_KEY);
        window.localStorage.removeItem(LEGACY_CONNECTED_KEY);
      } catch (error) {
        throw new Error(getErrorMessage(error));
      } finally {
        setConnecting(false);
        setConnectingWalletId(null);
      }
    },
    [bindEip1193Listeners, syncRecruiterAttribution],
  );

  const disconnect = useCallback(async () => {
    const selected = eip1193Ref.current;

    cleanupRef.current?.();
    cleanupRef.current = null;

    if (selected?.request) {
      try {
        await selected.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      } catch {
        // Most injected wallets do not support explicit revoke. Local state still disconnects.
      }
    }

    resetWalletState();

    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISCONNECTED_KEY, "1");
      window.localStorage.removeItem(LEGACY_CONNECTED_KEY);
    }
  }, [resetWalletState]);

  return useMemo(
    () => ({
      provider,
      signer,
      account,
      chainId,
      connecting,
      connectingWalletId,
      detectedWallets,
      hasInjectedWallets: detectedWallets.length > 0,
      connect,
      disconnect,
      detectWallets,
      isConnected: Boolean(account && signer),
    }),
    [
      provider,
      signer,
      account,
      chainId,
      connecting,
      connectingWalletId,
      detectedWallets,
      connect,
      disconnect,
      detectWallets,
    ],
  );
}
