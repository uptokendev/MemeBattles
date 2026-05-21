import { BattleCard, MockModeBanner, TacticalHint, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { PostGradStatusStrip } from "@/components/postgrad/PostGradStatusStrip";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
import { useMockBattleLists } from "@/hooks/useMockBattleRuntime";

const ArenaBattles = () => {
  const { liveBattles, openForBattleQueue, archivedBattles, resetMockBattleRuntime } = useMockBattleLists();

  return (
    <div className="space-y-6 px-1 pb-10">
      {postGradFlags.mocks ? <MockModeBanner subject="Arena battles" /> : null}
      <PostGradStatusStrip />

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(6,7,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Arena battles route</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Creator controls and public battle discovery live here.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This route is now locked into the revised Arena structure. The full creator coin controls are the next focused build batch, but the route and public battle surfaces are in place now.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={`${liveBattles.length} live`} tone="success" />
            <TacticalTag label={`${openForBattleQueue.length} open`} tone="hot" />
            <TacticalTag label={`${archivedBattles.length} settled`} tone="sponsored" />
            <TacticalHint label="Next batch" body="This page becomes the creator battle-control surface next, including Your Coins, eligibility, unavailability reasons, and Open for Battle actions." />
            {postGradFlags.mocks ? (
              <Button variant="outline" size="sm" onClick={resetMockBattleRuntime}>
                Reset mock battles
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Your coins</div>
        <div className="mt-2 text-xl font-semibold text-white">Creator controls land here next</div>
        <div className="mt-3 text-sm text-white/70">The revised plan moves all creator battle actions into this page. For this route-lock batch, the section is reserved so the navigation and product shape stop moving around.</div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Public feed</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Live battles</h2>
          </div>
          {liveBattles.map((battle) => (
            <BattleCard key={battle.id} battle={battle} ctaLabel="Open battle" />
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Open challenges</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Open for battle</h2>
          </div>
          {openForBattleQueue.map((battle) => (
            <BattleCard key={battle.id} battle={battle} ctaLabel="Open challenge" />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Recent settled</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Battle recaps</h2>
          </div>
          <TacticalTag label={`${archivedBattles.length} archived`} tone="success" />
        </div>
        <div className="mt-4 space-y-4">
          {archivedBattles.length ? (
            archivedBattles.map((entry) => (
              <BattleCard key={`${entry.battle.id}-${entry.archivedAt}`} battle={entry.battle} ctaLabel="Open recap" />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              Settle a mock battle to build the recap lane.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ArenaBattles;
