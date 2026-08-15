import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  connectSolanaWallet as connectSolanaFn,
  disconnectSolanaWallet as disconnectSolanaFn,
  detectSolanaWallets,
  ensureSolanaListeners,
  getSolanaProvider,
  getStoredSolanaWallet,
  getStoredSolanaWalletName,
  refreshSolanaWalletFromProvider,
  SOLANA_WALLET_EVENT,
  type DetectedSolanaWallet,
} from "@/lib/solanaWallet";

type SolanaConnectResult = {
  publicKey: string;
  walletId: string;
  walletName: string;
};

type SolanaWalletContextType = {
  solanaAccount: string;
  solanaWalletName: string;
  isSolanaConnected: boolean;
  connectingSolana: boolean;
  availableSolanaWallets: DetectedSolanaWallet[];
  connectSolana: (walletId?: string) => Promise<SolanaConnectResult>;
  disconnectSolana: () => Promise<void>;
};

const SolanaWalletContext = createContext<SolanaWalletContextType | null>(null);

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const [solanaAccount, setSolanaAccount] = useState(() => getStoredSolanaWallet());
  const [solanaWalletName, setSolanaWalletName] = useState(() => getStoredSolanaWalletName());
  const [connectingSolana, setConnectingSolana] = useState(false);
  const [availableSolanaWallets, setAvailableSolanaWallets] = useState<DetectedSolanaWallet[]>([]);

  const refreshAvailableWallets = useCallback(() => {
    ensureSolanaListeners({ readExistingAccount: true });
    setAvailableSolanaWallets(detectSolanaWallets());
  }, []);

  const connectSolana = useCallback(async (walletId?: string) => {
    setConnectingSolana(true);

    try {
      const result = await connectSolanaFn(walletId);
      setSolanaAccount(result.publicKey);
      setSolanaWalletName(result.walletName);
      refreshAvailableWallets();
      return result;
    } finally {
      setConnectingSolana(false);
    }
  }, [refreshAvailableWallets]);

  const disconnectSolana = useCallback(async () => {
    await disconnectSolanaFn();
    setSolanaAccount("");
    setSolanaWalletName("");
    refreshAvailableWallets();
  }, [refreshAvailableWallets]);

  useEffect(() => {
    refreshAvailableWallets();
    const existing = refreshSolanaWalletFromProvider() || getStoredSolanaWallet();
    if (existing) {
      setSolanaAccount(existing);
      setSolanaWalletName(getStoredSolanaWalletName());
    }

    const restoreTrusted = window.setTimeout(() => {
      const provider = getSolanaProvider();
      if (!provider?.connect || getStoredSolanaWallet()) return;
      void provider.connect({ onlyIfTrusted: true } as { onlyIfTrusted?: boolean }).then((result) => {
        const key = String(result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "").trim();
        if (key) {
          refreshSolanaWalletFromProvider();
          setSolanaAccount(key);
        }
      }).catch(() => {});
    }, 120);

    const timers = [80, 250, 800, 1600].map((delay) =>
      window.setTimeout(() => {
        setAvailableSolanaWallets(detectSolanaWallets());
        const restored = refreshSolanaWalletFromProvider() || getStoredSolanaWallet();
        if (restored) {
          setSolanaAccount(restored);
          setSolanaWalletName(getStoredSolanaWalletName());
        }
      }, delay)
    );

    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ publicKey?: string; walletName?: string }>).detail;
      if (!detail?.publicKey) {
        setSolanaAccount("");
        setSolanaWalletName("");
        return;
      }
      setSolanaAccount(String(detail.publicKey));
      setSolanaWalletName(String(detail.walletName || ""));
      refreshAvailableWallets();
    };

    window.addEventListener(SOLANA_WALLET_EVENT, onEvent as EventListener);

    return () => {
      window.clearTimeout(restoreTrusted);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener(SOLANA_WALLET_EVENT, onEvent as EventListener);
    };
  }, [refreshAvailableWallets]);

  return (
    <SolanaWalletContext.Provider
      value={{
        solanaAccount,
        solanaWalletName,
        isSolanaConnected: Boolean(solanaAccount),
        connectingSolana,
        availableSolanaWallets,
        connectSolana,
        disconnectSolana,
      }}
    >
      {children}
    </SolanaWalletContext.Provider>
  );
}

export function useSolanaWallet() {
  const ctx = useContext(SolanaWalletContext);
  if (!ctx) {
    throw new Error("useSolanaWallet must be used within a SolanaWalletProvider");
  }
  return ctx;
}
