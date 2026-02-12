import React, { createContext, useContext } from "react";

// IMPORTANT: this context wraps the *implementation* hook.
// Do NOT import from this file again (would create a circular dependency).
import { useWallet as useWalletImpl, type WalletType } from "@/hooks/useWallet";

/**
 * WalletContext
 *
 * Single shared wallet state + a single set of EIP-1193 listeners for the whole app.
 * This prevents multiple components from instantiating their own useWallet() instances.
 */

type WalletContextValue = ReturnType<typeof useWalletImpl>;

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWalletImpl();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

/**
 * useWallet (context-backed)
 *
 * Replaces direct imports from '@/hooks/useWallet' across the UI.
 */
export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}

export type { WalletType };
