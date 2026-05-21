import { BattleCard, EventCard, RankingsPanel, StreakPopup, TacticalHint, TacticalTag, TokenIntelRow } from "@/components/postgrad/PostGradPrimitives";
import { postGradFlags } from "@/features/postgrad/config";
import { arenaRankings, featuredTokens, liveBattles, openForBattleQueue, scheduledEvents } from "@/features/postgrad/mockRegistry";

const Arena = () => {
  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.22),transparent_28%),linear-gradient(180deg,rgba(13,15,20,0.92),rgba(6,7,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Post-grad foundation</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Arena scaffold is live behind flags.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This route establishes the additive discovery surface for graduated tokens, live battles, and event deployment without disturbing the current launchpad homepage.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label="Feature-flagged" tone="success" />
            <TacticalTag label="Additive" tone="default" />
            <TacticalHint label="Hard gate" body="Arena stays isolated until battle, ranking, and indexing contracts are stable enough to replace mock data." />
          </div>
        </div>
      </section>

      <StreakPopup streakDays={4} nextReward="War Room watchlist boost" />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Featured placement row</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Sponsored and highlighted graduates</h2>
          </div>
          <TacticalTag label="Horizontal lane ready" tone="sponsored" />
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          {featuredTokens.map((token) => (
            <TokenIntelRow key={token.id} token={token} metricLabel="Battle readiness" metricValue={token.battleEligible ? "Eligible" : "Locked"} href={postGradFlags.mocks ? `/arena/token/${token.id}` : undefined} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_1.35fr_1fr]">
        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Lane 1</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Live Battles</h2>
          </div>
          {liveBattles.map((battle) => (
            <BattleCard key={battle.id} battle={battle} ctaLabel="View live battle" />
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Lane 2</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Open For Battle</h2>
          </div>
          {openForBattleQueue.map((battle) => (
            <BattleCard key={battle.id} battle={battle} ctaLabel="Open challenge flow" />
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Lane 3</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Events and Leagues</h2>
          </div>
          <EventCard event={scheduledEvents[0]} />
          <RankingsPanel payload={arenaRankings[0]} icon="flame" />
        </div>
      </section>
    </div>
  );
};

export default Arena;
