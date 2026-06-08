import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Users, WalletCards } from "lucide-react";

import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWallet } from "@/contexts/WalletContext";

export default function Recruiter() {
  const wallet = useWallet();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-8">
      <Card className="overflow-hidden border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(240,106,26,0.18),transparent_38%),linear-gradient(180deg,rgba(18,22,28,0.94),rgba(9,12,16,0.98))] p-6 md:p-8">
        <div className="max-w-3xl space-y-4">
          <p className="font-retro text-xs uppercase tracking-[0.24em] text-amber-100/70">Recruiter Program</p>
          <h1 className="font-retro text-3xl text-foreground md:text-5xl">Build your squad before the battlefield opens.</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Operation: Reinforcements now runs through War Missions. Applications, recruiter approval, referral links,
            and tracked recruits all live in the same wallet-based mission flow.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60 bg-card/70 p-5">
          <Users className="h-5 w-5 text-amber-200" />
          <h2 className="mt-4 font-retro text-xl text-foreground">Apply with your wallet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Recruiter access starts from your wallet-owned War Missions profile, not from a disconnected signup form.
          </p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <ShieldCheck className="h-5 w-5 text-sky-200" />
          <h2 className="mt-4 font-retro text-xl text-foreground">Manual approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Applications are reviewed by admin, then the same wallet gets upgraded into a recruiter with a live referral link.
          </p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <WalletCards className="h-5 w-5 text-emerald-200" />
          <h2 className="mt-4 font-retro text-xl text-foreground">Tracked milestones</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Verified recruits count toward the Operation: Reinforcements milestone chain inside the same mission system.
          </p>
        </Card>
      </div>

      {!wallet.isConnected ? (
        <Card className="border-border/60 bg-card/65 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Wallet required</p>
              <h2 className="mt-2 font-retro text-2xl text-foreground">Connect to open the recruiter mission flow.</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Once the wallet is connected, open the recruiter panel in Command Center to sign in, apply, and manage your link later.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ConnectWalletButton />
              <Button asChild variant="outline" className="font-retro">
                <Link to="/recruiters">Browse public recruiters</Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="border-border/60 bg-card/65 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Recruiter application</p>
              <h2 className="mt-2 font-retro text-2xl text-foreground">Open the recruiter panel in Command Center.</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                That panel now handles wallet sign-in, recruiter applications, approval state, referral links, and recruit tracking.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="font-retro">
                <Link to="/command/recruiter">
                  Open recruiter panel
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="font-retro">
                <Link to="/recruiters">Public leaderboard</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}