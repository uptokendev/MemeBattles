import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { ProfileRecruiterPanel } from "@/components/profile/ProfileRecruiterPanel";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { fetchRecruiterSignupStatus, type RecruiterSignupStatus } from "@/lib/recruiterApi";

const benefits = [
  "Your own recruiter code and referral link",
  "Public recruiter profile and leaderboard visibility",
  "Track the creators and traders who join through your link",
  "Weekly recruiter rewards",
  "Claimable recruiter rewards through your creator dashboard",
  "Grow your squad as more creators and traders join",
];

const programSteps = [
  "Apply with your connected wallet",
  "Choose your recruiter code",
  "Share your recruiter link",
  "Grow creators, traders, and squads",
  "Track rewards inside your creator dashboard",
];

export default function CommandCenterRecruiter() {
  const { walletAddress } = useCommandCenterData();
  const wallet = useWallet();
  const { solanaAccount, isSolanaConnected } = useSolanaWallet();
  const activeWallet = wallet.account || (isSolanaConnected ? solanaAccount : walletAddress) || walletAddress;
  const isConnected = Boolean(wallet.isConnected || wallet.account || isSolanaConnected || solanaAccount);

  const [status, setStatus] = useState<RecruiterSignupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeWallet) {
      setStatus(null);
      return;
    }

    setLoadingStatus(true);
    setStatusError(null);
    void fetchRecruiterSignupStatus(activeWallet)
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch((err: any) => {
        if (!cancelled) setStatusError(String(err?.message || err || "Could not load recruiter status."));
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWallet]);

  const recruiter = status?.recruiter ?? null;
  const isRecruiter = Boolean(status?.isRecruiter && recruiter);

  if (loadingStatus) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter" description="Loading recruiter status for this wallet." />
        <CommandCenterCard title="Recruiter status" description="Checking whether this wallet already has a recruiter account.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-6 text-sm text-muted-foreground">
            Loading recruiter program state...
          </div>
        </CommandCenterCard>
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter" description="Recruiter status could not be loaded." />
        <CommandCenterCard title="Recruiter status unavailable" description="Try again after refreshing.">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-sm text-rose-100">
            {statusError}
          </div>
        </CommandCenterCard>
      </div>
    );
  }

  if (isRecruiter) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader
          title="Recruiter Management"
          description="Your recruiter wallet is active. Manage your code, public recruiter profile, squad, and rewards here."
        >
          <Button asChild variant="outline" className="font-retro">
            <Link to="/recruiters">
              Public leaderboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CommandCenterPageHeader>
        <ProfileRecruiterPanel account={activeWallet} isConnected={isConnected} isOwnProfile={true} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Recruiter Program"
        description="This wallet is not a recruiter yet. Learn how the program works and apply from here."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="font-retro">
            <Link to="/recruiters">
              Public leaderboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild className="font-retro">
            <Link to="/recruiter/signup">Sign up</Link>
          </Button>
        </div>
      </CommandCenterPageHeader>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <CommandCenterCard
          title="Become a MemeWarzone Recruiter"
          description="Recruiters help grow the arena by bringing in creators, traders, and squads. When linked users trade or graduate campaigns, recruiters can earn weekly rewards."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div key={benefit} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
                {benefit}
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-accent" />
              <div>
                <div className="font-retro text-sm text-foreground">Program rule</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your recruiter link is tracked automatically. When creators and traders join through you, MemeWarzone keeps the squad and reward records updated.
                </p>
              </div>
            </div>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="How it works" description="The short path from wallet to recruiter dashboard.">
          <div className="space-y-3">
            {programSteps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 font-retro text-xs text-accent">
                  {index + 1}
                </div>
                <div className="text-sm text-muted-foreground">{step}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="font-retro">
              <Link to="/recruiter/signup">Sign up as recruiter</Link>
            </Button>
            <Button asChild variant="outline" className="font-retro">
              <Link to="/recruiter">Read program page</Link>
            </Button>
          </div>
        </CommandCenterCard>
      </div>
    </div>
  );
}
