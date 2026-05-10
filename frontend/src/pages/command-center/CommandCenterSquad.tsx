import { Link } from "react-router-dom";
import { ArrowRight, ShieldAlert, Trophy, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { ProfileSquadPanel } from "@/components/profile/ProfileSquadPanel";

const squadRules = [
  "Squad Pool access requires squad membership",
  "Solo users flow through Warzone Airdrops instead",
  "Member rewards are contribution-based",
  "Exact member score is shown when available",
  "Squad standings stay public",
  "Private attribution details stay dashboard-only",
];

export default function CommandCenterSquad() {
  const { walletAddress } = useCommandCenterData();

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Squad"
        description="Inspect squad status, member score, estimated reward, and public squad standings from inside Command Center."
      >
        <Button asChild variant="outline" className="font-retro">
          <Link to="/squads">
            Public squads
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CommandCenterPageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <CommandCenterCard
          title="Squad status"
          description="This page reads the wallet's current attribution and squad state. If the wallet is solo or detached, the panel below will show the safe fallback state."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {squadRules.map((rule) => (
              <div key={rule} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
                {rule}
              </div>
            ))}
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Reward model" description="Squad Pool is backend-computed; the frontend only displays published wallet and member surfaces.">
          <div className="space-y-3">
            <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
              <div className="flex items-start gap-3">
                <Users className="mt-1 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <div className="font-retro text-sm text-foreground">Member-level score</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The live panel displays exact member score and estimated payout when the backend has a published member row for this wallet.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="flex items-start gap-3">
                <Trophy className="mt-1 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <div className="font-retro text-sm text-foreground">Leaderboard visibility</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Public squad standings stay on the squad leaderboard, while wallet-specific reward state remains inside Command Center.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-amber-100" />
                <div>
                  <div className="font-retro text-sm text-foreground">No frontend reward math</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Caps, redistribution, diminishing returns, and anti-abuse exclusions are not calculated in React.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CommandCenterCard>
      </div>

      <ProfileSquadPanel account={walletAddress} isConnected={true} isOwnProfile={true} />
    </div>
  );
}
