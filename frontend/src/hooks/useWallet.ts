import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type WalletType = "metamask" | "binance" | "injected";

type WalletHook = {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string;
  chainId?: number;
  connecting: boolean;
  connect: (wallet?: WalletType) => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
};

type InjectedProvider = {
  request?: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isBinance?: boolean;
  isBinanceChain?: boolean;
  providerInfo?: { name?: string; rdns?: string };
  selectedProvider?: InjectedProvider;
  providers?: InjectedProvider[];
};

const WALLET_CONNECTED_KEY = "mwz_wallet_connected";
const WALLET_TYPE_KEY = "mwz_wallet_type";
const WALLET_DISCONNECTED_KEY = "mwz_wallet_disconnected";
const CHAT_SESSION_PREFIX = "mwz_chat_session";

function getAnyWindow() {
  return typeof window === "undefined" ? ({} as any) : (window as any);
}

function isRequestProvider(value: any): value is InjectedProvider {
  return Boolean(value && typeof value.request === "function");
}

function providerName(provider: InjectedProvider) {
  return String(provider.providerInfo?.name || provider.providerInfo?.rdns || "").toLowerCase();
}

function isMetaMaskLike(provider: InjectedProvider) {
  const name = providerName(provider);
  return Boolean(
    provider.isMetaMask ||
      provider.isRabby ||
      name.includes("metamask") ||
      name.includes("rabby")
  );
}

function isBinanceLike(provider: InjectedProvider) {
  const name = providerName(provider);
  return Boolean(
    provider.isBinance ||
      provider.isBinanceChain ||
      name.includes("binance") ||
      name.includes("bnb")
  );
}

function safeLocalStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function safeLocalStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function clearWarRoomSessions() {
  try {
    const stores = [window.sessionStorage, window.localStorage].filter(Boolean);
    for (const store of stores) {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key?.startsWith(CHAT_SESSION_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => store.removeItem(key));
    }
  } catch {
    // ignore storage failures
  }
}

function getInjectedProviders(): InjectedProvider[] {
  const anyWindow = getAnyWindow();
  const ethereum = anyWindow.ethereum as InjectedProvider | undefined;
  const seen = new Set<any>();
  const providers: InjectedProvider[] = [];

  const push = (candidate: any) => {
    if (!isRequestProvider(candidate) || seen.has(candidate)) return;
    seen.add(candidate);
    providers.push(candidate);
  };

  // Modern multi-wallet injection normally exposes ethereum.providers.
  if (Array.isArray(ethereum?.providers)) ethereum.providers.forEach(push);

  // Some wallets expose a selected provider behind the aggregate object.
  push(ethereum?.selectedProvider);

  // EIP-6963 libraries/wallets sometimes expose providerMap or detected lists.
  const providerMap = (ethereum as any)?.providerMap;
  if (providerMap && typeof providerMap.values === "function") {
    Array.from(providerMap.values()).forEach(push);
  }
  if (Array.isArray((ethereum as any)?.detected)) (ethereum as any).detected.forEach(push);

  push(anyWindow.BinanceChain);
  push(anyWindow.binanceChain);
  push(ethereum);

  return providers;
}

function pickInjected(wallet: WalletType | undefined): InjectedProvider | null {
  const providers = getInjectedProviders();
  if (!providers.length) return null;

  if (wallet === "metamask") {
    return providers.find(isMetaMaskLike) || null;
  }

  if (wallet === "binance") {
    return providers.find(isBinanceLike) || null;
  }

  return providers.find((p) => !isBinanceLike(p)) || providers[0] || null;
}

function parseChainId(value: any): number | undefined {
  try {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string" && value.startsWith("0x")) return Number(BigInt(value));
    if (typeof value === "string") return Number(value);
  } catch {
    return undefined;
  }
  return undefined;
}

