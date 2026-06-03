import { Link } from "react-router-dom";
import { useRef, useState, useEffect, useMemo } from "react";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

import { ArenaCampaignRail } from "@/components/postgrad/ArenaCampaignRailCard";
import { RichBattleCardOrange } from "@/components/postgrad/RichBattleCardOrange";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { getPostGradWarRoomSearchRoute } from "@/features/postgrad/identityRoutes";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";
import { ContentContainer } from "@/components/layout/ContentContainer";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ArenaBattles = () => {
  const {
    liveBattles,
    openForBattleQueue,
    archivedBattles,
    source: battleSource,
  } = useArenaBattleFeed();
  const {
    railItems: marketCandidates,
    hasRealCampaigns,
    loading: marketCandidatesLoading,
    source: marketCampaignSource,
  } = useArenaCampaignFeed(8);

  const marketFeedLabel = hasRealCampaigns
    ? "Campaign feed"
    : marketCandidatesLoading
      ? "Loading"
      : marketCampaignSource === "empty"
        ? "Feed unavailable"
        : "Arena feed";

  const topRailRef = useRef<HTMLDivElement | null>(null);

  const scrollBy = (ref: React.RefObject<HTMLDivElement>, dir: "left" | "right") => {
    const el = ref.current;
    if (!el) return;
    const amount = Math.max(320, Math.floor(el.clientWidth * 0.85));
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  // Logo hydration for the campaign rail + battle participants.
  // Stabilized with ref so cache population does not retrigger the fetch effects (prevents freeze).
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});
  const logoCacheRef = useRef<Record<string, string>>({});
  const { fetchCampaignLogoURI } = useLaunchpad();

  useEffect(() => {
    logoCacheRef.current = logoCache;
  }, [logoCache]);

  // Rail hydration — stabilized
  useEffect(() => {
    let cancelled = false;
    const cache = logoCacheRef.current;
    const missing = (marketCandidates || [])
      .map((c: any) => (c.campaignAddress || c.id || "").toLowerCase())
      .filter((addr: string): addr is string => !!addr && !cache[addr]);

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
  }, [marketCandidates, fetchCampaignLogoURI]);

  const hydratedMarketCandidates = useMemo(() => {
    return (marketCandidates || []).map((c: any) => {
      const addr = (c.campaignAddress || c.id || "").toLowerCase();
      const hydrated = addr && logoCache[addr] ? logoCache[addr] : c.imageUrl;
      return {
        ...c,
        imageUrl: resolveImageUri(hydrated) || c.imageUrl || "/placeholder.svg",
      };
    });
  }, [marketCandidates, logoCache]);



  const hydrateParticipants = (participants: any[] = []) => {
    return participants.map((p: any) => {
      const addr = (p.campaignAddress || p.campaign || p.tokenId || "").toLowerCase();
      const hydrated = addr && logoCache[addr] ? logoCache[addr] : (p.imageUrl || p.image || p.logoURI || p.logoUrl);
      return {
        ...p,
        imageUrl: resolveImageUri(hydrated) || p.imageUrl || p.image || "/placeholder.svg",
        image: resolveImageUri(hydrated) || p.image || "/placeholder.svg",
      };
    });
  };

  const hydratedOpenForBattleQueue = useMemo(() => {
    return (openForBattleQueue || []).map((battle: any) => ({
      ...battle,
      participants: hydrateParticipants(battle.participants),
    }));
  }, [openForBattleQueue, logoCache]);

  const hydratedLiveBattles = useMemo(() => {
    return (liveBattles || []).map((battle: any) => ({
      ...battle,
      participants: hydrateParticipants(battle.participants),
    }));
  }, [liveBattles, logoCache]);

  const hydratedArchivedBattles = useMemo(() => {
    return (archivedBattles || []).map((entry: any) => ({
      ...entry,
      battle: entry.battle ? {
        ...entry.battle,
        participants: hydrateParticipants(entry.battle.participants),
      } : entry.battle,
    }));
  }, [archivedBattles, logoCache]);

  return (
    <>
      {/* Top section (like Sponsored on Arena) - full width style */}
      <div className="mt-14 space-y-4 pl-1 pr-8 pb-10">
        <section className="mwz-orange-frame-soft p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mwz-orange-frame-label text-[14px]">Coins ready to compete</div>
            </div>
            <div className="flex items-center gap-2">
              <TacticalTag label={marketFeedLabel} tone="success" />
              <Button variant="ghost" size="sm" className="mwz-button hidden md:inline-flex !h-7 !w-6 !min-h-0 !min-w-0 !p-0" onClick={() => scrollBy(topRailRef, "left")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="mwz-button hidden md:inline-flex !h-7 !w-6 !min-h-0 !min-w-0 !p-0" onClick={() => scrollBy(topRailRef, "right")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div ref={topRailRef} className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
            <ArenaCampaignRail
              items={hydratedMarketCandidates}
              rankTone="hot"
              loading={marketCandidatesLoading}
              emptyLabel={marketCampaignSource === "empty" ? "Battle candidate data isn’t available right now." : "Battle candidates will appear here when live data is available."}
              actionBuilder={(item) => [
                { label: "Token details", href: item.href },
                { label: "Trade War Room", href: getPostGradWarRoomSearchRoute(item.symbol || item.title) },
              ]}
              scrollRef={topRailRef}
            />
          </div>
        </section>
      </div>

      {/* Rest of the page inside constrained container */}
      <ContentContainer className="-mt-8 space-y-4 px-1 pb-10">

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="mwz-orange-frame-label text-[14px]">Live battles</div>
            </div>
            <TacticalTag label={`${liveBattles.length} active`} tone="hot" />
          </div>
          {hydratedLiveBattles.length ? (
            hydratedLiveBattles.map((battle) => (
              <RichBattleCardOrange key={battle.id} battle={battle} ctaLabel="Open battle" />
            ))
          ) : (
            <div className="mwz-orange-frame-soft p-5 text-sm text-muted-foreground">
              {battleSource === "empty" ? "Live battle data isn’t available right now." : "No live battles are active right now."}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="mwz-orange-frame-label text-[14px]">Open for battle</div>
            </div>
            <TacticalTag label={`${openForBattleQueue.length} awaiting rivals`} tone="success" />
          </div>
          {hydratedOpenForBattleQueue.length ? (
            hydratedOpenForBattleQueue.map((battle) => (
              <RichBattleCardOrange key={battle.id} battle={battle} ctaLabel="Open challenge" />
            ))
          ) : (
            <div className="mwz-orange-frame-soft p-5 text-sm text-muted-foreground">
              {battleSource === "empty" ? "Queue data isn’t available right now." : "No memecoins are waiting in the battle queue right now."}
            </div>
          )}
        </div>
      </section>

      <section className="mwz-orange-frame-soft p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="mwz-orange-frame-label text-[10px]">Recent results</div>
            <h2 className="mt-1 font-retro text-xl text-foreground">Recent battle results</h2>
          </div>
          <TacticalTag label={`${archivedBattles.length} completed`} tone="hot" />
        </div>
        <div className="mt-4 space-y-4">
          {hydratedArchivedBattles.length ? (
            hydratedArchivedBattles.map((entry) => (
              <RichBattleCardOrange key={`${entry.battle.id}-${entry.archivedAt}`} battle={entry.battle} ctaLabel="Open recap" />
            ))
          ) : (
            <div className="mwz-orange-frame-soft p-5 text-sm text-muted-foreground">
              {battleSource === "empty" ? "Recent battle archive data isn’t available right now." : "Settled battles will appear here once recent results are available."}
            </div>
          )}
        </div>
      </section>
      </ContentContainer>
    </>
  );
};

export default ArenaBattles;
