import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet, type WalletType } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import {
  ensureSolanaListeners,
  getStoredSolanaWallet,
  SOLANA_WALLET_EVENT,
} from "@/lib/solanaWallet";

export const ConnectWalletButton = () => {
  const {
    connect,
    disconnect,
    isConnected,
    account,
    connecting,
    detectedWallets,
    detectWallets,
  } = useWallet();
  const {
    solanaAccount,
    solanaWalletName,
    connectingSolana,
    connectSolana,
    disconnectSolana,
    availableSolanaWallets,
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

  const evmWallets = useMemo(() => {
    return detectedWallets.filter((wallet) => {
      const id = String(wallet.id || "").toLowerCase();
      const name = String(wallet.name || "").toLowerCase();
      return !id.includes("phantom") && !name.includes("phantom");
    });
  }, [detectedWallets]);

  const handleConnect = async (type?: WalletType) => {
    try {
      await connect(type);
      setIsOpen(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to connect wallet");
    }
  };

  const handleSolanaConnect = async (walletId?: string) => {
    try {
      await connectSolana(walletId);
      setIsOpen(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to connect Solana wallet");
    }
  };

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

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl shadow-xl w-[90%] max-w-sm p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm md:text-base font-retro">Connect a wallet</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-2">
              Connect an EVM wallet for BNB or a supported Solana wallet for Solana mainnet.
            </p>

            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Solana wallets
            </div>
            <div className="space-y-1">
              {availableSolanaWallets.length ? availableSolanaWallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => void handleSolanaConnect(wallet.id)}
                  disabled={connectingSolana}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {wallet.icon}
                    </span>
                    <div>
                      <p className="text-xs md:text-sm font-medium">{wallet.name}</p>
                      <p className="text-[10px] text-muted-foreground">Solana mainnet via supported Solana wallets</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-green-500">
                    {effectiveSolana && solanaWalletName === wallet.name ? "RECENT" : "DETECTED"}
                    <Check className="h-3 w-3" />
                  </div>
                </button>
              )) : (
                <div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  Install a supported Solana wallet such as Phantom, Solflare, Backpack, or Glow.
                </div>
              )}
            </div>

            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 pt-2">
              EVM wallets
            </div>
            <div className="space-y-1">
              {evmWallets.length ? evmWallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => void handleConnect(wallet.id)}
                  disabled={connecting}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
                >
                  <div>
                    <p className="text-xs md:text-sm font-medium">{wallet.name}</p>
                    <p className="text-[10px] text-muted-foreground">BNB Smart Chain EVM wallet</p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-green-500">
                    DETECTED
                    <Check className="h-3 w-3" />
                  </div>
                </button>
              )) : (
                <button
                  onClick={() => void handleConnect("injected")}
                  disabled={connecting}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
                >
                  <div>
                    <p className="text-xs md:text-sm font-medium">Injected EVM wallet</p>
                    <p className="text-[10px] text-muted-foreground">BNB Smart Chain wallet</p>
                  </div>
                  <div className="text-[10px] text-muted-foreground">EVM</div>
                </button>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground mt-2">
              Solana wallet support covers connection, persistence, and message signing. Bonding transactions still require the Solana program/client layer.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
