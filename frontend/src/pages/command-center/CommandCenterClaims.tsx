import { Gift, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { RecruiterNativePayoutsPanel } from "@/components/command-center/RecruiterNativePayoutsPanel";

const rewardCards = [
  {
    title: "League Rewards",
    description: "Rewards earned from weekly or monthly league placements will appear here.",
    icon: Trophy,
    buttonLabel: "Claim League Rewards",
  },
  {
    title: "Airdrop Rewards",
    description: "Airdrop rewards connected to this wallet will appear here.",
    icon: Gift,
    buttonLabel: "Claim Airdrop Rewards",
  },
];

export default function CommandCenterClaims() {
  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Rewards / Claims"
        description="View your available rewards and claim them when they are ready."
      />

      <CommandCenterCard title="Your Rewards" description="League and Airdrop rewards stay visible for every connected wallet.">
        <div className="grid gap-3 md:grid-cols-2">
          {rewardCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-retro text-sm text-foreground">
                      <Icon className="h-4 w-4 text-accent" />
                      {card.title}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
                  </div>
                  <span className="rounded-full border border-border/40 bg-card/25 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    No rewards yet
                  </span>
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-retro text-2xl text-foreground">0</div>
                    <div className="mt-1 text-xs text-muted-foreground">Available to claim</div>
                  </div>
                  <Button disabled className="font-retro">
                    {card.buttonLabel}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CommandCenterCard>

      <RecruiterNativePayoutsPanel />
    </div>
  );
}
