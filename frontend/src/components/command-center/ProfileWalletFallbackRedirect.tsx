import { Navigate, useParams } from "react-router-dom";
import { normalizeAddress as centralNormalize } from "@/lib/address";

function normalizeWallet(value?: string | null): string | null {
  const n = centralNormalize(value, null as any);
  return n || null;
}

export function ProfileWalletFallbackRedirect() {
  const { wallet } = useParams<{ wallet?: string }>();
  const normalizedWallet = normalizeWallet(wallet);

  if (!normalizedWallet) {
    return <Navigate to="/profile" replace />;
  }

  return <Navigate to={`/profile/${normalizedWallet}/command`} replace />;
}
