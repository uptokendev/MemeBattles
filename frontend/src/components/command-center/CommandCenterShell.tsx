import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { CommandCenterLayout } from "@/components/command-center/CommandCenterLayout";

function normalizeWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return null;
  return raw.toLowerCase();
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

function WrongWallet({ requestedWallet, connectedWallet }: { requestedWallet: string; connectedWallet: string }) {
  return (
    <div className="mx-auto flex min-h-[65vh] w-full max-w-3xl items-center justify-center px-4">
      <div className="w-full rounded-3xl border border-destructive/35 bg-card/40 p-6 text-center shadow-2xl backdrop-blur-md md:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/40 bg-destructive/10 font-retro text-2xl text-destructive">
          !
        </div>
        <h1 className="font-retro text-2xl text-foreground md:text-4xl">Wrong wallet</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground md:text-base">
          This Command Center belongs to another wallet. Public profiles stay visible, but private dashboard data requires the matching connected wallet.
        </p>
        <div className="mt-5 space-y-2 rounded-2xl border border-border/50 bg-background/30 p-4 text-left text-xs text-muted-foreground">
          <div><span className="text-foreground">Requested:</span> <span className="font-mono">{requestedWallet}</span></div>
          <div><span className="text-foreground">Connected:</span> <span className="font-mono">{connectedWallet}</span></div>
        </div>
      </div>
    </div>
  );
}

type CommandCenterShellProps = {
  children: ReactNode;
};

export function CommandCenterShell({ children }: CommandCenterShellProps) {
  const { wallet: walletParam } = useParams<{ wallet?: string }>();
  const wallet = useWallet();
  const anyWallet: any = wallet as any;

  const connectedWallet = normalizeWallet(wallet.account);
  const requestedWallet = normalizeWallet(walletParam);

  if (!requestedWallet) return <Navigate to="/profile" replace />;

  if (!connectedWallet) {
    return <ConnectRequired onConnect={() => openWalletModal(anyWallet)} />;
  }

  if (connectedWallet !== requestedWallet) {
    return <WrongWallet requestedWallet={requestedWallet} connectedWallet={connectedWallet} />;
  }

  return (
    <CommandCenterLayout walletAddress={requestedWallet} basePath={`/profile/${requestedWallet}/command`}>
      {children}
    </CommandCenterLayout>
  );
}
