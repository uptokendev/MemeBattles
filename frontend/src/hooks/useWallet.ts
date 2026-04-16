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
  disconnect: () => Promise<void>;
  isConnected: boolean;
};

const SELECTED_WALLET_KEY = "mwz:selected_wallet";
const DISCONNECTED_KEY = "mwz:wallet:disconnected";
const LEGACY_CONNECTED_KEY = "mwz_wallet_connected";

function normalizeHexAddress(value?: string | null): string {
  const v = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(v) ? v.toLowerCase() : "";
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
    // ignore storage errors
  }
}

function getProviderMeta(provider: any) {
  const info = provider?.providerInfo ?? provider?.info ?? provider?.metadata ?? {};
  const name = String(info?.name ?? provider?.name ?? provider?._walletName ?? "").toLowerCase();
  const rdns = String(info?.rdns ?? provider?.rdns ?? provider?._rdns ?? "").toLowerCase();
  return { name, rdns };
}

function isLikelyBinance(provider: any) {
  const { name, rdns } = getProviderMeta(provider);
  return Boolean(
    provider?.isBinance ||
      provider?.isBinanceChain ||
      name.includes("binance") ||
      rdns.includes("binance")
  );
}

function isLikelyCryptoDotCom(provider: any) {
  const { name, rdns } = getProviderMeta(provider);
  return Boolean(
    provider?.isCryptoCom ||
      name.includes("crypto.com") ||
      name.includes("defi wallet") ||
      rdns.includes("crypto")
  );
}

function isLikelyCoinbase(provider: any) {
  const { name, rdns } = getProviderMeta(provider);
  return Boolean(provider?.isCoinbaseWallet || name.includes("coinbase") || rdns.includes("coinbase"));
}

function isLikelyTrust(provider: any) {
  const { name, rdns } = getProviderMeta(provider);
  return Boolean(provider?.isTrust || provider?.isTrustWallet || name.includes("trust") || rdns.includes("trust"));
}

function isLikelyRabby(provider: any) {
  const { name, rdns } = getProviderMeta(provider);
  return Boolean(provider?.isRabby || name.includes("rabby") || rdns.includes("rabby"));
}

function isAllowedMetaMaskFamily(provider: any) {
  if (!provider || typeof provider.request !== "function") return false;
  if (isLikelyBinance(provider) || isLikelyCryptoDotCom(provider) || isLikelyCoinbase(provider) || isLikelyTrust(provider)) {
    return false;
  }
  const { name, rdns } = getProviderMeta(provider);
  return Boolean(
    provider?.isMetaMask ||
      provider?._metamask ||
      isLikelyRabby(provider) ||
      name.includes("metamask") ||
      rdns.includes("metamask")
  );
}

function dedupeProviders(candidates: any[]) {
  const seen = new Set<any>();
  const out: any[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || typeof candidate.request !== "function") continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

function getInjectedProviders() {
  if (typeof window === "undefined") return [];
  const anyWindow = window as any;
  const ethereum = anyWindow.ethereum;
  const providers = dedupeProviders([
    ...(Array.isArray(ethereum?.providers) ? ethereum.providers : []),
    ethereum,
    anyWindow.BinanceChain,
    anyWindow.binanceChain,
  ]);

  providers.sort((a, b) => {
    const score = (p: any) => {
      if (isLikelyBinance(p)) return 50;
      if (isAllowedMetaMaskFamily(p) && !isLikelyRabby(p)) return 40;
      if (isLikelyRabby(p)) return 35;
      if (isLikelyCoinbase(p)) return 20;
      if (isLikelyCryptoDotCom(p)) return 10;
      return 0;
    };
    return score(b) - score(a);
  });

  return providers;
}

function pickInjected(wallet: WalletType | undefined, preferredType?: WalletType | null) {
  const target = wallet ?? preferredType ?? undefined;
  const providers = getInjectedProviders();
  if (!providers.length) return null;

  if (target === "metamask") {
    return providers.find((p) => isAllowedMetaMaskFamily(p) && !isLikelyRabby(p))
      || providers.find((p) => isAllowedMetaMaskFamily(p))
      || null;
  }

  if (target === "binance") {
    return providers.find((p) => isLikelyBinance(p)) || null;
  }

  if (target === "injected") {
    return providers.find((p) => !isLikelyBinance(p)) || providers[0] || null;
  }

  return null;
}

async function choosePrimaryAccount(selectedProvider: any, accounts: string[]) {
  const normalized = accounts.map((a) => normalizeHexAddress(a)).filter(Boolean);
  const selectedAddress = normalizeHexAddress(selectedProvider?.selectedAddress);
  if (selectedAddress && normalized.includes(selectedAddress)) return selectedAddress;

  try {
    const fromEthAccounts = await selectedProvider.request({ method: "eth_accounts" });
    const active = Array.isArray(fromEthAccounts)
      ? fromEthAccounts.map((a: string) => normalizeHexAddress(a)).filter(Boolean)
      : [];
    if (selectedAddress && active.includes(selectedAddress)) return selectedAddress;
    if (active[0]) return active[0];
  } catch {
    // ignore
  }

  return normalized[0] ?? "";
}

function dispatchOpenWalletModal() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
}

