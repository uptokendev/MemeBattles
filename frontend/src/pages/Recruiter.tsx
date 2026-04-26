import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useWallet } from "@/contexts/WalletContext";
import { fetchRecruiterSignupStatus, type RecruiterSignupStatus } from "@/lib/recruiterApi";

export default function Recruiter() {
  const wallet = useWallet();
  const account = wallet.account || "";
  const [status, setStatus] = useState<RecruiterSignupStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!account) {
      setStatus(null);
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        const next = await fetchRecruiterSignupStatus(account).catch(() => null);
        if (!cancelled) setStatus(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-8">
      <Card className="overflow-hidden border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(240,106,26,0.18),transparent_38%),linear-gradient(180deg,rgba(18,22,28,0.94),rgba(9,12,16,0.98))] p-6 md:p-8">
        <div className="max-w-3xl space-y-4">
          <p className="font-retro text-xs uppercase tracking-[0.24em] text-amber-100/70">Recruiter Program</p>
          <h1 className="font-retro text-3xl text-foreground md:text-5xl">Build your squad before the battlefield opens.</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Recruiters get a public profile, routed rewards, squad visibility, and a dedicated profile dashboard. This route is the entry point for wallets that want to participate in the recruiter program.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60 bg-card/70 p-5">
          <Users className="h-5 w-5 text-amber-200" />
          <h2 className="mt-4 font-retro text-xl text-foreground">Grow your network</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Recruit creators and traders into your orbit and route them into a squad-linked incentive flow.
          </p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <ShieldCheck className="h-5 w-5 text-sky-200" />
          <h2 className="mt-4 font-retro text-xl text-foreground">Track rewards</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pending, claimable, claimed, and historical recruiter rewards are all surfaced from the same reward ledger.
          </p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <ArrowRight className="h-5 w-5 text-emerald-200" />
          <h2 className="mt-4 font-retro text-xl text-foreground">Stay public</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Leaderboard placement, public recruiter profiles, and referral links remain visible even while personal controls move into Profile.
          </p>
        </Card>
      </div>

      {!wallet.isConnected || !account ? (
        <Card className="border-border/60 bg-card/65 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Wallet required</p>
              <h2 className="mt-2 font-retro text-2xl text-foreground">Connect to continue into recruiter setup.</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                The dedicated signup flow is the next frontend batch. This route already gives us a clean recruiter CTA target instead of a dead link.
              </p>
            </div>
            <ConnectWalletButton />
          </div>
        </Card>
      ) : loading ? (
        <Card className="border-border/60 bg-card/65 px-6 py-12 text-center text-sm text-muted-foreground">
          Checking recruiter wallet status...
        </Card>
      ) : status?.isRecruiter && status.recruiter ? (
        <Card className="border-border/60 bg-card/65 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Existing recruiter</p>
              <h2 className="mt-2 font-retro text-2xl text-foreground">{status.recruiter.displayName || status.recruiter.code}</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                This wallet already owns recruiter code <span className="text-foreground">{status.recruiter.code}</span>. Continue in your Profile recruiter tab.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="font-retro">
                <Link to="/profile?tab=recruiter">Open recruiter dashboard</Link>
              </Button>
              <Button asChild variant="outline" className="font-retro">
                <Link to={`/recruiters/${encodeURIComponent(status.recruiter.code)}`}>Public profile</Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="border-border/60 bg-card/65 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Recruiter signup</p>
              <h2 className="mt-2 font-retro text-2xl text-foreground">This wallet is not a recruiter yet.</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Continue into the wallet-first signup flow to reserve a recruiter code, provide your contact details, and sign the submission payload.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="font-retro">
                <Link to="/recruiter/signup">Start recruiter signup</Link>
              </Button>
              <Button asChild variant="outline" className="font-retro">
                <Link to="/recruiters">Browse public recruiters</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
