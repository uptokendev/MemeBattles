import { Navigate, useParams } from "react-router-dom";
import { normalizeAddress } from "@/lib/address";

function normalizeWallet(value?: string | null): string | null {
  const normalized = normalizeAddress(value);
  return normalized || null;
}

export function ProfileWalletFallbackRedirect() {
  const { wallet } = useParams<{ wallet?: string }>();
  const normalizedWallet = normalizeWallet(wallet);

  if (!normalizedWallet) {
    return <Navigate to="/profile" replace />;
  }

  return <Navigate to={`/profile/${normalizedWallet}/command`} replace />;
}
