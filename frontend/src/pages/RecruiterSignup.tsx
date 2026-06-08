import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWallet } from "@/contexts/WalletContext";

export default function RecruiterSignup() {
  const wallet = useWallet();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-8">
      <Card className="overflow-hidden border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(240,106,26,0.16),transparent_36%),linear-gradient(180deg,rgba(18,22,28,0.94),rgba(9,12,16,0.98))] p-6 md:p-8">
        <div className="max-w-3xl space-y-4">
          <p className="font-retro text-xs uppercase tracking-[0.24em] text-amber-100/70">Recruiter signup</p>
          <h1 className="font-retro text-3xl text-foreground md:text-5xl">Recruiter applications moved into Command Center.</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            The old standalone signup flow has been retired. Wallet sign-in, the recruiter form, approval state, and
            your future referral tools now live under the recruiter panel in Command Center.
          </p>
        </div>
      </Card>

      <Card className="border-border/60 bg-card/65 p-6">
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="text-sm text-muted-foreground">
              Use the wallet that should own the recruiter profile. That same wallet is what the admin team approves and what receives the referral link.
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {wallet.isConnected ? (
            <Button asChild className="font-retro">
              <Link to="/command/recruiter">
                Open recruiter panel
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <ConnectWalletButton />
          )}
          <Button asChild variant="outline" className="font-retro">
            <Link to="/recruiter">Back to recruiter overview</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}