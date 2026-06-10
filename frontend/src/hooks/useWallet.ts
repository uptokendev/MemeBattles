import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { syncWalletRecruiterAttribution } from "@/lib/recruiterApi";
import { isAllowedChainId, isSupportedChainId } from "@/lib/chainConfig";

export type WalletType =
  | "metamask"
  | "rabby"
  | "coinbase"
  | "binance"
  | "trust"
  | "cryptocom"
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
  /** True only when an EVM wallet is connected AND on a supported chain (56). False when on wrong chain. */
  isOnSupportedChain: boolean;
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
let eip6963RequestInFlight = false;

function normalizeHexAddress(value?: string | null): string {
  const v = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(v) ? v.toLowerCase() : "";
}

function normalizeAccounts(accounts: unknown): string[] {
  if (!Array.isArray(accounts)) return [];
  return accounts.map((account) => normalizeHexAddress(String(account))).filter(Boolean);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getMeta(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>) {
  const pInfo = isObject(provider.providerInfo) ? provider.providerInfo : {};
  const legacyInfo = isObject(provider.info) ? provider.info : {};
  const metadata = isObject(provider.metadata) ? provider.metadata : {};
  const name = info?.name || getString(pInfo.name) || getString(legacyInfo.name) || getString(metadata.name) || getString(provider.name) || getString(provider._walletName);
  const rdns = info?.rdns || getString(pInfo.rdns) || getString(legacyInfo.rdns) || getString(metadata.rdns) || getString(provider.rdns) || getString(provider._rdns);
  const icon = info?.icon || getString(pInfo.icon) || getString(legacyInfo.icon) || getString(metadata.icon);
  return { name, rdns, icon, nameLower: name.toLowerCase(), rdnsLower: rdns.toLowerCase() };
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function walletBrand(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>) {
  const meta = getMeta(provider, info);
  const name = meta.nameLower;
  const rdns = meta.rdnsLower;
  const flag = (key: string) => Boolean(provider[key]);

  if (flag("isRabby") || hasAny(name, ["rabby"]) || hasAny(rdns, ["rabby"])) return { id: "rabby" as WalletType, name: meta.name || "Rabby", description: "Risk-aware EVM wallet.", score: 98 };
  if (flag("isBinance") || flag("isBinanceChain") || hasAny(name, ["binance"]) || hasAny(rdns, ["binance"])) return { id: "binance" as WalletType, name: meta.name || "Binance Wallet", description: "BNB Chain-native EVM wallet.", score: 96 };
  if (flag("isCoinbaseWallet") || hasAny(name, ["coinbase"]) || hasAny(rdns, ["coinbase"])) return { id: "coinbase" as WalletType, name: meta.name || "Coinbase Wallet", description: "Coinbase self-custody wallet.", score: 94 };
  if (flag("isTrust") || flag("isTrustWallet") || hasAny(name, ["trust"]) || hasAny(rdns, ["trust"])) return { id: "trust" as WalletType, name: meta.name || "Trust Wallet", description: "Mobile-first EVM wallet.", score: 92 };
  if (flag("isOkxWallet") || flag("isOKExWallet") || hasAny(name, ["okx", "okex"]) || hasAny(rdns, ["okx", "okex"])) return { id: "okx" as WalletType, name: meta.name || "OKX Wallet", description: "Multi-chain EVM wallet.", score: 88 };
  if (flag("isPhantom") || hasAny(name, ["phantom"]) || hasAny(rdns, ["phantom"])) {
    // Phantom appears in EVM detected list (so users see it), but we guard connect/hydrate
    // to recommend the dedicated Solana button and avoid triggering Phantom's "Unsupported network"
    // when its EVM provider is on a non-BNB or Solana-focused network.
    return { id: "phantom" as WalletType, name: meta.name || "Phantom", description: "Multi-chain wallet (use dedicated Phantom button for Solana 101; EVM only for BNB 56).", score: 70 };
  }
  if (flag("isBraveWallet") || hasAny(name, ["brave"]) || hasAny(rdns, ["brave"])) return { id: "brave" as WalletType, name: meta.name || "Brave Wallet", description: "Built-in Brave wallet.", score: 82 };
  if (flag("isMetaMask") || flag("_metamask") || hasAny(name, ["metamask"]) || hasAny(rdns, ["metamask"])) return { id: "metamask" as WalletType, name: meta.name || "MetaMask", description: "Injected EVM browser wallet.", score: 90 };

  const raw = meta.rdns || meta.name || "injected";
  const id = raw.toLowerCase().replace(/^com\./, "").replace(/^io\./, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "injected";
  return { id: id as WalletType, name: meta.name || "Injected EVM Wallet", description: "Detected EVM-compatible wallet.", score: 50 };
}

function dedupeProviders(candidates: Array<Eip1193Provider | null | undefined>) {
  const seen = new Set<Eip1193Provider>();
  return candidates.filter((candidate): candidate is Eip1193Provider => {
    if (!candidate || typeof candidate.request !== "function" || seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

function legacyProviders() {
  if (typeof window === "undefined") return [];
  const candidates = dedupeProviders([
    ...(Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : []),
    window.ethereum,
    window.BinanceChain,
    window.binanceChain,
  ]);
  // NEVER include Phantom in EVM detected list. Phantom must ONLY be used via the dedicated
  // Solana button (window.solana) for Solana chain 101. Including it in EVM causes auto-connect
  // to its EVM side (often ETH address) and "Unsupported network" errors from Phantom.
  return candidates.filter((p) => !(p as any)?.isPhantom);
}

function startEip6963Discovery() {
  if (typeof window === "undefined" || eip6963ListenerStarted) return;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = event.detail;
    if (!detail?.provider || typeof detail.provider.request !== "function") return;
    const meta = getMeta(detail.provider, detail.info);
    const key = detail.info?.uuid || meta.rdns || meta.name || String(EIP6963_WALLETS.size + 1);
    EIP6963_WALLETS.set(key, detail);
    EIP6963_SUBSCRIBERS.forEach((subscriber) => subscriber());
  });
  eip6963ListenerStarted = true;
}

function requestEip6963Providers() {
  if (typeof window === "undefined") return;
  startEip6963Discovery();
  
  if (eip6963RequestInFlight) return;
  eip6963RequestInFlight = true;

  queueMicrotask(() => {
    try {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    } catch {
      // Legacy detection still works.
    } finally {
      eip6963RequestInFlight = false;
    }
  });
}

function detectedWallet(provider: Eip1193Provider, source: "eip6963" | "legacy", info?: Partial<Eip6963ProviderInfo>): DetectedWallet {
  const meta = getMeta(provider, info);
  const brand = walletBrand(provider, info);
  return { id: brand.id, name: brand.name, description: brand.description, rdns: meta.rdns, icon: meta.icon, provider, source, installed: true, sortScore: brand.score + (source === "eip6963" ? 8 : 0) };
}

function detectedSnapshot(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const wallets = [
    ...[...EIP6963_WALLETS.values()].map((detail) => detectedWallet(detail.provider, "eip6963", detail.info)),
    ...legacyProviders().map((provider) => detectedWallet(provider, "legacy")),
  ];

  const seenProviders = new Set<Eip1193Provider>();
  const seenKeys = new Set<string>(); // dedup by rdns/name to reduce duplicates like multiple MetaMask announcements
  const seenIds = new Map<string, number>();
  return wallets
    .filter((wallet) => {
      // Exclude Phantom providers from EVM detection (see legacyProviders comment).
      if ((wallet.provider as any)?.isPhantom) return false;
      if (seenProviders.has(wallet.provider)) return false;
      const key = wallet.rdns || wallet.name || wallet.id;
      if (seenKeys.has(key)) return false;
      seenProviders.add(wallet.provider);
      seenKeys.add(key);
      return true;
    })
    .map((wallet) => {
      const count = seenIds.get(wallet.id) ?? 0;
      seenIds.set(wallet.id, count + 1);
      return count > 0 ? { ...wallet, id: `${wallet.id}-${count + 1}` as WalletType } : wallet;
    })
    .sort((a, b) => b.sortScore - a.sortScore || a.name.localeCompare(b.name));
}

function findWallet(walletId: WalletType | null | undefined) {
  const wallets = detectedSnapshot();
  if (!walletId) return wallets[0] || null;
  return wallets.find((wallet) => wallet.id === walletId) || wallets.find((wallet) => wallet.id.startsWith(`${walletId}-`)) || wallets.find((wallet) => walletBrand(wallet.provider).id === walletId) || null;
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

async function chooseAccount(provider: Eip1193Provider, accounts: string[]) {
  const selectedAddress = normalizeHexAddress(provider.selectedAddress);
  const normalized = accounts.map(normalizeHexAddress).filter(Boolean);
  if (selectedAddress && normalized.includes(selectedAddress)) return selectedAddress;
  try {
    const active = normalizeAccounts(await provider.request({ method: "eth_accounts" }));
    if (selectedAddress && active.includes(selectedAddress)) return selectedAddress;
    if (active[0]) return active[0];
  } catch {
    // ignore
  }
  return normalized[0] || "";
}

function clearWarRoomSessionCache() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("mwz:warroom:") || key?.startsWith("mwz:chat:") || key?.startsWith("mwz:tokenchat:")) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

function dispatchOpenWalletModal() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
}

function getErrorMessage(error: unknown) {
  if (isObject(error) && typeof error.message === "string") return error.message;
  return String(error || "Wallet connection failed.");
}

function isRejected(error: unknown) {
  if (!isObject(error)) return false;
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return error.code === 4001 || message.includes("user rejected") || message.includes("user denied");
}

/**
 * Enforce that ONLY BNB Smart Chain mainnet (56) EVM connections are allowed.
 * No Ethereum, no testnet (97), no other chains. 
 * Attempts to switch the wallet to BNB mainnet 56 when needed (during explicit connect).
 * On auto-hydrate or background changes to bad chain (e.g. Phantom EVM on ETH or testnet),
 * we drop the connection and clear persistence to prevent loops.
 * Solana is handled exclusively via the dedicated Phantom button (always chain 101).
 */
async function ensureBnbChainOnly(provider: Eip1193Provider): Promise<number> {
  // Read current chain
  let cid: number | undefined;
  try {
    const bp = new BrowserProvider(provider);
    const net = await bp.getNetwork();
    cid = Number(net.chainId);
  } catch {
    try {
      const raw = await provider.request({ method: "eth_chainId" });
      cid = parseInt(String(raw), 16);
    } catch {}
  }

  if (isAllowedChainId(cid)) return cid as number;

  // Not allowed (e.g. Ethereum from Phantom EVM, testnet, or other). Force switch to BNB mainnet 56 only.
  const target = 56;
  const targetHex = "0x" + target.toString(16);
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
    // Re-read after switch
    const bp2 = new BrowserProvider(provider);
    const net2 = await bp2.getNetwork();
    const cid2 = Number(net2.chainId);
    if (isAllowedChainId(cid2)) return cid2;
    throw new Error("Switch did not land on allowed chain.");
  } catch (err: any) {
    const msg = (err?.message || "").toLowerCase();
    const code = err?.code;
    if (code === 4902 || msg.includes("unrecognized") || msg.includes("not added")) {
      // Chain not in wallet; user must add BNB manually or we could add it, but for now guide them.
    }
    throw new Error(
      `Only BNB Smart Chain mainnet (56) is supported for EVM. ` +
        `No Ethereum, no testnets. ` +
        `For Solana use the dedicated "Phantom" button in the connect modal (it uses mainnet 101). ` +
        `Switch your EVM wallet (including Phantom EVM mode) to BNB mainnet (ID 56) and try again.`
    );
  }
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
  const cleanupRef = useRef<(() => void) | null>(null);
  const hydrateInFlightRef = useRef(false);
  const accountRef = useRef<string>("");

  const syncRecruiterAttribution = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;
    try {
      await syncWalletRecruiterAttribution(walletAddress);
    } catch {
      // best effort
    }
  }, []);

  const detectWallets = useCallback(() => {
    requestEip6963Providers();
    const wallets = detectedSnapshot();
    setDetectedWallets(wallets);
    return wallets;
  }, []);

  const resetWalletState = useCallback((clearSelectedWallet = false) => {
    eip1193Ref.current = null;
    accountRef.current = "";
    setAccount("");
    setSigner(null);
    setProvider(null);
    setChainId(undefined);
    clearWarRoomSessionCache();
    if (clearSelectedWallet && typeof window !== "undefined") window.localStorage.removeItem(SELECTED_WALLET_KEY);
  }, []);

  const applyProviderState = useCallback(async (selectedProvider: Eip1193Provider, chosen: string, selectedWalletId?: WalletType) => {
    eip1193Ref.current = selectedProvider;
    accountRef.current = chosen;
    const browserProvider = new BrowserProvider(selectedProvider);
    setProvider(browserProvider);
    setAccount(chosen);
    void syncRecruiterAttribution(chosen);
    const nextSigner = await browserProvider.getSigner(chosen);
    setSigner(nextSigner);
    const network = await browserProvider.getNetwork();
    const cid = Number(network.chainId);
    if (!isAllowedChainId(cid)) {
      // Final safety: never surface a non-BNB EVM connection.
      throw new Error("Unsupported chain in provider state.");
    }
    setChainId(cid);
    if (typeof window !== "undefined" && selectedWalletId) {
      window.localStorage.setItem(SELECTED_WALLET_KEY, selectedWalletId);
      window.localStorage.removeItem(DISCONNECTED_KEY);
      window.localStorage.removeItem(LEGACY_CONNECTED_KEY);
    }
  }, [syncRecruiterAttribution]);

  const bindListeners = useCallback((selectedProvider: Eip1193Provider) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!selectedProvider.on) return;

    const rebuild = async () => {
      try {
        const chosen = await chooseAccount(selectedProvider, normalizeAccounts(await selectedProvider.request({ method: "eth_accounts" })));
        if (!chosen) {
          resetWalletState(false);
          return;
        }
        if (
          eip1193Ref.current === selectedProvider &&
          chosen.toLowerCase() === accountRef.current.toLowerCase()
        ) {
          return;
        }
        // If chain changed to non-BNB (e.g. user switched to ETH in Phantom), drop the EVM connection.
        try {
          await ensureBnbChainOnly(selectedProvider);
        } catch {
          resetWalletState(false);
          return;
        }
        await applyProviderState(selectedProvider, chosen);
      } catch {
        setSigner(null);
      }
    };

    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void rebuild();
    };

    const onAccountsChanged = async (accounts: unknown) => {
      const chosen = await chooseAccount(selectedProvider, normalizeAccounts(accounts));
      setAccount((previous) => {
        if (previous && chosen && previous.toLowerCase() !== chosen.toLowerCase()) clearWarRoomSessionCache();
        return chosen;
      });
      if (!chosen) {
        setSigner(null);
        return;
      }
      try {
        await ensureBnbChainOnly(selectedProvider);
        await applyProviderState(selectedProvider, chosen);
      } catch {
        setSigner(null);
        resetWalletState(false);
      }
    };

    const onChainChanged = async (nextChainId: unknown) => {
      const c = parseChainId(nextChainId);
      if (c && !isAllowedChainId(c)) {
        // User (or wallet) switched to Ethereum or unsupported chain. Drop EVM state.
        resetWalletState(false);
        return;
      }
      setChainId(c);
      await rebuild();
    };

    selectedProvider.on("accountsChanged", onAccountsChanged);
    selectedProvider.on("chainChanged", onChainChanged);
    selectedProvider.on("disconnect", rebuild);
    window.addEventListener("focus", rebuild);
    document.addEventListener("visibilitychange", onVisibilityChange);

    cleanupRef.current = () => {
      selectedProvider.removeListener?.("accountsChanged", onAccountsChanged);
      selectedProvider.removeListener?.("chainChanged", onChainChanged);
      selectedProvider.removeListener?.("disconnect", rebuild);
      window.removeEventListener("focus", rebuild);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applyProviderState, resetWalletState]);

  const hydrateSelectedProvider = useCallback(async () => {
    if (typeof window === "undefined" || hydrateInFlightRef.current) return;
    if (window.localStorage.getItem(DISCONNECTED_KEY) === "1") return;
    hydrateInFlightRef.current = true;
    try {
      requestEip6963Providers();
      const storedType = window.localStorage.getItem(SELECTED_WALLET_KEY) as WalletType | null;
      const selectedWallet = findWallet(storedType) || findWallet(null);
      if (!selectedWallet?.provider) return;
      // Phantom must never be auto-hydrated or used via the EVM path (filtered from detection too).
      // Dedicated Solana button only.
      if ((selectedWallet.provider as any)?.isPhantom || (selectedWallet.id || "").toLowerCase().includes("phantom")) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(SELECTED_WALLET_KEY);
          window.localStorage.setItem(DISCONNECTED_KEY, "1");
        }
        return;
      }
      const chosen = await chooseAccount(selectedWallet.provider, normalizeAccounts(await selectedWallet.provider.request({ method: "eth_accounts" })));
      if (!chosen) return;
      // Do not auto-hydrate if on Ethereum or other unsupported chain.
      // Clear persistence so we don't loop trying to reconnect bad wallets.
      try {
        await ensureBnbChainOnly(selectedWallet.provider);
      } catch {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(SELECTED_WALLET_KEY);
          window.localStorage.setItem(DISCONNECTED_KEY, "1");
        }
        return;
      }
      bindListeners(selectedWallet.provider);
      await applyProviderState(selectedWallet.provider, chosen, selectedWallet.id);
    } catch {
      // Hydration must never prompt or throw.
    } finally {
      hydrateInFlightRef.current = false;
      setDetectedWallets(detectedSnapshot());
    }
  }, [applyProviderState, bindListeners]);

  useEffect(() => {
    startEip6963Discovery();
    const onDiscovery = () => {
      setDetectedWallets(detectedSnapshot());
      void hydrateSelectedProvider();
    };
    EIP6963_SUBSCRIBERS.add(onDiscovery);

    const timers = [0, 250, 800, 1600].map((delay) => window.setTimeout(() => {
      requestEip6963Providers();
      setDetectedWallets(detectedSnapshot());
      void hydrateSelectedProvider();
    }, delay));

    return () => {
      EIP6963_SUBSCRIBERS.delete(onDiscovery);
      timers.forEach((timer) => window.clearTimeout(timer));
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [hydrateSelectedProvider]);

  const connect = useCallback(async (wallet?: WalletType) => {
    if (typeof window === "undefined") throw new Error("No browser environment detected.");
    if (!wallet) {
      dispatchOpenWalletModal();
      return;
    }

    requestEip6963Providers();
    const selectedWallet = findWallet(wallet);
    const selectedProvider = selectedWallet?.provider;
    if (!selectedWallet || !selectedProvider) throw new Error("Wallet not detected. Install an EVM wallet or open MemeWarzone inside your wallet browser.");

    // Block Phantom here — it must use the dedicated Solana button (handleSolanaConnect in ConnectWalletButton)
    // to avoid Phantom showing "This website is trying to use a network that Phantom does not currently support."
    // We also filter isPhantom from all EVM detection (detectedSnapshot, legacyProviders) so Phantom never appears as EVM option.
    if ((selectedProvider as any)?.isPhantom || (selectedWallet.id || "").toLowerCase().includes("phantom")) {
      throw new Error("Phantom is not supported for EVM connections. Use the dedicated Phantom row (top of list) for correct Solana (101) connect.");
    }

    setConnecting(true);
    setConnectingWalletId(selectedWallet.id);
    try {
      try {
        await selectedProvider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      } catch (error) {
        if (isRejected(error)) throw error;
      }
      const chosen = await chooseAccount(selectedProvider, normalizeAccounts(await selectedProvider.request({ method: "eth_requestAccounts" })));
      if (!chosen) throw new Error("No wallet account returned.");
      // CRITICAL: block Ethereum / non-BNB. Switch if possible (user interaction expected here).
      await ensureBnbChainOnly(selectedProvider);
      bindListeners(selectedProvider);
      await applyProviderState(selectedProvider, chosen, selectedWallet.id);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    } finally {
      setConnecting(false);
      setConnectingWalletId(null);
      setDetectedWallets(detectedSnapshot());
    }
  }, [applyProviderState, bindListeners]);

  const disconnect = useCallback(async () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    resetWalletState(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISCONNECTED_KEY, "1");
      window.localStorage.removeItem(LEGACY_CONNECTED_KEY);
    }
  }, [resetWalletState]);

  const isOnSupportedChain = Boolean(account && signer && isSupportedChainId(chainId));

  return useMemo(() => ({
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
    isOnSupportedChain,
  }), [provider, signer, account, chainId, connecting, connectingWalletId, detectedWallets, connect, disconnect, detectWallets, isOnSupportedChain]);
}
