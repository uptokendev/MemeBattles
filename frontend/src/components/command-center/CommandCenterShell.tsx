import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { CommandCenterLayout } from "@/components/command-center/CommandCenterLayout";

function normalizeWallet(value?: string | null): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  // EVM address (0x + 40 hex chars)
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return v.toLowerCase();
  // Solana address (base58, 32-44 chars, no 0x prefix)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return v;
  return null;
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
    "arena-ops",
    "security",
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
          The creator dashboard is private. Connect the owner wallet to open your tools.
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
  const wallet = useWallet();
  const { solanaAccount, isSolanaConnected } = useSolanaWallet();
  const anyWallet: any = wallet as any;

  const connectedWallet = isSolanaConnected && solanaAccount
    ? normalizeWallet(solanaAccount)
    : normalizeWallet(wallet.account);
  const requestedWallet = normalizeWallet(walletParam);

  if (!requestedWallet) return <Navigate to="/profile" replace />;

  if (!connectedWallet) {
    return <ConnectRequired onConnect={() => openWalletModal(anyWallet)} />;
  }

  if (connectedWallet !== requestedWallet) {
    const section = getCommandSection(location.pathname);
    return <Navigate to={`/profile/${connectedWallet}/command${section}`} replace />;
  }

  return (
    <CommandCenterLayout walletAddress={requestedWallet} basePath={`/profile/${requestedWallet}/command`}>
      {children}
    </CommandCenterLayout>
  );
}
