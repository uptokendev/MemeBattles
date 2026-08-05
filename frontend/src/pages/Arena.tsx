import { Link } from "react-router-dom";
import { ArenaCampaignRail } from "@/components/postgrad/ArenaCampaignRailCard";
import { RichBattleCardOrange } from "@/components/postgrad/RichBattleCardOrange";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { useArenaSponsoredFeed } from "@/hooks/useArenaSponsoredFeed";
import { useArenaFeaturedFeed } from "@/hooks/useArenaFeaturedFeed";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";
import { useArenaEventFeed } from "@/hooks/useArenaEventFeed";
import { useArenaLeagueFeed } from "@/hooks/useArenaLeagueFeed";
import { getArenaTokenRoute } from "@/features/postgrad/tokenRoutes";
import { ContentContainer } from "@/components/layout/ContentContainer";

function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

// Supporting label helper for raw season.state (per Phase 1 copy table: provide friendly labels instead of raw state values)
function formatSeasonState(state: string): string {
  const s = (state || "").toLowerCase().replace(/_/g, " ");
  if (s === "live") return "Live now";
  if (s === "playoffs") return "Finals week";
  if (s.includes("coming") || s === "scheduled" || s === "deploying") return "Coming soon";
  if (s === "finished" || s === "ended" || s === "complete" || s === "settled") return "Finished";
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Live now";
}

