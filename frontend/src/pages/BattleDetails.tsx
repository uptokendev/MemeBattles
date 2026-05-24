import { Link, useParams } from "react-router-dom";
import { RichBattleCardOrange } from "@/components/postgrad/RichBattleCardOrange";
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
        <section className="mwz-hud-frame p-5 md:p-7">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Battle arena</div>
          <h1 className="mt-2 font-retro text-3xl tracking-tight text-foreground md:text-5xl">Battle details unavailable.</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            {source === "empty"
              ? "Battle detail data is not available on this branch yet."
              : "This battle could not be resolved from the current Arena feed."}
          </p>
          <div className="mt-4">
            <Button asChild size="sm" variant="outline" className="font-retro">
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
  const sourceTone = source === "api" ? "success" : source === "qa-runtime" ? "hot" : "default";

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="mwz-hud-frame p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Battle arena</div>
            <h1 className="mt-2 font-retro text-3xl tracking-tight text-foreground md:text-5xl">Battle lifecycle and settlement.</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">Track challenge state, live score context, War Pool support, and settlement routing from one focused battle page.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={battle.state.replaceAll("_", " ")} tone="hot" />
            <TacticalTag label={battle.featured ? "Featured battle" : "Arena battle"} tone={battle.featured ? "hot" : "default"} />
            <TacticalTag label={sourceLabel} tone={sourceTone} />
          </div>
        </div>
      </section>

      <RichBattleCardOrange battle={battle} ctaLabel="Battle details" />

      <WarPoolPanel battle={battle} />

      {participantTokens.length ? (
        <section className="mwz-hud-frame p-5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Memecoin matchup</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {participantTokens.map((token) => {
              const content = (
                <div className="mwz-hud-frame p-4 transition-colors">
                  <div className="flex items-start gap-3">
                    <img src={token.imageUrl} alt={token.tokenName} className="h-14 w-14 shrink-0 border border-accent/30 object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-retro text-sm text-foreground">{token.tokenName}</div>
                        <div className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">{token.symbol}</div>
                        {token.isLeading ? <TacticalTag label="Leading" tone="hot" /> : null}
                        <TacticalTag label={`${token.score.toFixed(1)} pts`} tone="hot" />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div>
                          <div className="font-retro text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Market cap</div>
                          <div className="mt-1 font-retro text-sm text-foreground">{formatCompactUsd(token.marketCapUsd)}</div>
                        </div>
                        <div>
                          <div className="font-retro text-[10px] uppercase tracking-[0.18em] text-muted-foreground">24h volume</div>
                          <div className="mt-1 font-retro text-sm text-foreground">{formatCompactUsd(token.volumeUsd)}</div>
                        </div>
                        <div>
                          <div className="font-retro text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{token.audience.label}</div>
                          <div className="mt-1 font-retro text-sm text-foreground">{formatCompactCount(token.audience.value)}</div>
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
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Lifecycle states</div>
          <div className="mt-2 text-sm text-muted-foreground">draft → open_for_battle → pending → accepted → live → completed → settled</div>
        </div>
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Settlement guard</div>
          <div className="mt-2 text-sm text-muted-foreground">Pool cutoff, payout routing, and suspicious activity checks sit behind the settlement flow.</div>
        </div>
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Event bridge</div>
          <div className="mt-2 text-sm text-muted-foreground">
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