export function useWallet(): WalletHook {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);

  const eip1193Ref = useRef<InjectedProvider | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const connectedRef = useRef(false);
  const selectedWalletRef = useRef<WalletType | undefined>(undefined);

  const hardResetState = useCallback(() => {
    setAccount("");
    setSigner(null);
    setProvider(null);
    setChainId(undefined);
  }, []);

  const refreshFromProvider = useCallback(async (selectedProvider?: InjectedProvider | null, options?: { hydrateAccount?: boolean }) => {
    const source = selectedProvider || eip1193Ref.current || pickInjected(selectedWalletRef.current) || pickInjected("injected");
    if (!source || typeof source.request !== "function") return;

    eip1193Ref.current = source;

    const browserProvider = new BrowserProvider(source as any);
    setProvider(browserProvider);

    try {
      const rawChainId = await source.request({ method: "eth_chainId" });
      setChainId(parseChainId(rawChainId));
    } catch {
      try {
        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));
      } catch {
        setChainId(undefined);
      }
    }

    if (!options?.hydrateAccount && !connectedRef.current) return;

    try {
      const accounts: string[] = await source.request({ method: "eth_accounts" });
      const primary = accounts?.[0] || "";
      setAccount(primary);
      if (!primary) {
        setSigner(null);
        return;
      }
      const nextSigner = await browserProvider.getSigner();
      setSigner(nextSigner);
    } catch {
      setSigner(null);
    }
  }, []);

  const bindEip1193Listeners = useCallback((selectedProvider: InjectedProvider) => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    const anyWindow = getAnyWindow();
    const ethereum = anyWindow.ethereum as InjectedProvider | undefined;
    const targets = new Set<InjectedProvider>();
    if (isRequestProvider(ethereum)) targets.add(ethereum);
    if (isRequestProvider(selectedProvider)) targets.add(selectedProvider);

    const offHandlers: Array<() => void> = [];

    const onAccountsChanged = (accounts: string[] = []) => {
      const primary = accounts?.[0] || "";

      if (!primary) {
        hardResetState();
        connectedRef.current = false;
        safeLocalStorageRemove(WALLET_CONNECTED_KEY);
        clearWarRoomSessions();
        return;
      }

      connectedRef.current = true;
      safeLocalStorageSet(WALLET_CONNECTED_KEY, "1");
      safeLocalStorageRemove(WALLET_DISCONNECTED_KEY);
      setAccount(primary);
      refreshFromProvider(selectedProvider, { hydrateAccount: true }).catch(() => setSigner(null));
    };

    const onChainChanged = (hexChainId: string) => {
      setChainId(parseChainId(hexChainId));
      refreshFromProvider(selectedProvider, { hydrateAccount: connectedRef.current }).catch(() => undefined);
    };

    for (const target of targets) {
      if (!target?.on) continue;
      target.on("accountsChanged", onAccountsChanged);
      target.on("chainChanged", onChainChanged);
      offHandlers.push(() => {
        target.removeListener?.("accountsChanged", onAccountsChanged);
        target.removeListener?.("chainChanged", onChainChanged);
      });
    }

    const onFocusOrVisibility = () => {
      if (document.visibilityState === "hidden") return;
      refreshFromProvider(selectedProvider, { hydrateAccount: connectedRef.current }).catch(() => undefined);
    };

    window.addEventListener("focus", onFocusOrVisibility);
    document.addEventListener("visibilitychange", onFocusOrVisibility);
    offHandlers.push(() => window.removeEventListener("focus", onFocusOrVisibility));
    offHandlers.push(() => document.removeEventListener("visibilitychange", onFocusOrVisibility));

    cleanupRef.current = () => {
      offHandlers.forEach((off) => {
        try {
          off();
        } catch {
          // ignore listener cleanup failures
        }
      });
    };
  }, [hardResetState, refreshFromProvider]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const previouslyConnected = safeLocalStorageGet(WALLET_CONNECTED_KEY) === "1";
    const wasDisconnected = safeLocalStorageGet(WALLET_DISCONNECTED_KEY) === "1";
    const savedWallet = safeLocalStorageGet(WALLET_TYPE_KEY) as WalletType | null;
    const selected = pickInjected(savedWallet || "metamask") || pickInjected("injected");

    if (!selected) return;

    selectedWalletRef.current = savedWallet || undefined;
    eip1193Ref.current = selected;
    bindEip1193Listeners(selected);

    // Always hydrate read-only provider/chain. Only hydrate an account if the
    // app has an active frontend wallet session. This prevents local disconnect
    // from instantly reconnecting the last browser-authorized wallet.
    connectedRef.current = previouslyConnected && !wasDisconnected;
    refreshFromProvider(selected, { hydrateAccount: connectedRef.current }).catch(() => undefined);

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [bindEip1193Listeners, refreshFromProvider]);

  const connect = useCallback(async (wallet?: WalletType) => {
    if (typeof window === "undefined") throw new Error("No browser environment detected.");

    const selected = pickInjected(wallet);
    if (!selected) {
      if (wallet === "metamask") throw new Error("MetaMask/Rabby was not found. Choose another EVM wallet or install MetaMask.");
      if (wallet === "binance") throw new Error("Binance Wallet was not found. Choose another EVM wallet or install Binance Wallet.");
      throw new Error("No EVM wallet found. Please install MetaMask, Binance Wallet, Rabby, or another BSC-capable wallet.");
    }

    setConnecting(true);
    try {
      selectedWalletRef.current = wallet;
      eip1193Ref.current = selected;
      bindEip1193Listeners(selected);

      const accounts: string[] = await selected.request!({ method: "eth_requestAccounts" });
      const primary = accounts?.[0] || "";
      if (!primary) throw new Error("No accounts returned from wallet.");

      connectedRef.current = true;
      safeLocalStorageSet(WALLET_CONNECTED_KEY, "1");
      safeLocalStorageRemove(WALLET_DISCONNECTED_KEY);
      if (wallet) safeLocalStorageSet(WALLET_TYPE_KEY, wallet);
      else safeLocalStorageRemove(WALLET_TYPE_KEY);

      const browserProvider = new BrowserProvider(selected as any);
      setProvider(browserProvider);
      setAccount(primary);
      setSigner(await browserProvider.getSigner());

      try {
        const rawChainId = await selected.request!({ method: "eth_chainId" });
        setChainId(parseChainId(rawChainId));
      } catch {
        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));
      }
    } finally {
      setConnecting(false);
    }
  }, [bindEip1193Listeners]);

  const disconnect = useCallback(() => {
    connectedRef.current = false;
    selectedWalletRef.current = undefined;
    eip1193Ref.current = null;
    safeLocalStorageRemove(WALLET_CONNECTED_KEY);
    safeLocalStorageRemove(WALLET_TYPE_KEY);
    safeLocalStorageSet(WALLET_DISCONNECTED_KEY, "1");
    clearWarRoomSessions();
    hardResetState();
  }, [hardResetState]);

  return useMemo(
    () => ({
      provider,
      signer,
      account,
      chainId,
      connecting,
      connect,
      disconnect,
      isConnected: Boolean(account),
    }),
    [provider, signer, account, chainId, connecting, connect, disconnect]
  );
}
