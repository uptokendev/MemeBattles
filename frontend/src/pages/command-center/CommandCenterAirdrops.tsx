import { Link } from "react-router-dom";
import { ArrowRight, Gift, Info, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { ProfileAirdropsPanel } from "@/components/profile/ProfileAirdropsPanel";

const rules = [
  "Solo users can qualify",
  "Trader and creator buckets are separate",
  "Reason codes explain ineligibility",
  "Claims stay user-initiated",
  "Anti-abuse thresholds stay private",
  "Published winners remain public",
];

export default function CommandCenterAirdrops() {
  const { walletAddress } = useCommandCenterData();

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Warzone Airdrops"
        description="Track your weekly airdrop eligibility, reason codes, published winners, and claimable airdrop rewards inside Command Center."
      >
        <Button asChild variant="outline" className="font-retro">
          <Link to="/airdrops/winners">
            Public winners
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CommandCenterPageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <CommandCenterCard
          title="Airdrop overview"
          description="Warzone Airdrops are funded from unassigned recruiter and squad slices, with trader and creator buckets shown separately."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {rules.map((rule) => (
              <div key={rule} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
                {rule}
              </div>
            ))}
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Eligibility model" description="The UI exposes broad state and reason codes, not private detection thresholds.">
          <div className="space-y-3">
            <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
              <div className="flex items-start gap-3">
                <Gift className="mt-1 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <div className="font-retro text-sm text-foreground">Trader bucket</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Shows whether this wallet has a latest trader eligibility result and any public reason codes.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="flex items-start gap-3">
                <Trophy className="mt-1 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <div className="font-retro text-sm text-foreground">Creator bucket</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Creator eligibility remains separate from trader eligibility. A wallet can surface in either or both buckets when backend rules allow it.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-1 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <div className="font-retro text-sm text-foreground">Connected wallet</div>
                  <p className="mt-1 break-all text-sm text-muted-foreground">{walletAddress}</p>
                </div>
              </div>
            </div>
          </div>
        </CommandCenterCard>
      </div>

      <ProfileAirdropsPanel account={walletAddress} isConnected={true} isOwnProfile={true} />
    </div>
  );
}
