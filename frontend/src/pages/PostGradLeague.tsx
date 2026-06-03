import { Link } from "react-router-dom";
import { ArenaCampaignRail } from "@/components/postgrad/ArenaCampaignRailCard";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { getPostGradWarRoomSearchRoute } from "@/features/postgrad/identityRoutes";
import { getArenaTokenRoute } from "@/features/postgrad/tokenRoutes";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import { useArenaLeagueFeed } from "@/hooks/useArenaLeagueFeed";
import { ContentContainer } from "@/components/layout/ContentContainer";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, useEffect, useMemo } from "react";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

const movementTone = {
  promoted: "success",
  safe: "default",
  relegated: "hot",
} as const;

const stateTone = {
  preseason: "default",
  live: "success",
  playoffs: "sponsored",
  completed: "hot",
} as const;

function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const PostGradLeague = () => {
  const { season, history, source: leagueSource } = useArenaLeagueFeed();
  const { railItems: leagueEntrants, hasRealCampaigns, loading: leagueEntrantsLoading, source: campaignSource } = useArenaCampaignFeed(10);
  const leadEntry = season.entries[0];
  const promotedCount = season.entries.filter((entry) => entry.movement === "promoted").length;
  const relegatedCount = season.entries.filter((entry) => entry.movement === "relegated").length;
  const entrantFeedLabel = hasRealCampaigns ? "Live data" : leagueEntrantsLoading ? "Loading" : campaignSource === "empty" ? "Data unavailable" : "Awaiting data";

  const entrantRailRef = useRef<HTMLDivElement | null>(null);

  const scrollBy = (ref: React.RefObject<HTMLDivElement>, dir: "left" | "right") => {
    const el = ref.current;
    if (!el) return;
    const amount = Math.max(320, Math.floor(el.clientWidth * 0.85));
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  // Logo hydration for the entrant rail
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});
  const { fetchCampaignLogoURI } = useLaunchpad();

  useEffect(() => {
    let cancelled = false;
    const missing = (leagueEntrants || [])
      .map((c: any) => (c.campaignAddress || c.id || "").toLowerCase())
      .filter((addr: string): addr is string => !!addr && !logoCache[addr]);

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
  }, [leagueEntrants, logoCache, fetchCampaignLogoURI]);

  const hydratedLeagueEntrants = useMemo(() => {
    return (leagueEntrants || []).map((c: any) => {
      const addr = (c.campaignAddress || c.id || "").toLowerCase();
      const hydrated = addr && logoCache[addr] ? logoCache[addr] : c.imageUrl;
      return {
        ...c,
        imageUrl: resolveImageUri(hydrated) || c.imageUrl || "/placeholder.svg",
      };
    });
  }, [leagueEntrants, logoCache]);

  return (
    <>
      {/* Top section (like Sponsored on Arena) */}
      <div className="mt-14 space-y-4 pl-1 pr-8 pb-10">
        <section className="mwz-hud-frame p-5 md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">League</div>
              <h1 className="mt-2 font-retro text-3xl tracking-tight text-foreground md:text-5xl">Follow the standings, rankings, and prize pool.</h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">Track the current table, see who is moving up or down, and keep the season reward pool in view as the league cycle advances.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TacticalTag label={season.label} tone="sponsored" />
              <TacticalTag label={`Week ${season.week}`} tone="default" />
              <TacticalTag label={season.state} tone={stateTone[season.state]} />
              <TacticalTag label={`${hasRealCampaigns ? leagueEntrants.length : 0} entrants`} tone="hot" />
            </div>
          </div>
        </section>
      </div>

      {/* Rest of the page inside constrained container */}
      <ContentContainer className="-mt-8 space-y-4 px-1 pb-10">

      <section className="grid gap-4 xl:grid-cols-4">
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Season leader</div>
          <div className="mt-2 font-retro text-lg text-foreground">{leadEntry?.tokenName ?? "TBD"}</div>
          <div className="mt-1 text-sm text-muted-foreground">{leadEntry ? `${leadEntry.points} pts · ${leadEntry.symbol}` : leagueSource === "empty" ? "League standings aren’t available right now." : "Awaiting standings"}</div>
        </div>
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Reward pool</div>
          <div className="mt-2 font-retro text-lg text-foreground">{formatUsd(season.rewardPoolUsd)}</div>
          <div className="mt-1 text-sm text-muted-foreground">Resets {new Date(season.resetAt).toLocaleDateString()}</div>
        </div>
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Promotion zone</div>
          <div className="mt-2 font-retro text-lg text-foreground">{promotedCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">Coins currently moving up</div>
        </div>
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Relegation zone</div>
          <div className="mt-2 font-retro text-lg text-foreground">{relegatedCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">Coins currently at risk of dropping</div>
        </div>
      </section>

      <section className="mwz-hud-frame p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Competing coins</div>
            <h2 className="mt-1 font-retro text-2xl text-foreground">Coins in contention</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">When live data is available it appears here, so season seeding and standings can be viewed against the current lineup.</p>
          </div>
          <div className="flex items-center gap-2">
            <TacticalTag label={entrantFeedLabel} tone="success" />
            <Button variant="ghost" size="sm" className="mwz-button hidden md:inline-flex !h-7 !w-6 !min-h-0 !min-w-0 !p-0" onClick={() => scrollBy(entrantRailRef, "left")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="mwz-button hidden md:inline-flex !h-7 !w-6 !min-h-0 !min-w-0 !p-0" onClick={() => scrollBy(entrantRailRef, "right")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div ref={entrantRailRef} className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
          <ArenaCampaignRail
            items={hydratedLeagueEntrants}
            rankTone="hot"
            loading={leagueEntrantsLoading}
            emptyLabel={campaignSource === "empty" ? "League coin data isn’t available right now." : "Competing coins will appear here when live data is available."}
            actionBuilder={(item) => [
              { label: "Token details", href: item.href },
              { label: "Trade War Room", href: getPostGradWarRoomSearchRoute(item.symbol || item.title) },
            ]}
            scrollRef={entrantRailRef}
          />
        </div>
      </section>

      <section className="mwz-hud-frame p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Standings</div>
            <div className="mt-1 font-retro text-xl text-foreground">Current standings</div>
          </div>
          <TacticalTag label={`${season.entries.length} entries`} tone="success" />
        </div>
        <div className="mt-4 space-y-3">
          {season.entries.length ? (
            season.entries.map((entry, index) => {
              const tokenRoute = getArenaTokenRoute(entry.tokenId);
              return (
                <div key={entry.tokenId} className="mwz-hud-frame p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-retro text-sm text-foreground">#{index + 1} {entry.tokenName}</div>
                        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{entry.symbol}</div>
                        <TacticalTag label={entry.division} tone="sponsored" />
                        <TacticalTag label={entry.movement} tone={movementTone[entry.movement]} />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground/80">
                        {entry.points} pts · {entry.wins}W / {entry.losses}L · Streak {entry.streak > 0 ? `+${entry.streak}` : entry.streak}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tokenRoute ? (
                        <Button asChild size="sm" variant="outline" className="font-retro">
                          <Link to={tokenRoute}>Token details</Link>
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="outline" className="font-retro">
                        <Link to={getPostGradWarRoomSearchRoute(entry.symbol)}>Open in Trade War Room</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {leagueSource === "empty" ? "League standings data isn’t available right now." : "League standings will appear here once the season feed is available."}
            </div>
          )}
        </div>
      </section>

      <section className="mwz-hud-frame p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Past seasons</div>
            <div className="mt-1 font-retro text-xl text-foreground">Finished seasons</div>
          </div>
          <TacticalTag label={`${history.length} saved`} tone="sponsored" />
        </div>
        <div className="mt-4 space-y-3">
          {history.length ? (
            history.map((entry) => (
              <div key={`${entry.seasonId}-${entry.completedAt}`} className="mwz-hud-frame p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-retro text-sm text-foreground">{entry.label}</div>
                      <TacticalTag label={`Winner ${entry.topTokenSymbol}`} tone="success" />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground/80">
                      Archived {new Date(entry.completedAt).toLocaleString()} · Week {entry.week} · Reward pool {formatUsd(entry.rewardPoolUsd)}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">Top finisher: {entry.topTokenName}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {leagueSource === "empty" ? "League archive data isn’t available right now." : "Completed seasons will appear here after rollover."}
            </div>
          )}
        </div>
      </section>
      </ContentContainer>
    </>
  );
};

export default PostGradLeague;