import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useMemo, useState } from "react";

export type WalletType = "metamask" | "binance" | "injected";

type WalletHook = {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string;
  chainId?: number;
  connecting: boolean;
  connect: (wallet?: WalletType) => Promise<void>;
  disconnect: () => void;          // <- ADD THIS
  isConnected: boolean;
};

export function useWallet(): WalletHook {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);

  // Detect default wallet on mount (for read-only state)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const anyWindow = window as any;
    const ethereum = anyWindow.ethereum;
    if (!ethereum) {
      return;
    }

    // Prefer MetaMask if multiple providers are injected
    const injected =
      ethereum.providers?.find?.((p: any) => p.isMetaMask) || ethereum;

    const browserProvider = new BrowserProvider(injected);
    setProvider(browserProvider);

    const handleAccountsChanged = (accounts: string[]) => {
      const primary = accounts[0] ?? "";
      setAccount(primary);

      if (!primary) {
        setSigner(null);
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

    // Initialize from current accounts
    browserProvider
      .send("eth_accounts", [])
      .then(handleAccountsChanged)
      .catch(() => {});

    // Initialize from current network
    browserProvider
      .getNetwork()
      .then((network) => setChainId(Number(network.chainId)))
      .catch(() => {});

    injected?.on?.("accountsChanged", handleAccountsChanged);
    injected?.on?.("chainChanged", handleChainChanged);

    return () => {
      injected?.removeListener?.("accountsChanged", handleAccountsChanged);
      injected?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  // Helper: pick a specific injected wallet
  const pickInjected = (wallet: WalletType | undefined) => {
    const anyWindow = window as any;
    const ethereum = anyWindow.ethereum;
    if (!ethereum) return null;

    const providers = ethereum.providers || [ethereum];

    if (wallet === "metamask") {
      return providers.find((p: any) => p.isMetaMask) || providers[0];
    }

    if (wallet === "binance") {
      // Many Binance wallets expose isBinance or similar
      return providers.find((p: any) => p.isBinance) || providers[0];
    }

    // Generic injected fallback
    return providers[0];
  };

  const connect = useCallback(
    async (wallet?: WalletType) => {
      if (typeof window === "undefined") {
        throw new Error("No browser environment detected.");
      }

      const selected = pickInjected(wallet);
      if (!selected) {
        throw new Error("No EVM wallet found. Please install MetaMask or another BSC-capable wallet.");
      }

      setConnecting(true);
      try {
        // Request accounts from the selected provider
        const accounts: string[] = await selected.request({
          method: "eth_requestAccounts",
        });

        if (!accounts || accounts.length === 0) {
          throw new Error("No accounts returned from wallet.");
        }

        const browserProvider = new BrowserProvider(selected);
        setProvider(browserProvider);
        setAccount(accounts[0]);

        const signer = await browserProvider.getSigner();
        setSigner(signer);

        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));

        // Optional: enforce a BSC chain (read from env if you want)
        // const targetChain = import.meta.env.VITE_TARGET_CHAIN_ID; // e.g. "56" or "97"
        // if (targetChain && Number(network.chainId) !== Number(targetChain)) {
        //   const chainIdHex = "0x" + Number(targetChain).toString(16);
        //   try {
        //     await selected.request({
        //       method: "wallet_switchEthereumChain",
        //       params: [{ chainId: chainIdHex }],
        //     });
        //   } catch (e) {
        //     console.warn("Failed to switch chain", e);
        //   }
        // }
      } finally {
        setConnecting(false);
      }
    },
    []
  );
 const disconnect = useCallback(() => {
    setAccount("");
    setSigner(null);
    // We keep provider so read-only RPC still works; 
    // if you want a “hard reset” you could also do: setProvider(null);
  }, []);
  return useMemo(
    () => ({
      provider,
      signer,
      account,
      chainId,
      connecting,
      connect,
      disconnect,          // <- ADD THIS
      isConnected: Boolean(account),
    }),
    [provider, signer, account, chainId, connecting, connect, disconnect]
  );
}
