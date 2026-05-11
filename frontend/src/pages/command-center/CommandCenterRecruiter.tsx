import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Copy, ExternalLink, Gift, Link2, ShieldCheck, Trophy, Users, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { ProfileRecruiterPanel } from "@/components/profile/ProfileRecruiterPanel";
import { fetchRecruiterSignupStatus, type RecruiterSignupStatus } from "@/lib/recruiterApi";

const benefits = [
  "Your own recruiter code and referral link",
  "Public recruiter profile and leaderboard visibility",
  "Linked creator and trader attribution",
  "Weekly recruiter reward accounting",
  "Claimable recruiter rewards through Command Center",
  "Squad-growth path when your network becomes active",
];

const programSteps = [
  "Apply with your connected wallet",
  "Choose your recruiter code",
  "Share your recruiter link",
  "Grow creators, traders, and squads",
  "Track rewards inside Command Center",
];

function shortAddress(value?: string | null) {
  const raw = String(value || "");
  return raw.length > 10 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw;
}

export default function CommandCenterRecruiter() {
  const { walletAddress } = useCommandCenterData();
  const [status, setStatus] = useState<RecruiterSignupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingStatus(true);
    setStatusError(null);

    void fetchRecruiterSignupStatus(walletAddress)
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
  }, [walletAddress]);

  const recruiter = status?.recruiter ?? null;
  const isRecruiter = Boolean(status?.isRecruiter && recruiter);

  const recruiterLink = useMemo(() => {
    const code = recruiter?.code || walletAddress.slice(2, 8).toLowerCase();
    return typeof window !== "undefined"
      ? `${window.location.origin}/r/${encodeURIComponent(code)}`
      : `/r/${encodeURIComponent(code)}`;
  }, [recruiter?.code, walletAddress]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  if (loadingStatus) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader
          title="Recruiter"
          description="Loading recruiter status for this wallet."
        />
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
        <CommandCenterPageHeader
          title="Recruiter"
          description="Recruiter status could not be loaded."
        />
        <CommandCenterCard title="Recruiter status unavailable" description="Try again after refreshing or checking the backend API.">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-sm text-rose-100">
            {statusError}
          </div>
        </CommandCenterCard>
      </div>
    );
  }

  if (!isRecruiter) {
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
                    Recruiter routing, attribution locks, claim accounting, eligibility, and anti-abuse controls stay backend controlled. The Command Center displays only safe wallet-specific state.
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

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Recruiter Management"
        description="Manage your recruiter link, public recruiter profile, reward flow, and account actions from Command Center."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="font-retro">
            <Link to="/recruiters">
              Public leaderboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild className="font-retro">
            <Link to={`/recruiters/${encodeURIComponent(recruiter.code)}`}>Public page</Link>
          </Button>
        </div>
      </CommandCenterPageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <CommandCenterCard title="Recruiter account" description="Your active recruiter identity and public referral link.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Code</div>
              <div className="mt-2 font-retro text-2xl text-foreground">{recruiter.code}</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Status</div>
              <div className="mt-2 font-retro text-2xl capitalize text-foreground">{recruiter.status}</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Linked wallets</div>
              <div className="mt-2 font-retro text-2xl text-foreground">{recruiter.linkedWalletCount.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Wallet</div>
              <div className="mt-2 font-retro text-2xl text-foreground">{shortAddress(walletAddress)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-border/50 bg-background/25 p-4">
            <div className="font-retro text-sm text-foreground">Referral link</div>
            <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{recruiterLink}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => copyText(recruiterLink, "Referral link")} variant="outline" className="font-retro">
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </Button>
              <Button onClick={() => copyText(recruiter.code, "Recruiter code")} variant="outline" className="font-retro">
                <Copy className="mr-2 h-4 w-4" />
                Copy code
              </Button>
            </div>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Management actions" description="Quick actions for your recruiter account. Backend-only mutations can be added here later.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro">
              <Link to={`/recruiters/${encodeURIComponent(recruiter.code)}`}>
                <ExternalLink className="mr-3 h-4 w-4" />
                Public recruiter page
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro">
              <Link to="/command/claims">
                <Gift className="mr-3 h-4 w-4" />
                Rewards / Claims
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro">
              <Link to="/command/squad">
                <Users className="mr-3 h-4 w-4" />
                Squad tools
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro">
              <Link to="/command/settings">
                <WalletCards className="mr-3 h-4 w-4" />
                Wallet settings
              </Link>
            </Button>
            <Button onClick={() => copyText(recruiterLink, "Referral link")} variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro">
              <Link2 className="mr-3 h-4 w-4" />
              Copy referral link
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro">
              <Link to="/recruiters">
                <Trophy className="mr-3 h-4 w-4" />
                Leaderboard
              </Link>
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-sm text-muted-foreground">
            Account edits such as code changes, payout wallet changes, pausing, or closing recruiter status should be added only when matching backend endpoints exist.
          </div>
        </CommandCenterCard>
      </div>

      <ProfileRecruiterPanel account={walletAddress} isConnected={true} isOwnProfile={true} />
    </div>
  );
}
