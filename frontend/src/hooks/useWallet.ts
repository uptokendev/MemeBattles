import { BrowserProvider, JsonRpcProvider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getActiveChainId,
  getAllowedChainIds,
  getDefaultChainId,
  getChainParams,
  isAllowedChainId,
  type SupportedChainId,
} from "@/lib/chainConfig";
import { getReadProvider } from "@/lib/readProvider";

export type WalletType = "metamask" | "binance" | "injected";

type WalletHook = {
  // MetaMask/injected provider used for signing (writes)
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;

  // Read-only provider (JsonRpcProvider) that follows wallet chain (if allowed)
  readProvider: JsonRpcProvider;
  activeChainId: SupportedChainId;
  allowedChainIds: SupportedChainId[];
  defaultChainId: SupportedChainId;

  account: string;
  chainId?: number;
  connecting: boolean;

  hasProvider: boolean;
  isWrongNetwork: boolean;

  // Backward-compat: used by some UI
  targetChainId?: number;

  connect: (wallet?: WalletType) => Promise<void>;
  switchToTargetChain: () => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
};

const STORAGE_CONNECTED = "launchit_wallet_connected";
const STORAGE_WALLET_TYPE = "launchit_wallet_type";

const getStoredConnected = () => {
  try {
    return localStorage.getItem(STORAGE_CONNECTED) === "1";
  } catch {
    return false;
  }
};

const setStoredConnected = (v: boolean) => {
  try {
    localStorage.setItem(STORAGE_CONNECTED, v ? "1" : "0");
  } catch {
    // ignore
  }
};

const getStoredWalletType = (): WalletType | undefined => {
  try {
    const raw = localStorage.getItem(STORAGE_WALLET_TYPE) as WalletType | null;
    return raw ?? undefined;
  } catch {
    return undefined;
  }
};

const setStoredWalletType = (t?: WalletType) => {
  try {
    if (!t) localStorage.removeItem(STORAGE_WALLET_TYPE);
    else localStorage.setItem(STORAGE_WALLET_TYPE, t);
  } catch {
    // ignore
  }
};

const getInjectedProvider = () => {
  const eth = (globalThis as any)?.ethereum;
  return eth ?? null;
};

export function useWallet(): WalletHook {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [connecting, setConnecting] = useState(false);

  const hasProvider = useMemo(() => Boolean(getInjectedProvider()), []);

  const allowedChainIds = useMemo(() => getAllowedChainIds(), []);
  const defaultChainId = useMemo(() => getDefaultChainId(), []);
  const activeChainId = useMemo(
    () => getActiveChainId(chainId),
    [chainId, defaultChainId, allowedChainIds]
  );

  // Always available read provider (uses active chain id).
  const readProvider = useMemo(() => getReadProvider(activeChainId), [activeChainId]);

  const targetChainId = defaultChainId; // backward-compat

  const isWrongNetwork = useMemo(() => {
    if (!account) return false;
    if (!chainId) return false;
    return !isAllowedChainId(chainId);
  }, [account, chainId]);

  const teardown = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount("");
    setChainId(undefined);
  }, []);

  const refreshState = useCallback(async (p: BrowserProvider) => {
    const [accounts, net] = await Promise.all([p.listAccounts(), p.getNetwork()]);
    const addr = accounts?.[0]?.address ?? "";
    setAccount(addr);
    setChainId(Number(net?.chainId));
    if (addr) {
      const s = await p.getSigner();
      setSigner(s);
    } else {
      setSigner(null);
    }
  }, []);

  const connect = useCallback(
    async (wallet?: WalletType) => {
      const injected = getInjectedProvider();
      if (!injected) {
        toast.error("No wallet provider found. Please install MetaMask.");
        return;
      }

      const chosen: WalletType = wallet ?? getStoredWalletType() ?? "injected";

      try {
        setConnecting(true);

        // Request accounts
        await injected.request?.({ method: "eth_requestAccounts" });

        const p = new BrowserProvider(injected, "any");
        setProvider(p);

        // Ensure state is correct
        await refreshState(p);

        setStoredConnected(true);
        setStoredWalletType(chosen);
      } catch (e: any) {
        console.warn("[useWallet] connect failed", e);
        toast.error(e?.message ?? "Failed to connect wallet");
        teardown();
        setStoredConnected(false);
      } finally {
        setConnecting(false);
      }
    },
    [refreshState, teardown]
  );

  const switchToTargetChain = useCallback(async () => {
    const injected = getInjectedProvider();
    if (!injected) return;

    const desired = targetChainId;
    if (!desired) return;

    try {
      const current = chainId;
      if (current && Number(current) === Number(desired)) return;

      const chainHex = "0x" + Number(desired).toString(16);
      await injected.request?.({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainHex }],
      });
    } catch (e: any) {
      // Chain not added yet?
      if (e?.code === 4902) {
        try {
          const params = getChainParams(desired as SupportedChainId);
          await injected.request?.({
            method: "wallet_addEthereumChain",
            params: [params],
          });
          return;
        } catch (addErr: any) {
          toast.error(addErr?.message ?? "Failed to add chain to wallet");
          return;
        }
      }

      toast.error(e?.message ?? "Failed to switch network");
    }
  }, [chainId, targetChainId]);

  const disconnect = useCallback(() => {
    teardown();
    setStoredConnected(false);
    setStoredWalletType(undefined);
  }, [teardown]);

  // Subscribe to injected events
  const listenersAttached = useRef(false);
  useEffect(() => {
    const injected = getInjectedProvider();
    if (!injected || listenersAttached.current) return;

    const onAccountsChanged = (accs: string[]) => {
      const next = accs?.[0] ?? "";
      setAccount(next);
      if (!next) setSigner(null);
    };

    const onChainChanged = (_: string) => {
      // MetaMask recommends reloading on chainChanged for dapps with complex state.
      // We do a lighter refresh: update chainId + signer state.
      if (provider) refreshState(provider).catch(() => undefined);
      else {
        const c = Number(parseInt(String(_), 16));
        setChainId(Number.isFinite(c) ? c : undefined);
      }
    };

    injected.on?.("accountsChanged", onAccountsChanged);
    injected.on?.("chainChanged", onChainChanged);

    listenersAttached.current = true;

    return () => {
      try {
        injected.removeListener?.("accountsChanged", onAccountsChanged);
        injected.removeListener?.("chainChanged", onChainChanged);
      } catch {
        // ignore
      }
      listenersAttached.current = false;
    };
  }, [provider, refreshState]);

  // Auto-reconnect if the user previously connected
  useEffect(() => {
    if (!hasProvider) return;
    if (!getStoredConnected()) return;

    // Avoid reconnect loops
    if (account || connecting) return;

    connect(getStoredWalletType()).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProvider]);

  return useMemo(
    () => ({
      provider,
      signer,

      readProvider,
      activeChainId,
      allowedChainIds,
      defaultChainId,

      account,
      chainId,
      connecting,
      hasProvider,
      isWrongNetwork,
      targetChainId,

      connect,
      switchToTargetChain,
      disconnect,
      isConnected: Boolean(account),
    }),
    [
      provider,
      signer,
      readProvider,
      activeChainId,
      allowedChainIds,
      defaultChainId,
      account,
      chainId,
      connecting,
      hasProvider,
      isWrongNetwork,
      targetChainId,
      connect,
      switchToTargetChain,
      disconnect,
    ]
  );
}
