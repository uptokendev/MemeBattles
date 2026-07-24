import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  connectSolanaWallet as connectSolanaFn,
  disconnectSolanaWallet as disconnectSolanaFn,
  detectSolanaWallets,
  ensureSolanaListeners,
  getStoredSolanaWallet,
  getStoredSolanaWalletName,
  refreshSolanaWalletFromProvider,
  SOLANA_WALLET_EVENT,
  type DetectedSolanaWallet,
} from "@/lib/solanaWallet";

type SolanaWalletContextType = {
  solanaAccount: string;
  solanaWalletName: string;
  isSolanaConnected: boolean;
  connectingSolana: boolean;
  availableSolanaWallets: DetectedSolanaWallet[];
  connectSolana: (walletId?: string) => Promise<SolanaConnectResult>;
  disconnectSolana: () => Promise<void>;
};

type SolanaConnectResult = {
  publicKey: string;
  walletId: string;
  walletName: string;
};

const SolanaWalletContext = createContext<SolanaWalletContextType | null>(null);

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const [solanaAccount, setSolanaAccount] = useState(() => getStoredSolanaWallet());
  const [solanaWalletName, setSolanaWalletName] = useState(() => getStoredSolanaWalletName());
  const [connectingSolana, setConnectingSolana] = useState(false);
  const [availableSolanaWallets, setAvailableSolanaWallets] = useState<DetectedSolanaWallet[]>([]);

  const sync = useCallback(() => {
    ensureSolanaListeners();
    setAvailableSolanaWallets(detectSolanaWallets());
    setSolanaAccount(getStoredSolanaWallet());
    setSolanaWalletName(getStoredSolanaWalletName());
  }, []);

  const connectSolana = useCallback(async (walletId?: string) => {
    setConnectingSolana(true);

    try {
      const result = await connectSolanaFn(walletId);
      setSolanaAccount(result.publicKey);
      setSolanaWalletName(result.walletName);
      sync();
      return result;
    } finally {
      setConnectingSolana(false);
    }
  }, [sync]);

  const disconnectSolana = useCallback(async () => {
    try {
      await disconnectSolanaFn();
    } finally {
      setSolanaAccount("");
      setSolanaWalletName("");
      setAvailableSolanaWallets(detectSolanaWallets());
    }
  }, []);

  useEffect(() => {
    sync();

    const timers = [0, 80, 250, 800, 1600].map((delay) =>
      window.setTimeout(() => {
        refreshSolanaWalletFromProvider();
        sync();
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
      setAvailableSolanaWallets(detectSolanaWallets());
    };

    const onFocus = () => {
      refreshSolanaWalletFromProvider();
      sync();
    };

    window.addEventListener(SOLANA_WALLET_EVENT, onEvent as EventListener);
    window.addEventListener("focus", onFocus);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener(SOLANA_WALLET_EVENT, onEvent as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, [sync]);

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
