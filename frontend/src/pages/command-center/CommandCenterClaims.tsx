import { Clock3, ShieldCheck, Trophy } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { RecruiterNativePayoutsPanel } from "@/components/command-center/RecruiterNativePayoutsPanel";

const claimStates = [
  "Missing payout wallet",
  "Pending finality",
  "Claimable",
  "Claim created",
  "Submitted",
  "Confirmed",
  "Failed / retriable",
  "Manual review",
];

const baselineClaimCards = [
  {
    title: "League Rewards",
    state: "Visible",
    body: "League rewards remain visible for connected wallets and use the normal claim path when a reward becomes claimable.",
  },
  {
    title: "Airdrop Rewards",
    state: "Visible",
    body: "Warzone Airdrops stay available even when the wallet is not attached to a recruiter squad.",
  },
  {
    title: "Squad Rewards",
    state: "Locked when solo",
    body: "Squad rewards unlock once this wallet joins a recruiter squad. Solo reward flow can still continue through Airdrops.",
  },
];

export default function CommandCenterClaims() {
  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Rewards / Claims"
        description="League, Airdrop, Squad, and recruiter-native reward states stay separated so users only see claim controls they are eligible to use."
      />

      <CommandCenterCard
        title="Reward surfaces"
        description="Baseline reward cards stay visible. Locked states explain what is missing without exposing ineligible claim buttons."
        action={<ShieldCheck className="h-5 w-5 text-accent" />}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {baselineClaimCards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-retro text-sm text-foreground">{card.title}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{card.body}</p>
                </div>
                <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-accent">
                  {card.state}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CommandCenterCard>

      <RecruiterNativePayoutsPanel />

      <CommandCenterCard
        title="Claim-state guide"
        description="Reward states explain what is ready, pending, already recorded, or waiting for another step."
        action={<Clock3 className="h-5 w-5 text-accent" />}
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {claimStates.map((state) => (
            <div key={state} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
              <Trophy className="mb-2 h-4 w-4 text-accent" />
              {state}
            </div>
          ))}
        </div>
      </CommandCenterCard>
    </div>
  );
}
