import { Navigate } from "react-router-dom";

import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { normalizeAddress as centralNormalize } from "@/lib/address";

function normalizeWallet(value?: string | null): string | null {
  const n = centralNormalize(value, null as any);
  return n || null;
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
  | "coins";

type LegacyCommandCenterRedirectProps = {
  section: CommandCenterSection;
};

export function LegacyCommandCenterRedirect({ section }: LegacyCommandCenterRedirectProps) {
  const evmWallet = useWallet();
  const { solanaAccount, isSolanaConnected } = useSolanaWallet();
  const anyWallet: any = evmWallet as any;
  const isConnected = isSolanaConnected || Boolean(anyWallet?.isConnected ?? anyWallet?.connected ?? evmWallet.account);
  const accountWallet = isConnected
    ? (isSolanaConnected && solanaAccount ? normalizeWallet(solanaAccount) : normalizeWallet(evmWallet.account))
    : null;

  if (!accountWallet) {
    return <Navigate to="/profile" replace />;
  }

  const suffix = section === "overview" ? "" : `/${section}`;
  return <Navigate to={`/profile/${accountWallet}/command${suffix}`} replace />;
}
