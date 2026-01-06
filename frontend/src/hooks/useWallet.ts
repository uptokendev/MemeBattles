import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export type WalletType = "metamask" | "binance" | "injected";

type WalletHook = {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string;
  chainId?: number;
  connecting: boolean;

  hasProvider: boolean;
  isWrongNetwork: boolean;
  targetChainId?: number;

  connect: (wallet?: WalletType) => Promise<void>;
  switchToTargetChain: () => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
};

const STORAGE_CONNECTED = "launchit_wallet_connected";
const STORAGE_WALLET_TYPE = "launchit_wallet_type";

const readTargetChainId = (): number | undefined => {
  const raw = import.meta.env.VITE_TARGET_CHAIN_ID;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const getChainParams = (chainId: number) => {
  if (chainId === 56) {
    return {
      chainId: "0x38",
      chainName: "BNB Smart Chain",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: ["https://bsc-dataseed.binance.org/"],
      blockExplorerUrls: ["https://bscscan.com/"],
    };
  }
  if (chainId === 97) {
    return {
      chainId: "0x61",
      chainName: "BNB Smart Chain Testnet",
      nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
      rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
      blockExplorerUrls: ["https://testnet.bscscan.com/"],
    };
  }
  return null;
};

const getStoredConnected = () => {
  try {
    return localStorage.getItem(STORAGE_CONNECTED) === "1";
  } catch {
    return false;
  }
};

const setStoredConnected = (on: boolean, walletType?: WalletType) => {
  try {
    if (on) {
      localStorage.setItem(STORAGE_CONNECTED, "1");
      if (walletType) localStorage.setItem(STORAGE_WALLET_TYPE, walletType);
    } else {
      localStorage.removeItem(STORAGE_CONNECTED);
      localStorage.removeItem(STORAGE_WALLET_TYPE);
    }
  } catch {
    // ignore storage failures
  }
};

const getStoredWalletType = (): WalletType | undefined => {
  try {
    const v = localStorage.getItem(STORAGE_WALLET_TYPE);
    if (v === "metamask" || v === "binance" || v === "injected") return v;
    return undefined;
  } catch {
    return undefined;
  }
};

export function useWallet(): WalletHook {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);

  const accountRef = useRef("");
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  const targetChainId = useMemo(() => readTargetChainId(), []);
  const isWrongNetwork = useMemo(() => {
    if (!targetChainId) return false;
    if (!chainId) return false;
    return Number(chainId) !== Number(targetChainId);
  }, [chainId, targetChainId]);

  const pickInjected = (wallet: WalletType | undefined) => {
    const anyWindow = window as any;
    const ethereum = anyWindow.ethereum;
    if (!ethereum) return null;

    const providers = ethereum.providers || [ethereum];

    if (wallet === "metamask") {
      return providers.find((p: any) => p.isMetaMask) || providers[0];
    }
    if (wallet === "binance") {
      return providers.find((p: any) => p.isBinance) || providers[0];
    }
    return providers[0];
  };

  const ensureTargetChain = useCallback(
    async (selected: any) => {
      if (!targetChainId) return;

      try {
        const bp = new BrowserProvider(selected);
        const net = await bp.getNetwork();
        if (Number(net.chainId) === Number(targetChainId)) return;
      } catch {
        // ignore
      }

      const params = getChainParams(targetChainId);
      const chainIdHex = "0x" + Number(targetChainId).toString(16);

      try {
        await selected.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      } catch (e: any) {
        if (e?.code === 4902 && params) {
          await selected.request({
            method: "wallet_addEthereumChain",
            params: [params],
          });
          await selected.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainIdHex }],
          });
          return;
        }
        throw e;
      }
    },
    [targetChainId]
  );

  // Mount: set provider + chainId always; restore accounts only if user previously connected.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const anyWindow = window as any;
    const ethereum = anyWindow.ethereum;

    setHasProvider(Boolean(ethereum));
    if (!ethereum) return;

    const storedWallet = getStoredWalletType();
    const injected = pickInjected(storedWallet) || (ethereum.providers?.find?.((p: any) => p.isMetaMask) || ethereum);

    const browserProvider = new BrowserProvider(injected);
    setProvider(browserProvider);

    const handleAccountsChanged = (accounts: string[]) => {
      // Accept updates if we are connected in-app OR we have a stored "connected" flag.
      if (!accountRef.current && !getStoredConnected()) return;

      const primary = accounts[0] ?? "";
      setAccount(primary);

      if (!primary) {
        setSigner(null);
        // If wallet now has no accounts, clear our stored connected flag
        setStoredConnected(false);
        return;
      }

      browserProvider
        .getSigner()
        .then((s) => setSigner(s))
        .catch(() => setSigner(null));
    };

    const handleChainChanged = (hexChainId: string) => {
      try {
        setChainId(Number(BigInt(hexChainId)));
      } catch {
        setChainId(undefined);
      }
    };

    // Always init chain id
    browserProvider
      .getNetwork()
      .then((network) => setChainId(Number(network.chainId)))
      .catch(() => {});

    // Restore accounts ONLY if user previously connected and has not disconnected.
    if (getStoredConnected()) {
      browserProvider
        .send("eth_accounts", [])
        .then((accounts: string[]) => {
          const primary = accounts?.[0] ?? "";
          if (!primary) {
            // No authorized account anymore -> clear stored session
            setStoredConnected(false);
            setAccount("");
            setSigner(null);
            return;
          }
          setAccount(primary);
          browserProvider.getSigner().then(setSigner).catch(() => setSigner(null));
        })
        .catch(() => {
          // If we can’t read accounts, treat as disconnected
          setStoredConnected(false);
          setAccount("");
          setSigner(null);
        });
    } else {
      // Ensure app stays disconnected after explicit disconnect + reload
      setAccount("");
      setSigner(null);
    }

    injected?.on?.("accountsChanged", handleAccountsChanged);
    injected?.on?.("chainChanged", handleChainChanged);

    return () => {
      injected?.removeListener?.("accountsChanged", handleAccountsChanged);
      injected?.removeListener?.("chainChanged", handleChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally mount-only

  const connect = useCallback(
    async (wallet?: WalletType) => {
      if (typeof window === "undefined") {
        toast.error("No browser environment detected.");
        return;
      }

      const selected = pickInjected(wallet);
      if (!selected) {
        toast.error("No wallet found. Install MetaMask (or a BSC-capable wallet) to continue.");
        return;
      }

      setConnecting(true);
      try {
        const accounts: string[] = await selected.request({
          method: "eth_requestAccounts",
        });

        if (!accounts || accounts.length === 0) {
          toast.error("No accounts returned from wallet.");
          return;
        }

        // Persist “connected” across reloads, and remember the chosen wallet type.
        setStoredConnected(true, wallet ?? "injected");

        if (targetChainId) {
          try {
            await ensureTargetChain(selected);
          } catch {
            toast.error(
              `Please switch your wallet network to ${
                targetChainId === 56
                  ? "BSC Mainnet"
                  : targetChainId === 97
                  ? "BSC Testnet"
                  : `Chain ${targetChainId}`
              }.`
            );
          }
        }

        const browserProvider = new BrowserProvider(selected);
        setProvider(browserProvider);
        setAccount(accounts[0]);

        const s = await browserProvider.getSigner();
        setSigner(s);

        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));
      } catch (e: any) {
        // If user rejected or connect failed, do not persist “connected”.
        setStoredConnected(false);
        const msg = e?.shortMessage || e?.reason || e?.message || "Failed to connect wallet.";
        toast.error(msg);
      } finally {
        setConnecting(false);
      }
    },
    [ensureTargetChain, targetChainId]
  );

  const switchToTargetChain = useCallback(async () => {
    if (typeof window === "undefined") return;

    const anyWindow = window as any;
    const ethereum = anyWindow.ethereum;
    if (!ethereum) {
      toast.error("No wallet found. Install MetaMask to switch networks.");
      return;
    }
    if (!targetChainId) {
      toast.error("Target chain not configured. Set VITE_TARGET_CHAIN_ID.");
      return;
    }

    const selected =
      ethereum.providers?.find?.((p: any) => p.isMetaMask) || ethereum;

    try {
      await ensureTargetChain(selected);

      const bp = new BrowserProvider(selected);
      const net = await bp.getNetwork();
      setChainId(Number(net.chainId));

      toast.success("Network switched.");
    } catch (e: any) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Failed to switch network.";
      toast.error(msg);
    }
  }, [ensureTargetChain, targetChainId]);

  const disconnect = useCallback(() => {
    // App-level disconnect (cannot revoke wallet authorization; just clears LaunchIt state)
    setStoredConnected(false);
    setAccount("");
    setSigner(null);
  }, []);

  return useMemo(
    () => ({
      provider,
      signer,
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
