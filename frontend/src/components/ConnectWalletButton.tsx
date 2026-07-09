import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  ensureSolanaListeners,
  getStoredSolanaWallet,
  SOLANA_WALLET_EVENT,
} from "@/lib/solanaWallet";
import { ConnectWalletModal } from "@/components/wallet/ConnectWalletModal";

export const ConnectWalletButton = () => {
  const {
    disconnect,
    isConnected,
    account,
    connecting,
    detectWallets,
  } = useWallet();
  const {
    solanaAccount,
    connectingSolana,
    disconnectSolana,
  } = useSolanaWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    detectWallets();
    ensureSolanaListeners();

    const sync = () => {
      detectWallets();
      ensureSolanaListeners();
    };

    const timers = [0, 80, 250, 800, 1600].map((delay) => window.setTimeout(sync, delay));
    window.addEventListener(SOLANA_WALLET_EVENT, sync as EventListener);
    window.addEventListener("focus", sync as EventListener);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener(SOLANA_WALLET_EVENT, sync as EventListener);
      window.removeEventListener("focus", sync as EventListener);
    };
  }, [detectWallets]);

  const liveSolana = getStoredSolanaWallet();
  const effectiveSolana = liveSolana || solanaAccount;
  const displayedAccount = effectiveSolana || account;
  const shortAddress =
    displayedAccount && displayedAccount.length > 10
      ? `${displayedAccount.slice(0, 6)}...${displayedAccount.slice(-4)}`
      : displayedAccount || "";

  const handleDisconnect = async () => {
    try {
      if (solanaAccount || getStoredSolanaWallet()) {
        await disconnectSolana();
      }
      if (isConnected) {
        await disconnect();
      }
    } finally {
      setShowDropdown(false);
    }
  };

  if (displayedAccount) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowDropdown(true)}
        onMouseLeave={() => setShowDropdown(false)}
      >
        <Button
          variant="outline"
          className="font-mono text-xs md:text-sm rounded-full px-3 md:px-4 py-1 h-auto flex items-center gap-2"
          onClick={() => setShowDropdown((open) => !open)}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {shortAddress}
        </Button>

        {showDropdown && (
          <div className="absolute right-0 mt-1 w-32 rounded-md border border-border bg-background shadow-lg z-50">
            <button
              className="w-full text-left text-xs px-3 py-2 hover:bg-muted"
              onClick={() => void handleDisconnect()}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        disabled={connecting || connectingSolana}
        className="font-retro text-xs md:text-sm rounded-full px-3 md:px-4 py-1 h-auto flex items-center gap-1"
      >
        {connecting || connectingSolana ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            Connect Wallet
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </Button>

      <ConnectWalletModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
};
