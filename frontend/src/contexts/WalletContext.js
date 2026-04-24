import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
import { useWallet as useWalletImpl } from "@/hooks/useWallet";
const WalletContext = createContext(null);
export function WalletProvider({ children }) {
    const wallet = useWalletImpl();
    return _jsx(WalletContext.Provider, { value: wallet, children: children });
}
export function useWallet() {
    const ctx = useContext(WalletContext);
    if (!ctx) {
        throw new Error("useWallet must be used within a WalletProvider");
    }
    return ctx;
}
