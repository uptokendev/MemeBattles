import React, { createContext, useContext } from "react";

import { useWallet as useWalletImpl } from "@/hooks/useWallet";

import type { DetectedWallet, WalletHook, WalletType } from "@/hooks/useWallet";

const WalletContext = createContext<WalletHook | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWalletImpl();

  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletHook {
  const ctx = useContext(WalletContext);

  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }

  return ctx;
}

export type { DetectedWallet, WalletHook, WalletType };
