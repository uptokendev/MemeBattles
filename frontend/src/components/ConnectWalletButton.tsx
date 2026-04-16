import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet, type WalletType } from "@/contexts/WalletContext";
import { Loader2, ChevronDown, Check } from "lucide-react";

export const ConnectWalletButton = () => {
  const { connect, disconnect, isConnected, account, connecting } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false); // <- NEW

  const shortAddress =
    account && account.length > 10
      ? `${account.slice(0, 6)}...${account.slice(-4)}`
      : account;

  const handleConnect = async (type: WalletType) => {
    try {
      await connect(type);
      setIsOpen(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to connect wallet");
    }
  };

  if (isConnected) {
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
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
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
        disabled={connecting}
        className="font-retro text-xs md:text-sm rounded-full px-3 md:px-4 py-1 h-auto flex items-center gap-1"
      >
        {connecting ? (
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
              Select a BSC-compatible EVM wallet. You can switch between
              testnet and mainnet from your wallet settings.
            </p>

            <div className="space-y-2">
              {/* MetaMask / Rabby / browser wallet */}
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

              {/* Binance Wallet */}
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

              {/* Generic injected fallback */}
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
              </button>

              {/* If later you add WalletConnect, you can add a fourth option here */}
              {/* <button ...>WalletConnect (mobile)</button> */}
            </div>

            <p className="text-[10px] text-muted-foreground mt-2">
              Make sure your selected wallet is configured for Binance Smart
              Chain (BSC mainnet or testnet, depending on your setup).
            </p>
          </div>
        </div>
      )}
    </>
  );
};
