import { Link, useParams } from "react-router-dom";
import { RichBattleCard } from "@/components/postgrad/RichBattleCard";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { WarPoolPanel } from "@/components/postgrad/WarPoolPanel";
import { Button } from "@/components/ui/button";
import { formatCompactCount, formatCompactUsd } from "@/features/postgrad/warRoomMetrics";
import { getArenaTokenRoute } from "@/features/postgrad/tokenRoutes";
import { useArenaBattleDetails } from "@/hooks/useArenaBattleFeed";
import { useArenaEventFeed } from "@/hooks/useArenaEventFeed";

function getParticipantImage(participant: any) {
  return participant?.imageUrl || participant?.image || participant?.logoURI || participant?.logoUrl || "/placeholder.svg";
}

function getParticipantRoute(participant: any) {
  return getArenaTokenRoute(participant?.campaignAddress ?? participant?.tokenId ?? participant?.tokenAddress ?? null);
}

function getParticipantMarketCap(participant: any) {
  const value = Number(participant?.marketCapUsd ?? participant?.marketCap ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getParticipantAudience(participant: any) {
  const holders = Number(participant?.holderCount ?? participant?.holders ?? 0);
  if (Number.isFinite(holders) && holders > 0) {
    return { label: "Holders", value: holders };
  }

  const traders = Number(participant?.traderCount ?? participant?.uniqueTraders ?? 0);
  return {
    label: "Traders",
    value: Number.isFinite(traders) && traders > 0 ? traders : 0,
  };
}

const BattleDetails = () => {
  const { id } = useParams();
  const { battle, source } = useArenaBattleDetails(id);
  const { events, source: eventSource } = useArenaEventFeed();

  if (!battle) {
    return (
      <div className="space-y-6 px-1 pb-10">
        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(6,7,10,0.98))] p-5 md:p-7">
          <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Battle arena</div>
          <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Battle details unavailable.</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">
            {source === "empty"
              ? "Battle detail data is not available on this branch yet."
              : "This battle could not be resolved from the current Arena feed."}
          </p>
          <div className="mt-4">
            <Button asChild size="sm" variant="outline">
              <Link to="/arena/battles">Back to battles</Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const participantTokens = battle.participants
    .filter((participant) => !participant.tokenId.startsWith("pending-"))
    .map((participant) => ({
      tokenId: participant.tokenId,
      tokenName: participant.tokenName,
      symbol: participant.symbol,
      route: getParticipantRoute(participant as any),
      score: participant.score,
      volumeUsd: participant.volumeUsd,
      uniqueTraders: participant.uniqueTraders,
      marketCapUsd: getParticipantMarketCap(participant as any),
      audience: getParticipantAudience(participant as any),
      imageUrl: getParticipantImage(participant as any),
      isLeading: Boolean((participant as any)?.isLeading),
    }));

  const bridgeEvent = events.find((event) => event.status === "live") ?? events.find((event) => event.status === "scheduled" || event.status === "deploying") ?? null;
  const sourceLabel = source === "api" ? "Arena feed" : source === "qa-runtime" ? "Fallback feed" : "Feed unavailable";
  const sourceTone = source === "api" ? "success" : source === "qa-runtime" ? "sponsored" : "default";

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
            <TacticalTag label={sourceLabel} tone={sourceTone} />
          </div>
        </div>
      </section>

      <RichBattleCard battle={battle} ctaLabel="Battle details" />

      <WarPoolPanel battle={battle} />

      {participantTokens.length ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Memecoin matchup</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {participantTokens.map((token) => {
              const content = (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10">
                  <div className="flex items-start gap-3">
                    <img src={token.imageUrl} alt={token.tokenName} className="h-14 w-14 shrink-0 rounded-2xl border border-white/10 object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{token.tokenName}</div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/45">{token.symbol}</div>
                        {token.isLeading ? <TacticalTag label="Leading" tone="success" /> : null}
                        <TacticalTag label={`${token.score.toFixed(1)} pts`} tone="sponsored" />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Market cap</div>
                          <div className="mt-1 text-sm text-white">{formatCompactUsd(token.marketCapUsd)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">24h volume</div>
                          <div className="mt-1 text-sm text-white">{formatCompactUsd(token.volumeUsd)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{token.audience.label}</div>
                          <div className="mt-1 text-sm text-white">{formatCompactCount(token.audience.value)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );

              return token.route ? (
                <Link key={token.tokenId} to={token.route}>
                  {content}
                </Link>
              ) : (
                <div key={token.tokenId}>{content}</div>
              );
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
          <div className="mt-2 text-sm text-white/70">
            {bridgeEvent
              ? `Current battle can be promoted into ${bridgeEvent.title} from the event layer.`
              : eventSource === "empty"
                ? "Event bridge data is not available on this branch yet."
                : "Event-linked promotion will appear here when a connected Arena event is available."}
          </div>
        </div>
      </section>
    </div>
  );
};

export default BattleDetails;
