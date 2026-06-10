import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import {
  getChainLabel,
  getSupportedChainsLabel,
  getUnsupportedChainMessage,
  isSupportedChainId,
} from "@/lib/chainConfig";
import { requestWalletChainSwitch } from "@/lib/launchpadReadiness";

function dispatchOpenWalletModal(filter?: "evm" | "solana") {
  try {
    if (typeof window !== "undefined") {
      const detail = filter ? { filter } : undefined;
      window.dispatchEvent(new CustomEvent("memebattles:openWalletModal", { detail }));
    }
  } catch {}
}

export function UnsupportedChainGuard() {
  const evmWallet = useWallet();
  const { isSolanaConnected, solanaAccount, disconnectSolana } = useSolanaWallet();

  const [switching, setSwitching] = useState(false);

  const isEvmConnected = evmWallet.isConnected || !!evmWallet.account;
  const reportedChain = isSolanaConnected ? 101 : evmWallet.chainId;

  const isConnected = isSolanaConnected || isEvmConnected;
  const isSupported = !isConnected || isSupportedChainId(reportedChain);

  if (!isConnected || isSupported) {
    return null;
  }

  // We have a connected wallet on a bad chain (e.g. Trust on 1, or any non-56/101).
  const walletName =
    (evmWallet as any)?.detectedWallets?.find?.((w: any) => w.id === (evmWallet as any).connectingWalletId)?.name ||
    (isSolanaConnected ? "Phantom" : "your wallet");

  const currentLabel = getChainLabel(reportedChain) || `Chain ${reportedChain ?? "unknown"}`;
  const message = getUnsupportedChainMessage(walletName, reportedChain);

  const handleSwitchToBnb = async () => {
    if (!evmWallet.provider) {
      toast.error("No EVM provider available for network switch.");
      return;
    }
    setSwitching(true);
    try {
      await requestWalletChainSwitch(evmWallet.provider, 56);
      toast.success("Switched to BNB Smart Chain. The page will update automatically.");
      // The wallet listeners + guard will re-evaluate and hide this.
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (/user rejected|user denied|4001/i.test(msg)) {
        toast("Switch cancelled by user.");
      } else {
        toast.error(msg || "Failed to switch network. Please switch manually in your wallet to BNB Smart Chain (56).");
      }
    } finally {
      setSwitching(false);
    }
  };

  const handleUsePhantom = () => {
    // Disconnect whatever is currently connected so the user can pick clean.
    if (isEvmConnected) {
      void evmWallet.disconnect().catch(() => {});
    }
    if (isSolanaConnected) {
      void disconnectSolana().catch(() => {});
    }
    // Open the modal filtered to Solana / show Phantom prominently.
    setTimeout(() => dispatchOpenWalletModal("solana"), 50);
  };

  const handleDisconnectAll = async () => {
    try {
      if (isEvmConnected) await evmWallet.disconnect();
      if (isSolanaConnected) await disconnectSolana();
      toast.success("Disconnected. Connect with a supported wallet (BNB 56 or Phantom on 101).");
    } catch {
      // ignore
    }
    // The guard will disappear because isConnected becomes false.
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 p-4 backdrop-blur-xl">
      <div className="w-full max-w-[520px] rounded-3xl border border-destructive/40 bg-card p-6 shadow-2xl md:p-8">
        <div className="mb-4 flex items-center gap-3 text-destructive">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="font-retro text-xl uppercase tracking-[0.08em]">Unsupported Network</div>
            <div className="text-sm text-muted-foreground">Frontend-wide protection active</div>
          </div>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-foreground">
          {message}
        </p>

        <div className="mb-5 rounded-2xl border border-border/60 bg-background/60 p-4 text-xs text-muted-foreground">
          <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-foreground">Currently connected</div>
          <div className="mt-1 font-mono text-sm text-foreground">
            {walletName} · {currentLabel} (chain {reportedChain ?? "?"})
          </div>
          <div className="mt-2 text-[10px]">
            Only <span className="font-medium text-foreground">{getSupportedChainsLabel()}</span> are allowed.
            All other chains will show broken or empty data in Command Center, Create, Prepare, and other surfaces.
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          {isEvmConnected && !isSolanaConnected && (
            <Button
              onClick={handleSwitchToBnb}
              disabled={switching}
              className="w-full font-retro"
            >
              {switching ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Switching...
                </>
              ) : (
                <>Switch this wallet to BNB Smart Chain (56)</>
              )}
            </Button>
          )}

          <Button
            onClick={handleUsePhantom}
            variant="outline"
            className="w-full font-retro"
          >
            Use Phantom for Solana (101) instead
          </Button>

          <Button
            onClick={handleDisconnectAll}
            variant="ghost"
            className="w-full font-retro text-muted-foreground hover:text-foreground"
          >
            Disconnect &amp; choose again
          </Button>
        </div>

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          This notice is shown app-wide until you are on a supported chain.
          You can also switch networks directly inside {walletName}.
        </p>
      </div>
    </div>
  );
}

export default UnsupportedChainGuard;