export function useWallet(): WalletHook {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const eip1193Ref = useRef<any>(null);
  const selectedWalletTypeRef = useRef<WalletType | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const bindEip1193Listeners = useCallback((selectedProvider: any) => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!selectedProvider?.on) return;

    const rebuildState = async () => {
      try {
        const bp = new BrowserProvider(selectedProvider);
        setProvider(bp);
        const network = await bp.getNetwork();
        setChainId(Number(network.chainId));
        const accounts = await selectedProvider.request({ method: "eth_accounts" });
        const chosen = await choosePrimaryAccount(selectedProvider, Array.isArray(accounts) ? accounts : []);
        setAccount(chosen);
        if (!chosen) {
          setSigner(null);
          clearWarRoomSessionCache();
          return;
        }
        const nextSigner = await bp.getSigner();
        setSigner(nextSigner);
      } catch {
        setSigner(null);
      }
    };

    const onAccountsChanged = async (accounts: string[]) => {
      const chosen = await choosePrimaryAccount(selectedProvider, Array.isArray(accounts) ? accounts : []);
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
      try {
        const bp = new BrowserProvider(selectedProvider);
        setProvider(bp);
        const nextSigner = await bp.getSigner();
        setSigner(nextSigner);
      } catch {
        setSigner(null);
      }
    };

    const onChainChanged = async (hexChainId: string) => {
      try {
        setChainId(Number(BigInt(hexChainId)));
      } catch {
        setChainId(undefined);
      }
      await rebuildState();
    };

    const onVisibilityOrFocus = async () => {
      await rebuildState();
    };

    selectedProvider.on("accountsChanged", onAccountsChanged);
    selectedProvider.on("chainChanged", onChainChanged);
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    cleanupRef.current = () => {
      try {
        selectedProvider.removeListener?.("accountsChanged", onAccountsChanged);
        selectedProvider.removeListener?.("chainChanged", onChainChanged);
      } catch {
        // ignore
      }
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, []);

  const hydrateSelectedProvider = useCallback(async () => {
    if (typeof window === "undefined") return;
    const explicitlyDisconnected = window.localStorage.getItem(DISCONNECTED_KEY) === "1";
    if (explicitlyDisconnected) return;

    const storedType = window.localStorage.getItem(SELECTED_WALLET_KEY) as WalletType | null;
    selectedWalletTypeRef.current = storedType;
    const selected = pickInjected(undefined, storedType);
    if (!selected) return;

    try {
      const accounts = await selected.request({ method: "eth_accounts" });
      const chosen = await choosePrimaryAccount(selected, Array.isArray(accounts) ? accounts : []);
      if (!chosen) return;

      eip1193Ref.current = selected;
      bindEip1193Listeners(selected);

      const bp = new BrowserProvider(selected);
      setProvider(bp);
      setAccount(chosen);
      const nextSigner = await bp.getSigner();
      setSigner(nextSigner);
      const network = await bp.getNetwork();
      setChainId(Number(network.chainId));
      window.localStorage.removeItem(DISCONNECTED_KEY);
    } catch {
      // do not auto-connect on failures
    }
  }, [bindEip1193Listeners]);

  useEffect(() => {
    void hydrateSelectedProvider();
    return () => {
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

      const selected = pickInjected(wallet);
      if (!selected) {
        throw new Error("No matching wallet found. Please install MetaMask, Rabby, or Binance Wallet.");
      }

      setConnecting(true);
      try {
        if (wallet === "metamask" && typeof selected.request === "function") {
          try {
            await selected.request({
              method: "wallet_requestPermissions",
              params: [{ eth_accounts: {} }],
            });
          } catch {
            // some wallets do not support this; continue
          }
        }

        const accounts: string[] = await selected.request({ method: "eth_requestAccounts" });
        const chosen = await choosePrimaryAccount(selected, Array.isArray(accounts) ? accounts : []);
        if (!chosen) {
          throw new Error("No wallet account returned.");
        }

        eip1193Ref.current = selected;
        selectedWalletTypeRef.current = wallet;
        bindEip1193Listeners(selected);

        const browserProvider = new BrowserProvider(selected);
        setProvider(browserProvider);
        setAccount(chosen);
        const nextSigner = await browserProvider.getSigner();
        setSigner(nextSigner);
        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));

        window.localStorage.setItem(SELECTED_WALLET_KEY, wallet);
        window.localStorage.removeItem(DISCONNECTED_KEY);
        window.localStorage.removeItem(LEGACY_CONNECTED_KEY);
      } finally {
        setConnecting(false);
      }
    },
    [bindEip1193Listeners]
  );

  const disconnect = useCallback(async () => {
    const selected = eip1193Ref.current;
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (selected?.request) {
      try {
        await selected.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // most injected wallets either do not support this or ignore it
      }
    }

    eip1193Ref.current = null;
    setAccount("");
    setSigner(null);
    setProvider(null);
    setChainId(undefined);
    clearWarRoomSessionCache();

    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISCONNECTED_KEY, "1");
      window.localStorage.removeItem(LEGACY_CONNECTED_KEY);
    }
  }, []);

  return useMemo(
    () => ({
      provider,
      signer,
      account,
      chainId,
      connecting,
      connect,
      disconnect,
      isConnected: Boolean(account && signer),
    }),
    [provider, signer, account, chainId, connecting, connect, disconnect]
  );
}
