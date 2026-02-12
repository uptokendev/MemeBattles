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
  disconnect: () => void;          // <- ADD THIS
  isConnected: boolean;
};

export function useWallet(): WalletHook {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const eip1193Ref = useRef<any>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const bindEip1193Listeners = useCallback((selectedProvider: any) => {
    // Tear down any previous listeners
    cleanupRef.current?.();
    cleanupRef.current = null;

    const anyWindow = window as any;
    const ethereum = anyWindow.ethereum;

    const targets = new Set<any>();
    if (ethereum) targets.add(ethereum);            // important: aggregator
    if (selectedProvider) targets.add(selectedProvider); // specific provider

    const offs: Array<() => void> = [];

    const onAccountsChanged = (accounts: string[]) => {
      const primary = accounts?.[0] ?? "";
      setAccount(primary);

      if (!primary) {
        setSigner(null);
        return;
      }

      // Rebuild BrowserProvider against current selected provider to keep it in sync
      try {
        const bp = new BrowserProvider(selectedProvider ?? ethereum);
        setProvider(bp);
        bp.getSigner()
          .then((s) => setSigner(s))
          .catch(() => setSigner(null));
      } catch {
        setSigner(null);
      }
    };

    const onChainChanged = (hexChainId: string) => {
      try {
        setChainId(Number(BigInt(hexChainId)));
      } catch {
        setChainId(undefined);
      }

      // Recreate provider + signer to avoid "network changed" errors (ethers v6)
      try {
        const bp = new BrowserProvider(selectedProvider ?? ethereum);
        setProvider(bp);
        bp.send("eth_accounts", [])
          .then(onAccountsChanged)
          .catch(() => setSigner(null));
      } catch {
        // ignore
      }
    };

    // Attach listeners on both targets (aggregator + selected)
    for (const t of targets) {
      if (!t?.on) continue;
      t.on("accountsChanged", onAccountsChanged);
      t.on("chainChanged", onChainChanged);
      offs.push(() => {
        t.removeListener?.("accountsChanged", onAccountsChanged);
        t.removeListener?.("chainChanged", onChainChanged);
      });
    }

    cleanupRef.current = () => {
      offs.forEach((fn) => {
        try { fn(); } catch {}
      });
    };
  }, []);

  // Detect default wallet on mount (for read-only state)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const anyWindow = window as any;
    const ethereum = anyWindow.ethereum;
    if (!ethereum) {
      return;
    }

    // Prefer MetaMask if multiple providers are injected
    const injected = ethereum.providers?.find?.((p: any) => p.isMetaMask) || ethereum;

    if (!injected || typeof injected.request !== "function") return;
    eip1193Ref.current = injected;
    bindEip1193Listeners(injected);
    // IMPORTANT (ethers v6): BrowserProvider throws NETWORK_ERROR if the wallet
    // changes networks after the provider is created. So we recreate the
    // BrowserProvider on chainChanged.
    const browserProvider = new BrowserProvider(injected);
    setProvider(browserProvider);

    // Initialize from current accounts
    browserProvider
      .send("eth_accounts", [])
      .then((accounts) => {
        const primary = accounts?.[0] ?? "";
        setAccount(primary);
        if (!primary) return;
        browserProvider.getSigner().then(setSigner).catch(() => setSigner(null));
      })
      .catch(() => {});

    // Initialize from current network
    browserProvider
      .getNetwork()
      .then((network) => setChainId(Number(network.chainId)))
      .catch(() => {});

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [bindEip1193Listeners]);

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

        // IMPORTANT: re-bind listeners to the wallet the user actually picked
        eip1193Ref.current = selected;
        bindEip1193Listeners(selected);

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
    [bindEip1193Listeners]
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
