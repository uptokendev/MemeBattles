import { Navigate } from "react-router-dom";

import { useWallet } from "@/contexts/WalletContext";

function normalizeWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return null;
  return raw.toLowerCase();
}

type CommandCenterSection =
  | "overview"
  | "recruiter"
  | "squad"
  | "airdrops"
  | "claims"
  | "settings"
  | "followers"
  | "following"
  | "coins"
  | "arena-ops";

type LegacyCommandCenterRedirectProps = {
  section: CommandCenterSection;
};

export function LegacyCommandCenterRedirect({ section }: LegacyCommandCenterRedirectProps) {
  const wallet = useWallet();
  const anyWallet: any = wallet as any;
  const isConnected = Boolean(anyWallet?.isConnected ?? anyWallet?.connected ?? wallet.account);
  const accountWallet = isConnected ? normalizeWallet(wallet.account) : null;

  if (!accountWallet) {
    return <Navigate to="/profile" replace />;
  }

  const suffix = section === "overview" ? "" : `/${section}`;
  return <Navigate to={`/profile/${accountWallet}/command${suffix}`} replace />;
}
