import { Navigate, useParams } from "react-router-dom";

function isSolanaAddress(raw: string): boolean {
  const s = String(raw || "").trim();
  return s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

function normalizeWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (isSolanaAddress(raw)) return raw; // preserve exact base58 for Solana profiles
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) return raw.toLowerCase();
  return null;
}

export function ProfileWalletFallbackRedirect() {
  const { wallet } = useParams<{ wallet?: string }>();
  const normalizedWallet = normalizeWallet(wallet);

  if (!normalizedWallet) {
    return <Navigate to="/profile" replace />;
  }

  return <Navigate to={`/profile/${normalizedWallet}/command`} replace />;
}
