import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { BattleCard, TacticalHint, TacticalTag, WarPoolModule } from "@/components/postgrad/PostGradPrimitives";
import { battleWarPool, getMockBattleById, getMockTokenById, scheduledEvents } from "@/features/postgrad/mockRegistry";

const BattleDetails = () => {
  const { id } = useParams();

  const battle = useMemo(() => {
    return getMockBattleById(id) ?? getMockBattleById("battle-redline-vs-sdoge");
  }, [id]);

  const participantTokens = battle
    ? battle.participants
        .map((participant) => getMockTokenById(participant.tokenId))
        .filter((token): token is NonNullable<typeof token> => Boolean(token))
    : [];

  if (!battle) return null;

  return (
    <div className="space-y-6 px-1 pb-10">
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
          </div>
        </div>
      </section>

      <BattleCard battle={battle} ctaLabel="Challenge flow pending" />
      <WarPoolModule pool={battleWarPool} />

      {participantTokens.length ? (
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
