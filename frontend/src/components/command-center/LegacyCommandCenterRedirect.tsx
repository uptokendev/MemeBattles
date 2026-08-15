import { Navigate } from "react-router-dom";

import { useWallet } from "@/contexts/WalletContext";
import { useActiveFeedWallet } from "@/hooks/useActiveFeedWallet";
import { normalizeRouteWallet } from "@/lib/address";

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
  const feedWallet = useActiveFeedWallet();
  const accountWallet = normalizeRouteWallet(feedWallet.address || evmWallet.account);

  if (!accountWallet) {
    return <Navigate to="/profile" replace />;
  }

  const suffix = section === "overview" ? "" : `/${section}`;
  return <Navigate to={`/profile/${accountWallet}/command${suffix}`} replace />;
}
