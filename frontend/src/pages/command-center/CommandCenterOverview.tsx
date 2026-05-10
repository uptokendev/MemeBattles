import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";

const cards = [
  {
    title: "Profile",
    description: "Identity, public profile shortcut, followers, following, and created coins will live here.",
  },
  {
    title: "Ranking",
    description: "Rank badge and progress-to-next-rank plug in during the Home Base UI batch.",
  },
  {
    title: "League Cabinet",
    description: "Badges, trophies, active league status, and past wins will be shown here.",
  },
  {
    title: "Balances",
    description: "Native BNB, claimable rewards, pending rewards, and token balances will plug in safely.",
  },
];

export default function CommandCenterOverview() {
  return (
    <div>
      <CommandCenterPageHeader
        title="Overview"
        description="Your Command Center landing page. Phase 1 establishes the route and shell; the detailed home-base cards are wired in the next batch."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <CommandCenterCard key={card.title} title={card.title} description={card.description}>
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
              Safe placeholder. No private API data is required for Phase 1.
            </div>
          </CommandCenterCard>
        ))}
      </div>
    </div>
  );
}
