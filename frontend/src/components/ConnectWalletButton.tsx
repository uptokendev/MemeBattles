import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet, type WalletType } from "@/contexts/WalletContext";
import { Loader2, ChevronDown, Check, X } from "lucide-react";

export const ConnectWalletButton = () => {
  const { connect, disconnect, isConnected, account, connecting } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const shortAddress =
    account && account.length > 10
      ? `${account.slice(0, 6)}...${account.slice(-4)}`
      : account;

  useEffect(() => {
    if (!showDropdown) return;

    const onPointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (target && dropdownRef.current?.contains(target)) return;
      setShowDropdown(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showDropdown]);

  const handleConnect = async (type: WalletType) => {
    try {
      await connect(type);
      setIsOpen(false);
      setShowDropdown(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to connect wallet");
    }
  };

  const openWalletSelector = () => {
    setShowDropdown(false);
    setIsOpen(true);
  };

  if (isConnected) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDropdown((value) => !value)}
          className="font-mono text-xs md:text-sm rounded-full px-3 md:px-4 py-1 h-auto flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {shortAddress}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-background shadow-xl z-50 overflow-hidden">
            <button
              type="button"
              className="w-full text-left text-xs px-3 py-2 hover:bg-muted"
              onClick={() => {
                disconnect();
                openWalletSelector();
              }}
            >
              Change wallet
            </button>
            <button
              type="button"
              className="w-full text-left text-xs px-3 py-2 text-red-400 hover:bg-muted"
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
        type="button"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
          <div
            className="bg-background border border-border rounded-2xl shadow-xl w-[90%] max-w-sm p-4 md:p-6 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm md:text-base font-retro">Connect a wallet</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Close wallet selector"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-2">
              Select the wallet extension you actually want to use. If you switch accounts inside MetaMask, the frontend will now refresh the active account automatically.
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleConnect("metamask")}
                disabled={connecting}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left disabled:opacity-60"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">MetaMask / Rabby</p>
                  <p className="text-[11px] text-muted-foreground">Browser wallet on BSC</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>EVM</span>
                  <Check className="h-3 w-3 opacity-60" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleConnect("binance")}
                disabled={connecting}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left disabled:opacity-60"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Binance Wallet</p>
                  <p className="text-[11px] text-muted-foreground">Official Binance extension for BSC</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>BSC</span>
                  <Check className="h-3 w-3 opacity-60" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleConnect("injected")}
                disabled={connecting}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left disabled:opacity-60"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Other EVM wallet</p>
                  <p className="text-[11px] text-muted-foreground">Any injected BSC-compatible wallet</p>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground mt-2">
              Local disconnect now clears the frontend wallet session and War Room session, so reconnecting does not reuse stale chat or wallet state.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
