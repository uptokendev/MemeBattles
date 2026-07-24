import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet, type WalletType } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { Loader2, ChevronDown, Check } from "lucide-react";
import {
  getStoredSolanaWallet,
  ensureSolanaListeners,
  SOLANA_WALLET_EVENT,
} from "@/lib/solanaWallet";

export const ConnectWalletButton = () => {
  const { connect, disconnect, isConnected, account, connecting } = useWallet();
  const {
    solanaAccount,
    solanaWalletName,
    isSolanaConnected,
    connectingSolana,
    connectSolana,
    disconnectSolana,
    availableSolanaWallets,
  } = useSolanaWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeWalletType, setActiveWalletType] = useState<"solana" | "evm" | null>(null);

  // Robust preference for Solana:
  // - Always prefer a live provider.publicKey or the stored Solana address.
  // - Attach listeners and probe provider.publicKey without triggering wallet popups.
  // - When Solana state appears at any point, force displayed + active to Solana.
  useEffect(() => {
    ensureSolanaListeners();

    const forceSync = () => {
      ensureSolanaListeners();
      const live = getStoredSolanaWallet();
      if (live) {
        setActiveWalletType("solana");
        return true;
      }
      // No live Solana key right now: only fall back to EVM if we don't already have a stored Solana value.
      // This prevents the EVM auto-connect from "stealing" the button after a reload when the user had been using Phantom.
      const stored = (() => {
        try {
          return window.localStorage.getItem("mwz:solana_wallet") || "";
        } catch {
          return "";
        }
      })();
      if (!stored && account) {
        setActiveWalletType("evm");
      }
      return false;
    };

    // Run immediately + several delayed probes. The delays match common provider/extension readiness windows.
    forceSync();
    const timers = [0, 40, 120, 350, 700, 1400, 2200].map((d) =>
      window.setTimeout(forceSync, d)
    );

    const onSolanaEvent = () => forceSync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mwz:solana_wallet") forceSync();
    };
    window.addEventListener(SOLANA_WALLET_EVENT, onSolanaEvent as EventListener);
    window.addEventListener("focus", onSolanaEvent as EventListener);
    window.addEventListener("storage", onStorage);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener(SOLANA_WALLET_EVENT, onSolanaEvent as EventListener);
      window.removeEventListener("focus", onSolanaEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [account]);

  // Always re-check live provider on render path too; getStored prefers the real current publicKey.
  // This makes the header button show the correct address even if a setState is one render behind.
  const liveSolana = getStoredSolanaWallet();
  const effectiveSolana = liveSolana || solanaAccount;
  const displayedAccount = effectiveSolana || account;
  const shortAddress = displayedAccount && displayedAccount.length > 10
    ? `${displayedAccount.slice(0, 6)}...${displayedAccount.slice(-4)}`
    : displayedAccount || "";

  const handleConnect = async (type: WalletType) => {
    try {
      await connect(type);
      // After an EVM connect attempt, immediately re-prefer Solana if a key is present.
      // This stops the EVM auto-connect from winning the button when the user intends to use Solana.
      const live = getStoredSolanaWallet();
      if (live) {
        setActiveWalletType("solana");
      } else if (!solanaAccount) {
        setActiveWalletType("evm");
      }
      setIsOpen(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to connect wallet");
    }
  };

  const handleSolanaConnect = async (walletId?: string) => {
    try {
      await connectSolana(walletId);
      setActiveWalletType("solana");
      setIsOpen(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to connect Solana wallet");
    }
  };

  const handleDisconnect = async () => {
    try {
      ensureSolanaListeners();
      await Promise.allSettled([
        solanaAccount || getStoredSolanaWallet() ? disconnectSolana() : Promise.resolve(),
        isConnected ? disconnect() : Promise.resolve(),
      ]);
      setActiveWalletType(null);
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
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {shortAddress}
        </Button>

        {showDropdown && (
          <div className="absolute right-0 mt-1 w-32 rounded-md border border-border bg-background shadow-lg z-50">
            <button
              className="w-full text-left text-xs px-3 py-2 hover:bg-muted"
              onClick={handleDisconnect}
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
              <h2 className="text-sm md:text-base font-retro">
                Connect a wallet
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-2">
              Connect a wallet. Solana wallets use Solana mainnet (101). EVM wallets use BNB mainnet (56) only.
            </p>

            {/* Solana wallets are detected only; connection happens when a user clicks a row. */}
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">or connect a wallet</div>
            <div className="space-y-1">
              {availableSolanaWallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => handleSolanaConnect(wallet.id)}
                  disabled={connectingSolana}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{wallet.icon}</span>
                    <div>
                      <p className="text-xs md:text-sm font-medium">{wallet.name}</p>
                      <p className="text-[10px] text-muted-foreground">Solana mainnet (101)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-green-500">
                    {effectiveSolana && solanaWalletName === wallet.name ? "RECENT" : "DETECTED"}
                    <Check className="h-3 w-3" />
                  </div>
                </button>
              ))}

              {/* EVM wallets - hardcoded for main ones, Other for injected. Phantom filtered from EVM detection so no EVM Phantom. */}
              <button
                onClick={() => handleConnect("metamask")}
                disabled={connecting}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🦊</span>
                  <div>
                    <p className="text-xs md:text-sm font-medium">MetaMask</p>
                    <p className="text-[10px] text-muted-foreground">BNB Smart Chain mainnet (56)</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-green-500">
                  DETECTED
                  <Check className="h-3 w-3" />
                </div>
              </button>

              <button
                onClick={() => handleConnect("binance")}
                disabled={connecting}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🟡</span>
                  <div>
                    <p className="text-xs md:text-sm font-medium">Binance Wallet</p>
                    <p className="text-[10px] text-muted-foreground">BNB Smart Chain mainnet (56)</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-green-500">
                  DETECTED
                  <Check className="h-3 w-3" />
                </div>
              </button>

              <button
                onClick={() => handleConnect("injected")}
                disabled={connecting}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Other EVM wallet</p>
                  <p className="text-[10px] text-muted-foreground">
                    Injected BNB (56) wallet. (Phantom filtered - use a Solana wallet row above)
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  EVM
                </div>
              </button>
            </div>

            <div className="text-[10px] text-muted-foreground">More wallets → install and refresh</div>

            <p className="text-[10px] text-muted-foreground mt-2">
              BNB Smart Chain mainnet (56) EVM or Solana mainnet (101) only.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
