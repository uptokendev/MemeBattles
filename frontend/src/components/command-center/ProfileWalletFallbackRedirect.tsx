import { Navigate, useParams } from "react-router-dom";
import { normalizeRouteWallet } from "@/lib/address";

export function ProfileWalletFallbackRedirect() {
  const { wallet } = useParams<{ wallet?: string }>();
  const normalizedWallet = normalizeRouteWallet(wallet);

  if (!normalizedWallet) {
    return <Navigate to="/profile" replace />;
  }

  return <Navigate to={`/profile/${normalizedWallet}/command`} replace />;
}
