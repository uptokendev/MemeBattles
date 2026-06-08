import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet, type WalletType } from "@/contexts/WalletContext";
import { Loader2, ChevronDown, Check } from "lucide-react";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getSolanaProvider,
  getStoredSolanaWallet,
  SOLANA_WALLET_EVENT,
} from "@/lib/solanaWallet";

export const ConnectWalletButton = () => {
  const { connect, disconnect, isConnected, account, connecting } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [solanaAccount, setSolanaAccount] = useState(() => getStoredSolanaWallet());
  const [connectingSolana, setConnectingSolana] = useState(false);

  // Explicit active wallet mode for strict SOL preference
  const [activeWalletType, setActiveWalletType] = useState<"solana" | "evm" | null>(null);

  // Ref to always have latest EVM account for event handlers (avoids stale closures)
  const evmAccountRef = useRef<string>("");
  useEffect(() => {
    evmAccountRef.current = account || "";
  }, [account]);

  // Recompute prefers live Solana (via getStoredSolanaWallet which now triggers
  // the global Phantom listener attachment in solanaWallet.ts) and falls back to EVM.
  // We still listen to the custom event (dispatched by the global listeners on
  // native Phantom connect/disconnect/accountChanged) + focus for robustness.
  useEffect(() => {
    let cancelled = false;

    const recompute = () => {
      if (cancelled) return;
      const live = getStoredSolanaWallet();
      setSolanaAccount(live);
      if (live) {
        setActiveWalletType("solana");
      } else if (evmAccountRef.current) {
        setActiveWalletType("evm");
      } else {
        setActiveWalletType(null);
      }
    };

    recompute();
    window.addEventListener(SOLANA_WALLET_EVENT, recompute as EventListener);
    window.addEventListener("focus", recompute);

    // Seed the global listeners (if not already attached) by reading the wallet.
    // The lib's ensurePhantomListeners will attach native provider listeners once
    // and dispatch SOLANA_WALLET_EVENT on changes so this recompute runs.
    getStoredSolanaWallet();

    return () => {
      cancelled = true;
      window.removeEventListener(SOLANA_WALLET_EVENT, recompute as EventListener);
      window.removeEventListener("focus", recompute);
    };
  }, [account]);

  // Prefer Solana whenever a Phantom key is present.
  // Only fall back to EVM when there is no active Solana wallet.
  const displayedAccount = solanaAccount || account;
  const hasActiveWallet = Boolean(displayedAccount || isConnected);
  const shortAddress = useMemo(() => {
    if (!displayedAccount) return "";
    return displayedAccount.length > 10
      ? `${displayedAccount.slice(0, 6)}...${displayedAccount.slice(-4)}`
      : displayedAccount;
  }, [displayedAccount]);

  const walletLabel = solanaAccount ? "SOL" : account ? "EVM" : "";

  const handleConnect = async (type: WalletType) => {
    try {
      await connect(type);
      // If no Solana is active, mark EVM as the displayed type immediately.
      if (!solanaAccount) {
        setActiveWalletType("evm");
      }
      setIsOpen(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to connect wallet");
    }
  };

  const handleSolanaConnect = async () => {
    setConnectingSolana(true);
    try {
      const publicKey = await connectSolanaWallet();
      setSolanaAccount(publicKey);
      setActiveWalletType("solana");
      setIsOpen(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to connect Phantom");
    } finally {
      setConnectingSolana(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      // If Solana is (or was) the active displayed wallet, disconnect it first.
      // The direct listeners + recompute will also react to the provider 'disconnect'.
      if (solanaAccount) {
        await disconnectSolanaWallet();
        setSolanaAccount("");
        setActiveWalletType(evmAccountRef.current ? "evm" : null);
      }
      // Only disconnect EVM if we are currently not showing a Solana address.
      if (!solanaAccount && isConnected) {
        await disconnect();
        setActiveWalletType(null);
      }
    } finally {
      setShowDropdown(false);
    }
  };

  if (hasActiveWallet) {
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
          {walletLabel && (
            <span className="ml-1 rounded border border-white/25 bg-white/5 px-1 py-px text-[9px] font-mono tracking-[0.5px] opacity-80">
              {walletLabel}
            </span>
          )}
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
              Select the wallet you want to use. BNB wallets use the existing deploy flow; Phantom creates Solana drafts while Solana deployment is locked.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleConnect("metamask")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">MetaMask</p>
                  <p className="text-[11px] text-muted-foreground">
                    Browser wallet (Rabby etc.) on BSC
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>EVM</span>
                  <Check className="h-3 w-3 opacity-60" />
                </div>
              </button>

              <button
                onClick={() => handleConnect("binance")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Binance Wallet</p>
                  <p className="text-[11px] text-muted-foreground">
                    Official Binance extension for BSC
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>BSC</span>
                  <Check className="h-3 w-3 opacity-60" />
                </div>
              </button>

              <button
                onClick={() => handleConnect("injected")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Other EVM wallet</p>
                  <p className="text-[11px] text-muted-foreground">
                    Any injected BSC-compatible wallet
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>EVM</span>
                </div>
              </button>

              <button
                onClick={handleSolanaConnect}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Phantom</p>
                  <p className="text-[11px] text-muted-foreground">
                    Solana draft creation and promotion signing
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>SOL</span>
                  <Check className="h-3 w-3 opacity-60" />
                </div>
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground mt-2">
              Solana deployment remains locked until launch tooling is ready. Drafts and promotion pages are available now.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
