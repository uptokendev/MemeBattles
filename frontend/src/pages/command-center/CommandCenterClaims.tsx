import { Gift, Trophy, Users, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { RecruiterNativePayoutsPanel } from "@/components/command-center/RecruiterNativePayoutsPanel";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";

type RewardCardState = "claimable" | "pending" | "ineligible" | "locked" | "empty";

type RewardCardConfig = {
  title: string;
  description: string;
  icon: LucideIcon;
  buttonLabel: string;
  amountLabel: string;
  state: RewardCardState;
};

function normalizeSquadState(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function hasActiveSquad(value?: string | null) {
  const state = normalizeSquadState(value);
  return Boolean(state && !["none", "unassigned", "inactive", "left", "removed", "locked"].includes(state));
}

function buildRewardCards(squadState?: string | null): RewardCardConfig[] {
  const inSquad = hasActiveSquad(squadState);

  return [
    {
      title: "League Rewards",
      description: "Rewards earned from weekly or monthly league placements will appear here.",
      icon: Trophy,
      buttonLabel: "Claim League Rewards",
      amountLabel: "0",
      state: "empty",
    },
    {
      title: "Airdrop Rewards",
      description: "Airdrop rewards connected to this wallet will appear here.",
      icon: Gift,
      buttonLabel: "Claim Airdrop Rewards",
      amountLabel: "0",
      state: "empty",
    },
    {
      title: "Squad Rewards",
      description: inSquad
        ? "Squad rewards earned through your recruiter squad will appear here."
        : "Squad rewards unlock once you join a recruiter squad.",
      icon: Users,
      buttonLabel: "Claim Squad Rewards",
      amountLabel: "0",
      state: inSquad ? "empty" : "locked",
    },
  ];
}

function getRewardStateCopy(state: RewardCardState) {
  switch (state) {
    case "claimable":
      return {
        label: "Ready",
        amountCaption: "Available to claim",
        disabled: false,
      };
    case "pending":
      return {
        label: "Pending",
        amountCaption: "Processing soon",
        disabled: true,
      };
    case "ineligible":
      return {
        label: "Not eligible",
        amountCaption: "Nothing available",
        disabled: true,
      };
    case "locked":
      return {
        label: "Locked",
        amountCaption: "Join a squad to unlock",
        disabled: true,
      };
    case "empty":
    default:
      return {
        label: "No rewards yet",
        amountCaption: "Available to claim",
        disabled: true,
      };
  }
}

export default function CommandCenterClaims() {
  const { attribution } = useCommandCenterData();
  const rewardCards = buildRewardCards(attribution?.squadState);

  return (
    <div className="space-y-4">
      <CommandCenterCard title="Your Rewards">
        <div className="grid gap-3 lg:grid-cols-3">
          {rewardCards.map((card) => {
            const Icon = card.icon;
            const stateCopy = getRewardStateCopy(card.state);
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
                    {stateCopy.label}
                  </span>
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-retro text-2xl text-foreground">{card.amountLabel}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{stateCopy.amountCaption}</div>
                  </div>
                  <Button disabled={stateCopy.disabled} className="font-retro">
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
