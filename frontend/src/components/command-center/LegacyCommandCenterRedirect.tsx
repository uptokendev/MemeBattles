import { Navigate, useLocation } from "react-router-dom";

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
  | "coins"
  | "support"
  | "support/report"
  | "support/reports";

type LegacyCommandCenterRedirectProps = {
  section: CommandCenterSection;
};

export function LegacyCommandCenterRedirect({ section }: LegacyCommandCenterRedirectProps) {
  const evmWallet = useWallet();
  const feedWallet = useActiveFeedWallet();
  const location = useLocation();
  const accountWallet = normalizeRouteWallet(feedWallet.address || evmWallet.account);

  if (!accountWallet) {
    return <Navigate to="/profile" replace />;
  }

  const suffix = section === "overview" ? "" : `/${section}`;
  return <Navigate to={`/profile/${accountWallet}/command${suffix}${location.search}`} replace />;
}
