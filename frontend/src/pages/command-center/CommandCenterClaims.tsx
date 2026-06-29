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

export default function CommandCenterClaims() {
  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Rewards / Claims"
        description="Native recruiter reward controls for BNB and Solana. Legacy reward views are disabled here until the unified ledger is ready."
      />

      <RecruiterNativePayoutsPanel />

      <div className="grid gap-4 md:grid-cols-3">
        <CommandCenterCard title="Native rewards" description="Recruiter rewards stay in their native chain currency.">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm text-muted-foreground">
              BNB rewards are shown as BNB and Solana rewards are shown as SOL. The panel above is the current source of truth for recruiter rewards.
            </p>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Claim creation" description="Claims lock the matched ledger rows.">
          <div className="flex items-start gap-3">
            <Trophy className="mt-1 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm text-muted-foreground">
              When claimable rewards exist and a wallet is verified, creating a claim records the request and moves those entries into processing.
            </p>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Processing phase" description="Final settlement comes after signer wiring.">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-1 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm text-muted-foreground">
              Final settlement remains pending until the signer flow is connected.
            </p>
          </div>
        </CommandCenterCard>
      </div>

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
