import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import CommandCenter from "./Profile";
import PublicProfile from "./PublicProfile";

function normalizeWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return null;
  return raw.toLowerCase();
}

function sameWallet(a?: string | null, b?: string | null): boolean {
  const aa = normalizeWallet(a);
  const bb = normalizeWallet(b);
  return Boolean(aa && bb && aa === bb);
}

function shortenWallet(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
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

function CommandCenterShell({ walletAddress }: { walletAddress: string }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <section className="rounded-3xl border border-border/50 bg-card/35 p-5 shadow-2xl backdrop-blur-md md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-retro text-[10px] uppercase tracking-[0.18em] text-accent">
              Owner Workspace
            </div>
            <h1 className="font-retro text-2xl text-foreground md:text-4xl">Command Center</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
              Your private operating layer for balances, rewards, coins, drafts, recruiter tools, squad tools, notifications, and settings.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/40 bg-background/30 px-3 py-1 font-mono">
                {shortenWallet(walletAddress)}
              </span>
              <span className="rounded-full border border-border/40 bg-background/30 px-3 py-1">Private owner tools</span>
              <span className="rounded-full border border-border/40 bg-background/30 px-3 py-1">Public profile separated</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <Button
              className="font-retro"
              onClick={() => navigate(`/profile/${encodeURIComponent(walletAddress)}/command`)}
            >
              Open New Command Center
            </Button>
            <Button
              variant="secondary"
              className="font-retro"
              onClick={() => navigate(`/profile/${encodeURIComponent(walletAddress)}`)}
            >
              View Public Profile
            </Button>
            <Button variant="outline" className="font-retro" onClick={() => navigate("/create")}>Create Coin</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => navigate("/recruiter-dashboard")}
          className="rounded-2xl border border-border/50 bg-card/30 p-4 text-left transition hover:border-accent/50 hover:bg-card/45"
        >
          <div className="font-retro text-sm text-foreground">Recruiter Dashboard</div>
          <div className="mt-2 text-xs text-muted-foreground">Open private recruiter tools, claims, and attribution views.</div>
        </button>
        <button
          type="button"
          onClick={() => navigate("/squad-dashboard")}
          className="rounded-2xl border border-border/50 bg-card/30 p-4 text-left transition hover:border-accent/50 hover:bg-card/45"
        >
          <div className="font-retro text-sm text-foreground">Squad Dashboard</div>
          <div className="mt-2 text-xs text-muted-foreground">Open private squad status, member, and reward surfaces.</div>
        </button>
        <button
          type="button"
          onClick={() => navigate("/airdrops")}
          className="rounded-2xl border border-border/50 bg-card/30 p-4 text-left transition hover:border-accent/50 hover:bg-card/45"
        >
          <div className="font-retro text-sm text-foreground">Warzone Airdrops</div>
          <div className="mt-2 text-xs text-muted-foreground">Check public airdrop overview and winner surfaces.</div>
        </button>
      </section>

      <CommandCenter />
    </div>
  );
}

export default function ProfilePage() {
  const { identifier } = useParams<{ identifier?: string }>();
  const [searchParams] = useSearchParams();
  const wallet = useWallet();
  const anyWallet: any = wallet as any;

  const isConnected = Boolean(anyWallet?.isConnected ?? anyWallet?.connected ?? wallet.account);
  const account = isConnected ? wallet.account ?? null : null;
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

    return <CommandCenterShell walletAddress={accountWallet} />;
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
