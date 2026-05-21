import { BattleCard, EventCard, MockModeBanner, RankingsPanel, StreakPopup, TacticalHint, TacticalTag, TokenIntelRow } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
import { arenaRankings, scheduledEvents } from "@/features/postgrad/mockRegistry";
import { useMockArenaState } from "@/hooks/useMockArenaRuntime";
import { useMockBattleLists } from "@/hooks/useMockBattleRuntime";

const Arena = () => {
  const { liveBattles, openForBattleQueue, resetMockBattleRuntime } = useMockBattleLists();
  const { featuredTokens, allTokens, sponsoredTokenIds, setFeaturedPlacement, rotateFeaturedPlacements, toggleSponsoredPlacement, resetMockArenaRuntime } = useMockArenaState();

  return (
    <div className="space-y-6 px-1 pb-10">
      {postGradFlags.mocks ? <MockModeBanner subject="Arena sandbox" /> : null}

      <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.22),transparent_28%),linear-gradient(180deg,rgba(13,15,20,0.92),rgba(6,7,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Post-grad foundation</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Arena scaffold is live behind flags.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This route establishes the additive discovery surface for graduated tokens, live battles, event deployment, and now mock placement controls without disturbing the current launchpad homepage.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label="Feature-flagged" tone="success" />
            <TacticalTag label="Additive" tone="default" />
            <TacticalHint label="Hard gate" body="Arena stays isolated until battle, ranking, and indexing contracts are stable enough to replace mock data." />
            {postGradFlags.mocks ? (
              <>
                <Button variant="outline" size="sm" onClick={resetMockBattleRuntime}>
                  Reset mock battles
                </Button>
                <Button variant="outline" size="sm" onClick={resetMockArenaRuntime}>
                  Reset arena placements
                </Button>
              </>
            ) : null}
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
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={`${sponsoredTokenIds.length} sponsored`} tone="sponsored" />
            <TacticalTag label="Horizontal lane ready" tone="sponsored" />
            {postGradFlags.mocks ? (
              <Button size="sm" variant="outline" onClick={rotateFeaturedPlacements}>
                Rotate featured row
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          {featuredTokens.map((token) => (
            <TokenIntelRow
              key={token.id}
              token={{
                ...token,
                tacticalTags: [
                  ...(token.sponsoredPlacement && !token.tacticalTags.includes("Sponsored") ? ["Sponsored"] : []),
                  ...(token.featuredPlacement && !token.tacticalTags.includes("Featured") ? ["Featured"] : []),
                  ...token.tacticalTags,
                ],
              }}
              metricLabel="Battle readiness"
              metricValue={token.battleEligible ? `Slot ${token.placementIndex != null ? token.placementIndex + 1 : "-"}` : "Locked"}
              href={postGradFlags.mocks ? `/arena/token/${token.id}` : undefined}
            />
          ))}
        </div>
      </section>

      {postGradFlags.mocks ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Placement controls</div>
              <div className="mt-2 text-sm text-white/70">Promote tokens into the featured row or toggle sponsored placement to test Arena ordering before the real placement system exists.</div>
            </div>
            <TacticalHint label="QA-only" body="These controls only affect the sandbox state for post-grad frontend testing." />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {allTokens.map((token) => (
              <div key={token.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{token.name}</div>
                    <div className="text-xs uppercase tracking-[0.22em] text-white/45">{token.symbol}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    {token.featuredPlacement ? <TacticalTag label={`Featured ${token.placementIndex != null ? token.placementIndex + 1 : ""}`.trim()} tone="hot" /> : null}
                    {token.sponsoredPlacement ? <TacticalTag label="Sponsored" tone="sponsored" /> : null}
                  </div>
                </div>
                <div className="mt-3 text-xs text-white/60">MC ${(token.marketCapUsd / 1000000).toFixed(2)}M · Watchlists {token.watchlistCount.toLocaleString()}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant={token.featuredPlacement ? "default" : "outline"} onClick={() => setFeaturedPlacement(token.id)}>
                    {token.featuredPlacement ? "Move to top" : "Feature token"}
                  </Button>
                  <Button size="sm" variant={token.sponsoredPlacement ? "default" : "outline"} onClick={() => toggleSponsoredPlacement(token.id)}>
                    {token.sponsoredPlacement ? "Unsponsor" : "Sponsor"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
