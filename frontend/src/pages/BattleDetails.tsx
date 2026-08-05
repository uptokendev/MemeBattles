import { Link, useParams } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { RichBattleCardOrange } from "@/components/postgrad/RichBattleCardOrange";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { WarPoolPanel } from "@/components/postgrad/WarPoolPanel";
import { Button } from "@/components/ui/button";
import { formatCompactCount, formatCompactUsd } from "@/features/postgrad/warRoomMetrics";
import { getArenaTokenRoute } from "@/features/postgrad/tokenRoutes";
import { useArenaBattleDetails } from "@/hooks/useArenaBattleFeed";
import { useArenaEventFeed } from "@/hooks/useArenaEventFeed";
import { ContentContainer } from "@/components/layout/ContentContainer";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

const AWAITING_RIVAL_IMAGE = "/images/awaiting-rival.png";

function getParticipantImage(participant: any) {
  const isAwaiting = 
    participant?.tokenId?.startsWith("pending-") ||
    participant?.tokenName === "Awaiting Rival" ||
    participant?.symbol === "TBD";

  if (isAwaiting) {
    return AWAITING_RIVAL_IMAGE;
  }

  return participant?.imageUrl || participant?.image || participant?.logoURI || participant?.logoUrl || "/placeholder.svg";
}

