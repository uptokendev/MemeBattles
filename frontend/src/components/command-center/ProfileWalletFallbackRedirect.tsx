import { Navigate, useParams } from "react-router-dom";

function normalizeWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return null;
  return raw.toLowerCase();
}

export function ProfileWalletFallbackRedirect() {
  const { wallet } = useParams<{ wallet?: string }>();
  const normalizedWallet = normalizeWallet(wallet);

  if (!normalizedWallet) {
    return <Navigate to="/profile" replace />;
  }

  return <Navigate to={`/profile/${normalizedWallet}/command`} replace />;
}
