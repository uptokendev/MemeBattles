import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  connectSolanaWallet as connectSolanaFn,
  disconnectSolanaWallet as disconnectSolanaFn,
  getStoredSolanaWallet,
  SOLANA_WALLET_EVENT,
  ensurePhantomListeners,
} from "@/lib/solanaWallet";

type SolanaWalletContextType = {
  solanaAccount: string;
  isSolanaConnected: boolean;
  connectingSolana: boolean;
  connectSolana: () => Promise<void>;
  disconnectSolana: () => Promise<void>;
};

const SolanaWalletContext = createContext<SolanaWalletContextType | null>(null);

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const [solanaAccount, setSolanaAccount] = useState(() => getStoredSolanaWallet());
  const [connectingSolana, setConnectingSolana] = useState(false);

  const isSolanaConnected = !!solanaAccount;

  const connectSolana = useCallback(async () => {
    setConnectingSolana(true);
    try {
      ensurePhantomListeners();
      const publicKey = await connectSolanaFn();
      setSolanaAccount(publicKey);
    } catch (e: any) {
      console.error(e);
      throw e;
    } finally {
      setConnectingSolana(false);
    }
  }, []);

  const disconnectSolana = useCallback(async () => {
    try {
      await disconnectSolanaFn();
      setSolanaAccount("");
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const sync = () => setSolanaAccount(getStoredSolanaWallet());
    sync();
    const onEvent = () => sync();
    window.addEventListener(SOLANA_WALLET_EVENT, onEvent as EventListener);
    window.addEventListener("focus", sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mwz:solana_wallet") sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SOLANA_WALLET_EVENT, onEvent as EventListener);
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <SolanaWalletContext.Provider
      value={{
        solanaAccount,
        isSolanaConnected,
        connectingSolana,
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
