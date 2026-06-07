import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet, type WalletType } from "@/contexts/WalletContext";
import { Loader2, ChevronDown, Check } from "lucide-react";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getStoredSolanaWallet,
  SOLANA_WALLET_EVENT,
} from "@/lib/solanaWallet";

export const ConnectWalletButton = () => {
  const { connect, disconnect, isConnected, account, connecting } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [solanaAccount, setSolanaAccount] = useState(() => getStoredSolanaWallet());
  const [connectingSolana, setConnectingSolana] = useState(false);

  useEffect(() => {
    const syncSolana = () => setSolanaAccount(getStoredSolanaWallet());
    syncSolana();
    window.addEventListener(SOLANA_WALLET_EVENT, syncSolana as EventListener);
    window.addEventListener("focus", syncSolana);
    return () => {
      window.removeEventListener(SOLANA_WALLET_EVENT, syncSolana as EventListener);
      window.removeEventListener("focus", syncSolana);
    };
  }, []);

  const activeAccount = solanaAccount || account;
  const hasActiveWallet = Boolean(activeAccount || isConnected);
  const shortAddress = useMemo(() => {
    if (!activeAccount) return "";
    return activeAccount.length > 10 ? `${activeAccount.slice(0, 6)}...${activeAccount.slice(-4)}` : activeAccount;
  }, [activeAccount]);

  const handleConnect = async (type: WalletType) => {
    try {
      await connect(type);
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
      if (solanaAccount) {
        await disconnectSolanaWallet();
        setSolanaAccount("");
      }
      if (isConnected) await disconnect();
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