const Arena = () => {
  const { liveBattles, openForBattleQueue, source: battleSource } = useArenaBattleFeed();
  const { events, source: eventSource } = useArenaEventFeed();
  const { season, source: leagueSource } = useArenaLeagueFeed();
  const { railItems: sponsoredRailItems, hasSponsoredCampaigns, loading: sponsoredLoading } = useArenaSponsoredFeed(4);
  const { railItems: featuredRailItems, hasFeaturedCampaigns, loading: featuredLoading, source: featuredSource } = useArenaFeaturedFeed(6);

  const activeEvents = events.filter((event) => event.status === "live");
  const upcomingEvents = events.filter((event) => event.status === "scheduled" || event.status === "deploying");
  const leadLeagueEntry = season.entries[0];
  const sponsoredFeedLabel = hasSponsoredCampaigns ? "Sponsored" : sponsoredLoading ? "Loading" : "Open spot";
  const featuredFeedLabel = hasFeaturedCampaigns ? (featuredSource === "campaigns" ? "Trending now" : "Community picks") : featuredLoading ? "Loading" : "No featured coins yet";

  return (
    <>
      {/* Sponsored spots stay full width on Arena main page - pulled up tight like the ticker on homepage */}
      <div className="mt-14 space-y-4 pl-1 pr-8 pb-10">
        <section className="mwz-hud-frame space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Sponsored</div>
              <h2 className="mt-1 font-retro text-xl text-foreground">Sponsored spots</h2>
            </div>
            <TacticalTag label={sponsoredFeedLabel} tone="hot" />
          </div>
          <ArenaCampaignRail
            items={sponsoredRailItems}
            rankTone="hot"
            loading={sponsoredLoading}
            emptyVariant="sponsor"
            emptyLabel="Want to feature your project here?"
          />
        </section>
      </div>

      {/* Everything else on Arena uses the standard constrained width - pull Featured up tight */}
      <ContentContainer className="-mt-6 space-y-6 px-1 pb-10">
        <section className="mwz-hud-frame space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Featured</div>
              <h2 className="mt-1 font-retro text-xl text-foreground">Featured coins</h2>
            </div>
            <TacticalTag label={featuredFeedLabel} tone="success" />
          </div>
          <ArenaCampaignRail
            items={featuredRailItems}
            rankTone="hot"
            loading={featuredLoading}
            emptyLabel="Featured memecoins will appear here when tokens or UpVote totals are available."
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="mt-1 font-retro text-xl text-foreground">Live battles</h2>
            </div>
            <Button asChild size="sm" variant="outline" className="font-retro">
              <Link to="/arena/battles">Open battles</Link>
            </Button>
          </div>
          {liveBattles.length ? (
            liveBattles.map((battle) => (
              <RichBattleCardOrange key={battle.id} battle={battle} ctaLabel="Open battle" />
            ))
          ) : (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {battleSource === "empty" ? "Live battle data is not available right now." : "No live battles are active right now."}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="mt-1 font-retro text-xl text-foreground">Looking for a match</h2>
            </div>
            <Button asChild size="sm" variant="outline" className="font-retro">
              <Link to="/arena/battles">View waiting matches</Link>
            </Button>
          </div>
          {openForBattleQueue.length ? (
            openForBattleQueue.map((battle) => {
              const tokenRoute = getArenaTokenRoute(
                (battle.participants[0] as any)?.tokenAddress
                  ?? battle.participants[0].tokenId
                  ?? (battle.participants[0] as any)?.campaignAddress,
              );
              return (
                <div key={battle.id} className="mwz-hud-frame p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <TacticalTag label="Looking for a match" tone="success" />
                    <TacticalTag label={battle.participants[0].symbol} tone="default" />
                  </div>
                  <div className="mt-3 font-retro text-sm text-foreground">{battle.participants[0].tokenName}</div>
                  <div className="mt-2 text-xs text-muted-foreground">Waiting for a challenger · Volume {formatUsd(battle.participants[0].volumeUsd)} · Traders {battle.participants[0].uniqueTraders}</div>
                  <div className="mt-4 flex gap-2">
                    <Button asChild size="sm" variant="outline" className="font-retro">
                      <Link to={`/battle/${battle.id}`}>View match</Link>
                    </Button>
                    {tokenRoute ? (
                      <Button asChild size="sm" variant="outline" className="font-retro">
                        <Link to={tokenRoute}>Token details</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {battleSource === "empty" ? "Open-for-battle queue data is not available right now." : "No memecoins are waiting in the battle queue right now."}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="mt-1 font-retro text-xl text-foreground">Events and rankings</h2>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" className="font-retro">
                <Link to="/arena/events">Events</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="font-retro">
                <Link to="/arena/leagues">Leagues</Link>
              </Button>
            </div>
          </div>

          {activeEvents[0] ? (
            <div className="mwz-hud-frame p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TacticalTag label="Live event" tone="success" />
                <TacticalTag label={formatLabel(activeEvents[0].type)} tone="hot" />
              </div>
              <div className="mt-3 font-retro text-sm text-foreground">{activeEvents[0].title}</div>
              <div className="mt-2 text-xs text-muted-foreground">{activeEvents[0].participantCount} participants · Ends {new Date(activeEvents[0].endsAt).toLocaleDateString()}</div>
            </div>
          ) : null}

          {upcomingEvents[0] ? (
            <div className="mwz-hud-frame p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TacticalTag label="Upcoming" tone="default" />
                <TacticalTag label={formatLabel(upcomingEvents[0].type)} tone="default" />
              </div>
              <div className="mt-3 font-retro text-sm text-foreground">{upcomingEvents[0].title}</div>
              <div className="mt-2 text-xs text-muted-foreground">Starts {new Date(upcomingEvents[0].startsAt).toLocaleDateString()} · {upcomingEvents[0].participantCount} participants</div>
            </div>
          ) : null}

          {season.entries.length ? (
            <div className="mwz-hud-frame p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TacticalTag label={formatSeasonState(season.state)} tone={season.state === "live" ? "success" : season.state === "playoffs" ? "hot" : "default"} />
                <TacticalTag label={`Week ${season.week}`} tone="default" />
              </div>
              <div className="mt-3 font-retro text-sm text-foreground">{season.label}</div>
              <div className="mt-2 text-xs text-muted-foreground">Leader {leadLeagueEntry?.tokenName ?? "TBD"} · Prize pool {formatUsd(season.rewardPoolUsd)}</div>
            </div>
          ) : null}

          {!activeEvents[0] && !upcomingEvents[0] && !season.entries.length ? (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {eventSource === "empty" && leagueSource === "empty"
                ? "Events and league data are not available right now."
                : "No active events or league standings are available right now."}
            </div>
          ) : null}
        </div>
      </section>
      </ContentContainer>
    </>
  );
};

export default Arena;