function getParticipantRoute(participant: any) {
  return getArenaTokenRoute(participant?.tokenAddress ?? participant?.tokenId ?? participant?.campaignAddress ?? null);
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

  // Lightweight, stabilized logo hydration for this single battle's participants.
  // Uses ref for cache checks so filling the cache doesn't retrigger effects (prevents the previous freeze).
  // Safe here because it's one battle (max 2 addresses) vs list pages.
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});
  const logoCacheRef = useRef<Record<string, string>>({});
  const { fetchCampaignLogoURI } = useLaunchpad();

  useEffect(() => {
    logoCacheRef.current = logoCache;
  }, [logoCache]);

  useEffect(() => {
    if (!battle) return;
    let cancelled = false;

    const addresses = new Set<string>();
    (battle.participants || []).forEach((p: any) => {
      const addr = (p.campaignAddress || p.campaign || p.tokenId || "").toLowerCase();
      const cache = logoCacheRef.current;
      if (addr && !cache[addr]) addresses.add(addr);
    });

    const missing = Array.from(addresses);
    if (!missing.length) return;

    (async () => {
      try {
        const pairs = await Promise.all(
          missing.map(async (addr) => [addr, await fetchCampaignLogoURI(addr).catch(() => null)] as const)
        );
        if (cancelled) return;
        setLogoCache((prev) => {
          const next = { ...prev };
          for (const [addr, uri] of pairs) {
            if (uri) next[addr] = uri;
          }
          return next;
        });
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [battle, fetchCampaignLogoURI]);

  const hydrateParticipants = (participants: any[] = []) => {
    return participants.map((p: any) => {
      const addr = (p.campaignAddress || p.campaign || p.tokenId || "").toLowerCase();
      const hydrated = addr && logoCache[addr] ? logoCache[addr] : (p.imageUrl || p.image || p.logoURI || p.logoUrl);
      const resolved = resolveImageUri(hydrated) || p.imageUrl || p.image || "/placeholder.svg";
      return {
        ...p,
        imageUrl: resolved,
        image: resolved,
      };
    });
  };

  const hydratedBattle = useMemo(() => {
    if (!battle) return null;
    return {
      ...battle,
      participants: hydrateParticipants(battle.participants),
    };
  }, [battle, logoCache]);

  const battleForRender = hydratedBattle || battle;

  if (!battle) {
    return (
      <div className="space-y-6 px-1 pb-10">
        <section className="mwz-hud-frame p-5 md:p-7">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Battle</div>
          <h1 className="mt-2 font-retro text-3xl tracking-tight text-foreground md:text-5xl">This battle isn’t available right now.</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            {source === "empty"
              ? "Battle detail data isn’t available right now."
              : "We couldn’t load this battle right now."}
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

  const participantTokens = (battleForRender?.participants || [])
    .filter((participant: any) => !participant.tokenId.startsWith("pending-"))
    .map((participant: any) => ({
      tokenId: participant.tokenId,
      tokenName: participant.tokenName,
      symbol: participant.symbol,
      route: getParticipantRoute(participant as any),
      score: participant.score,
      volumeUsd: participant.volumeUsd,
      uniqueTraders: participant.uniqueTraders,
      marketCapUsd: getParticipantMarketCap(participant as any),
      audience: getParticipantAudience(participant as any),
      imageUrl: participant.imageUrl || getParticipantImage(participant as any),
      isLeading: Boolean((participant as any)?.isLeading),
    }));

  const bridgeEvent = events.find((event) => event.status === "live") ?? events.find((event) => event.status === "scheduled" || event.status === "deploying") ?? null;
  const sourceLabel = source === "api" ? "Live data" : source === "qa-runtime" ? "Backup data" : "Feed unavailable";
  const sourceTone = source === "api" ? "success" : source === "qa-runtime" ? "hot" : "default";

  return (
    <>
      {/* Top intro section (Battle progress and results header) - dropped under the buttons
          with the same full-width treatment as Sponsored on Arena and top sections on other pages */}
      <div className="mt-14 space-y-4 pl-1 pr-8 pb-10">
        <section className="mwz-hud-frame p-5 md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Battle</div>
              <h1 className="mt-2 font-retro text-3xl tracking-tight text-foreground md:text-5xl">Battle progress and results</h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">Follow the score, supporters, and final results from one focused battle page.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TacticalTag label={String((battle as any)?.state ?? "").replace(/_/g, " ")} tone="hot" />
              <TacticalTag label={battle.featured ? "Featured matchup" : "Battle"} tone={battle.featured ? "hot" : "default"} />
              <TacticalTag label={sourceLabel} tone={sourceTone} />
            </div>
          </div>
        </section>
      </div>

      {/* All content below the top intro uses the same constrained width as Launchpad, Command Center,
          War Room, and other pages. Pulled up tight with -mt-8 for consistent gap. */}
      <ContentContainer className="-mt-8 space-y-6 px-1 pb-10">
        <RichBattleCardOrange battle={battleForRender} ctaLabel="View battle" />

        <WarPoolPanel battle={battle} />

        {participantTokens.length ? (
          <section className="mwz-hud-frame p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Matchup</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {participantTokens.map((token) => {
                const content = (
                  <div className="mwz-hud-frame p-4 transition-colors">
                    <div className="flex items-start gap-3">
                      <img src={token.imageUrl} alt={token.tokenName} className="h-14 w-14 shrink-0 border border-accent/30 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-retro text-sm text-foreground">{token.tokenName}</div>
                          <div className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">{token.symbol}</div>
                          {token.isLeading ? <TacticalTag label="In the lead" tone="hot" /> : null}
                          <TacticalTag label={`Score: ${token.score.toFixed(1)}`} tone="hot" />
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
            <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Match stages</div>
            <div className="mt-2 text-sm text-muted-foreground">Waiting → Ready → Matched → Live → Finished</div>
          </div>
          <div className="mwz-hud-frame p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Payout protection</div>
            <div className="mt-2 text-sm text-muted-foreground">Support closes before results are finalized to keep payouts fair.</div>
          </div>
          <div className="mwz-hud-frame p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Related event</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {bridgeEvent
                ? `This battle may be featured in ${bridgeEvent.title}.`
                : eventSource === "empty"
                  ? "Event bridge data isn’t available right now."
                  : "Event-linked promotion will appear here when a connected Arena event is available."}
            </div>
          </div>
        </section>
      </ContentContainer>
    </>
  );
};

export default BattleDetails;