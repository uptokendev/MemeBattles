import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { CommandCenterLayout } from "@/components/command-center/CommandCenterLayout";
import { normalizeAddress as centralNormalize } from "@/lib/address";
import { isSupportedChainId, getChainLabel, getSupportedChainsLabel } from "@/lib/chainConfig";

function normalizeWallet(value?: string | null): string | null {
  const n = centralNormalize(value, /* chain unknown here, rely on isSolanaAddress heuristic inside central */ null as any);
  if (!n) return null;
  // central returns raw for sol or lower for evm; for shell redirect matching we accept either form
  return n;
}

function openWalletModal(wallet: any) {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
      return;
    }
  } catch {}

  if (typeof wallet?.connect === "function") return wallet.connect();
  if (typeof wallet?.openConnectModal === "function") return wallet.openConnectModal();
}

function getCommandSection(pathname: string): string {
  const marker = "/command";
  const index = pathname.indexOf(marker);
  if (index < 0) return "";

  const suffix = pathname.slice(index + marker.length).split("/").filter(Boolean)[0] || "";
  const allowed = new Set([
    "overview",
    "recruiter",
    "squad",
    "airdrops",
    "claims",
    "settings",
    "followers",
    "following",
    "coins",
  ]);
  return allowed.has(suffix) ? `/${suffix}` : "";
}

function ConnectRequired({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="mx-auto flex min-h-[65vh] w-full max-w-3xl items-center justify-center px-4">
      <div className="w-full rounded-3xl border border-border/50 bg-card/40 p-6 text-center shadow-2xl backdrop-blur-md md:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 font-retro text-2xl text-accent">
          CC
        </div>
        <h1 className="font-retro text-2xl text-foreground md:text-4xl">Connect wallet</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground md:text-base">
          The Command Center is private. Connect the owner wallet to open dashboard tools.
        </p>
        <Button onClick={onConnect} className="mt-6 font-retro">
          Connect wallet
        </Button>
      </div>
    </div>
  );
}

type CommandCenterShellProps = {
  children: ReactNode;
};

export function CommandCenterShell({ children }: CommandCenterShellProps) {
  const { wallet: walletParam } = useParams<{ wallet?: string }>();
  const location = useLocation();
  const evmWallet = useWallet();
  const { solanaAccount, isSolanaConnected } = useSolanaWallet();
  const anyWallet: any = evmWallet as any;

  // Prefer Solana (Phantom) if connected, matching TopBar / Create behavior.
  // normalizeWallet now accepts base58 (exact case) or 0x (lowercased).
  const connectedWallet = isSolanaConnected && solanaAccount
    ? normalizeWallet(solanaAccount)
    : normalizeWallet(evmWallet.account);
  const requestedWallet = normalizeWallet(walletParam);

  if (!requestedWallet) return <Navigate to="/profile" replace />;

  if (!connectedWallet) {
    return <ConnectRequired onConnect={() => openWalletModal(anyWallet)} />;
  }

  if (connectedWallet !== requestedWallet) {
    const section = getCommandSection(location.pathname);
    return <Navigate to={`/profile/${connectedWallet}/command${section}`} replace />;
  }

  // === NEW: Hard frontend-wide chain gate for Command Center ===
  // Even if address matches, if the connected wallet is on a non-supported chain we MUST NOT
  // render the Layout + DataProvider (which would load partial/broken data with getActiveChainId fallback).
  const rawChain = isSolanaConnected ? 101 : (anyWallet?.chainId ?? anyWallet?.network?.chainId);
  if (!isSupportedChainId(rawChain)) {
    const chainLabel = getChainLabel(rawChain) || `Chain ${rawChain ?? "unknown"}`;
    return (
      <div className="mx-auto flex min-h-[65vh] w-full max-w-3xl items-center justify-center px-4">
        <div className="w-full rounded-3xl border border-destructive/40 bg-card/70 p-6 text-center shadow-2xl backdrop-blur-md md:p-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 font-retro text-2xl text-destructive">
            !
          </div>
          <h1 className="font-retro text-2xl text-foreground md:text-4xl">Unsupported chain in Command Center</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground md:text-base">
            You are connected on <span className="font-medium text-foreground">{chainLabel}</span>.
            Command Center (and all owner tools) are only available on {getSupportedChainsLabel()}.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => openWalletModal(anyWallet)} className="font-retro">
              Open wallet selector
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // Let the global UnsupportedChainGuard handle the prominent actions (switch/disconnect/Phantom).
                // We just close/reopen modal as a convenience.
                openWalletModal(isSolanaConnected ? "solana" : "evm");
              }}
              className="font-retro"
            >
              Switch or connect supported wallet
            </Button>
          </div>
          <p className="mt-4 text-[10px] text-muted-foreground">
            A full-screen notice is also shown app-wide while you are on an unsupported network.
          </p>
        </div>
      </div>
    );
  }

  return (
    <CommandCenterLayout walletAddress={requestedWallet} basePath={`/profile/${requestedWallet}/command`}>
      {children}
    </CommandCenterLayout>
  );
}
