import { Link, useParams } from "react-router-dom";
import { BattleCard, MockModeBanner, TacticalHint, TacticalTag, WarPoolModule } from "@/components/postgrad/PostGradPrimitives";
import { PostGradStatusStrip } from "@/components/postgrad/PostGradStatusStrip";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
import type { MockTokenProfile } from "@/features/postgrad/contracts";
import { battleWarPool, getMockTokenById, scheduledEvents } from "@/features/postgrad/mockRegistry";
import { useMockBattleDetails } from "@/hooks/useMockBattleRuntime";

const BattleDetails = () => {
  const { id } = useParams();
  const { battle, transitionMockBattle, resetMockBattleRuntime } = useMockBattleDetails(id);

  const participantTokens = battle
    ? battle.participants
        .map((participant) => getMockTokenById(participant.tokenId))
        .filter((token): token is MockTokenProfile => Boolean(token))
    : [];

  if (!battle) return null;

  const nextActions = {
    draft: [{ label: "Queue battle", state: "open_for_battle" as const }],
    open_for_battle: [{ label: "Accept challenge", state: "pending" as const }, { label: "Cancel queue", state: "cancelled" as const }],
    pending: [{ label: "Lock matchup", state: "accepted" as const }, { label: "Decline", state: "cancelled" as const }],
    accepted: [{ label: "Start live battle", state: "live" as const }],
    live: [{ label: "Complete battle", state: "completed" as const }],
    completed: [{ label: "Settle result", state: "settled" as const }],
    settled: [],
    cancelled: [],
  }[battle.state];

  return (
    <div className="space-y-6 px-1 pb-10">
      {postGradFlags.mocks ? <MockModeBanner subject="Battle sandbox" /> : null}
      <PostGradStatusStrip />

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(6,7,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Battle route scaffold</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Battle lifecycle and settlement shell.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This page holds the future home for live score streaming, timing, challenge state, and settlement proofing. The layout is in place before realtime and pool logic become production-grade.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={battle.state.replaceAll("_", " ")} tone="hot" />
            <TacticalHint label="Realtime next" body="The score blocks and timestamps are wired to the same contract shapes that the realtime payloads export from the post-grad feature module." />
            {postGradFlags.mocks ? (
              <Button variant="outline" size="sm" onClick={resetMockBattleRuntime}>
                Reset mock battles
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <BattleCard battle={battle} ctaLabel="Challenge flow pending" />

      {postGradFlags.mocks ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Mock challenge controls</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {nextActions.map((action) => (
              <Button key={action.state} size="sm" onClick={() => transitionMockBattle(battle.id, action.state)}>
                {action.label}
              </Button>
            ))}
            {nextActions.length === 0 ? <div className="text-sm text-white/60">No further transitions available for this mock battle state.</div> : null}
          </div>
        </section>
      ) : null}

      <WarPoolModule pool={battleWarPool} />

      {participantTokens.length && postGradFlags.mocks ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Mock roster context</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {participantTokens.map((token) => (
              <Link key={token.id} to={`/arena/token/${token.id}`} className="rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{token.name}</div>
                    <div className="text-xs uppercase tracking-[0.22em] text-white/45">{token.symbol}</div>
                  </div>
                  <TacticalTag label={token.battleStyle.replaceAll("_", " ")} tone="sponsored" />
                </div>
                <div className="mt-2 text-sm text-white/65">{token.thesis}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Lifecycle states</div>
          <div className="mt-2 text-sm text-white/70">draft → open_for_battle → pending → accepted → live → completed → settled</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Settlement guard</div>
          <div className="mt-2 text-sm text-white/70">Pool cutoff, payout routing, and suspicious activity hooks are reserved here for the next backend phase.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Event bridge</div>
          <div className="mt-2 text-sm text-white/70">Current battle can later be promoted into {scheduledEvents[0].title} without reworking the page contract.</div>
        </div>
      </section>
    </div>
  );
};

export default BattleDetails;
