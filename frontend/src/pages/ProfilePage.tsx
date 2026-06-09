import { useMemo } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import PublicProfile from "./PublicProfile";

function isSolanaAddress(raw: string): boolean {
  const s = String(raw || "").trim();
  return s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

function normalizeWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (isSolanaAddress(raw)) return raw; // preserve exact base58 for Solana
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) return raw.toLowerCase();
  return null;
}

function sameWallet(a?: string | null, b?: string | null): boolean {
  const aa = normalizeWallet(a);
  const bb = normalizeWallet(b);
  if (!aa || !bb) return false;
  // For Solana base58, use exact match (case sensitive); for EVM, normalized lower
  if (isSolanaAddress(aa) || isSolanaAddress(bb)) {
    return aa === bb;
  }
  return aa === bb;
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

function ConnectCommandCenterPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="mx-auto flex min-h-[65vh] w-full max-w-3xl items-center justify-center px-4">
      <div className="w-full rounded-3xl border border-border/50 bg-card/40 p-6 text-center shadow-2xl backdrop-blur-md md:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 font-retro text-2xl text-accent">
          CC
        </div>
        <h1 className="font-retro text-2xl text-foreground md:text-4xl">Open your Command Center</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground md:text-base">
          Connect wallet to open your Command Center. Public profiles stay visible to visitors, but owner tools require the connected wallet.
        </p>
        <Button onClick={onConnect} className="mt-6 font-retro">
          Connect wallet
        </Button>
      </div>
    </div>
  );
}

function InvalidPublicProfile({ identifier }: { identifier: string }) {
  return (
    <div className="mx-auto flex min-h-[65vh] w-full max-w-3xl items-center justify-center px-4">
      <div className="w-full rounded-3xl border border-border/50 bg-card/40 p-6 text-center shadow-2xl backdrop-blur-md md:p-10">
        <h1 className="font-retro text-2xl text-foreground md:text-4xl">Profile not found</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground md:text-base">
          We could not resolve <span className="font-mono text-foreground">{identifier}</span> as a public profile yet. Wallet addresses are supported now; handles, usernames, and recruiter codes can be added next.
        </p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { identifier } = useParams<{ identifier?: string }>();
  const [searchParams] = useSearchParams();
  const evmWallet = useWallet();
  const { solanaAccount, isSolanaConnected } = useSolanaWallet();
  const anyWallet: any = evmWallet as any;

  const isConnected = isSolanaConnected || Boolean(anyWallet?.isConnected ?? anyWallet?.connected ?? evmWallet.account);
  const account = isConnected
    ? (isSolanaConnected ? solanaAccount : evmWallet.account ?? null)
    : null;
  const accountWallet = normalizeWallet(account);

  const legacyAddress = searchParams.get("address");
  const explicitIdentifier = identifier ?? legacyAddress;
  const explicitWallet = normalizeWallet(explicitIdentifier);

  const shouldRenderPublicProfile = Boolean(explicitIdentifier);
  const profileWallet = useMemo(() => {
    if (shouldRenderPublicProfile) return explicitWallet;
    return accountWallet;
  }, [accountWallet, explicitWallet, shouldRenderPublicProfile]);

  if (!shouldRenderPublicProfile) {
    if (!accountWallet) {
      return <ConnectCommandCenterPrompt onConnect={() => openWalletModal(anyWallet)} />;
    }

    return <Navigate to={`/profile/${accountWallet}/command`} replace />;
  }

  if (!profileWallet) {
    return <InvalidPublicProfile identifier={String(explicitIdentifier ?? "")} />;
  }

  return (
    <PublicProfile
      profileWallet={profileWallet}
      isOwnProfile={sameWallet(account, profileWallet)}
    />
  );
}
