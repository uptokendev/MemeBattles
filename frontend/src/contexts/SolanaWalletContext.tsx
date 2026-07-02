import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  connectSolanaWallet as connectSolanaFn,
  disconnectSolanaWallet as disconnectSolanaFn,
  detectSolanaWallets,
  ensureSolanaListeners,
  getStoredSolanaWallet,
  getStoredSolanaWalletName,
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

  const sync = useCallback(() => {
    ensureSolanaListeners({ readExistingAccount: false });
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
    await disconnectSolanaFn();
    setSolanaAccount("");
    setSolanaWalletName("");
    sync();
  }, [sync]);

  useEffect(() => {
    sync();

    const timers = [80, 250, 800, 1600].map((delay) =>
      window.setTimeout(() => {
        setAvailableSolanaWallets(detectSolanaWallets());
      }, delay)
    );

    const onEvent = () => sync();

    window.addEventListener(SOLANA_WALLET_EVENT, onEvent as EventListener);
    window.addEventListener("focus", onEvent as EventListener);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener(SOLANA_WALLET_EVENT, onEvent as EventListener);
      window.removeEventListener("focus", onEvent as EventListener);
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
