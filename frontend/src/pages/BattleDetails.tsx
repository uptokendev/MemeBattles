import { Link, useParams } from "react-router-dom";
import { WarPoolPanel } from "@/components/postgrad/WarPoolPanel";
import { BattleCard, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
import type { MockTokenProfile } from "@/features/postgrad/contracts";
import { getMockTokenRouteById, getMockTokenById, scheduledEvents } from "@/features/postgrad/mockRegistry";
import { useArenaBattleDetails } from "@/hooks/useArenaBattleFeed";

const BattleDetails = () => {
  const { id } = useParams();
  const { battle, transitionBattle } = useArenaBattleDetails(id);

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
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(6,7,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Battle arena</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Battle lifecycle and settlement.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">Track challenge state, live score context, War Pool support, and settlement routing from one focused battle page.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={battle.state.replaceAll("_", " ")} tone="hot" />
            <TacticalTag label={battle.featured ? "Featured battle" : "Arena battle"} tone={battle.featured ? "sponsored" : "default"} />
          </div>
        </div>
      </section>

      <BattleCard battle={battle} ctaLabel="Battle details" />

      {postGradFlags.mocks ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Battle controls</div>
          <div className="mt-2 text-sm text-white/65">Move this battle through the available challenge states while the backend battle adapter is being wired in.</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {nextActions.map((action) => (
              <Button key={action.state} size="sm" onClick={() => transitionBattle(battle.id, action.state)}>
                {action.label}
              </Button>
            ))}
            {nextActions.length === 0 ? <div className="text-sm text-white/60">No further transitions are available for this battle state.</div> : null}
          </div>
        </section>
      ) : null}

      <WarPoolPanel battle={battle} />

      {participantTokens.length && postGradFlags.mocks ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Memecoin matchup</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {participantTokens.map((token) => {
              const tokenRoute = getMockTokenRouteById(token.id);
              return tokenRoute ? (
                <Link key={token.id} to={tokenRoute} className="rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{token.name}</div>
                      <div className="text-xs uppercase tracking-[0.22em] text-white/45">{token.symbol}</div>
                    </div>
                    <TacticalTag label={token.battleStyle.replaceAll("_", " ")} tone="sponsored" />
                  </div>
                  <div className="mt-2 text-sm text-white/65">{token.thesis}</div>
                </Link>
              ) : null;
            })}
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
          <div className="mt-2 text-sm text-white/70">Pool cutoff, payout routing, and suspicious activity checks sit behind the settlement flow.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Event bridge</div>
          <div className="mt-2 text-sm text-white/70">Current battle can be promoted into {scheduledEvents[0].title} from the event layer.</div>
        </div>
      </section>
    </div>
  );
};

export default BattleDetails;
