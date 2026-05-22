import { Link } from "react-router-dom";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import type { ArenaCampaignRailItem } from "@/hooks/useArenaCampaignFeed";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";
import { useArenaEventFeed } from "@/hooks/useArenaEventFeed";
import { useArenaLeagueFeed } from "@/hooks/useArenaLeagueFeed";
import { getMockTokenRouteById } from "@/features/postgrad/mockRegistry";
import { useMockArenaState } from "@/hooks/useMockArenaRuntime";

function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function ArenaRailCard({
  title,
  symbol,
  detail,
  href,
  badges,
}: {
  title: string;
  symbol: string;
  detail: string;
  href?: string | null;
  badges: Array<{ label: string; tone?: "default" | "hot" | "sponsored" | "success" }>;
}) {
  const content = (
    <div className="min-w-[220px] rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]">
      <div className="flex flex-wrap items-center gap-2">
        {badges.map((badge) => (
          <TacticalTag key={`${title}-${badge.label}`} label={badge.label} tone={badge.tone ?? "default"} />
        ))}
      </div>
      <div className="mt-3 text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/45">{symbol}</div>
      <div className="mt-3 text-xs text-white/60">{detail}</div>
    </div>
  );

  if (!href) return content;

  return (
    <Link to={href} className="block shrink-0">
      {content}
    </Link>
  );
}

function RealCampaignRailCard({ item, badgeTone = "success" }: { item: ArenaCampaignRailItem; badgeTone?: "default" | "hot" | "sponsored" | "success" }) {
  return (
    <ArenaRailCard
      title={item.title}
      symbol={item.symbol}
      detail={item.detail}
      href={item.href}
      badges={[
        { label: item.rankLabel, tone: badgeTone },
        { label: item.statusLabel, tone: item.statusTone },
      ]}
    />
  );
}

const Arena = () => {
  const { liveBattles, openForBattleQueue } = useArenaBattleFeed();
  const { events } = useArenaEventFeed();
  const { season } = useArenaLeagueFeed();
  const { featuredTokens, allTokens } = useMockArenaState();
  const { railItems: realCampaignRailItems, hasRealCampaigns, loading: realCampaignsLoading } = useArenaCampaignFeed(12);

  const sponsoredTokens = allTokens.filter((token) => token.sponsoredPlacement);
  const featuredBySignal = [...featuredTokens].sort((left, right) => right.watchlistCount - left.watchlistCount);
  const activeEvents = events.filter((event) => event.status === "live");
  const upcomingEvents = events.filter((event) => event.status === "scheduled" || event.status === "deploying");
  const leadLeagueEntry = season.entries[0];
  const realSponsored = realCampaignRailItems.slice(0, 4);
  const realFeatured = realCampaignRailItems.slice(4, 10);

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,15,20,0.94),rgba(7,8,11,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Arena overview</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Sponsored memecoins, featured momentum, and live competition.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">Arena keeps the current battle picture in one place: sponsored placements, featured memecoins, live battles, open challenges, and the latest event and league context.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={`${hasRealCampaigns ? realSponsored.length : sponsoredTokens.length} sponsored`} tone="sponsored" />
            <TacticalTag label={`${hasRealCampaigns ? realFeatured.length : featuredBySignal.length} featured`} tone="success" />
            <TacticalTag label={`${liveBattles.length} live battles`} tone="hot" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Sponsored</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Sponsored placements</h2>
          </div>
          <TacticalTag label={hasRealCampaigns ? "Campaign feed" : realCampaignsLoading ? "Loading" : "Arena feed"} tone="sponsored" />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {hasRealCampaigns
            ? realSponsored.map((item) => <RealCampaignRailCard key={item.id} item={item} badgeTone="sponsored" />)
            : sponsoredTokens.map((token) => (
                <ArenaRailCard
                  key={token.id}
                  title={token.name}
                  symbol={token.symbol}
                  detail={`MC ${formatUsd(token.marketCapUsd)} · Liquidity ${formatUsd(token.liquidityUsd)}`}
                  href={getMockTokenRouteById(token.id)}
                  badges={[
                    { label: "Sponsored", tone: "sponsored" },
                    { label: token.battleEligible ? "Battle ready" : "Locked", tone: token.battleEligible ? "success" : "default" },
                  ]}
                />
              ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Featured</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Featured memecoins</h2>
          </div>
          <TacticalTag label={hasRealCampaigns ? "Trending feed" : "Signal ranking"} tone="success" />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {hasRealCampaigns
            ? realFeatured.map((item) => <RealCampaignRailCard key={item.id} item={item} badgeTone="hot" />)
            : featuredBySignal.map((token) => (
                <ArenaRailCard
                  key={token.id}
                  title={token.name}
                  symbol={token.symbol}
                  detail={`${token.watchlistCount.toLocaleString()} signal votes · MC ${formatUsd(token.marketCapUsd)}`}
                  href={getMockTokenRouteById(token.id)}
                  badges={[
                    { label: `Rank ${token.placementIndex != null ? token.placementIndex + 1 : "-"}`, tone: "hot" },
                    { label: token.sentiment === "heating_up" ? "Heating up" : token.sentiment === "volatile" ? "Volatile" : "Stable", tone: token.sentiment === "heating_up" ? "hot" : token.sentiment === "volatile" ? "sponsored" : "success" },
                  ]}
                />
              ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Lane 1</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Live battles</h2>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/arena/battles">Open battles</Link>
            </Button>
          </div>
          {liveBattles.map((battle) => (
            <div key={battle.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TacticalTag label={battle.state.replaceAll("_", " ")} tone="hot" />
                {battle.featured ? <TacticalTag label="Featured" tone="sponsored" /> : null}
              </div>
              <div className="mt-3 text-sm font-semibold text-white">{battle.participants[0].tokenName} vs {battle.participants[1].tokenName}</div>
              <div className="mt-2 text-xs text-white/60">{battle.participants[0].symbol} {battle.participants[0].score.toFixed(1)} · {battle.participants[1].symbol} {battle.participants[1].score.toFixed(1)}</div>
              <div className="mt-4 flex gap-2">
                <Button asChild size="sm">
                  <Link to={`/battle/${battle.id}`}>Open battle</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Lane 2</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Open for battle</h2>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/arena/battles">Creator controls</Link>
            </Button>
          </div>
          {openForBattleQueue.map((battle) => {
            const tokenRoute = getMockTokenRouteById(battle.participants[0].tokenId);
            return (
              <div key={battle.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TacticalTag label="Open for battle" tone="success" />
                  <TacticalTag label={battle.participants[0].symbol} tone="default" />
                </div>
                <div className="mt-3 text-sm font-semibold text-white">{battle.participants[0].tokenName}</div>
                <div className="mt-2 text-xs text-white/60">Waiting for an opponent · Volume {formatUsd(battle.participants[0].volumeUsd)} · Traders {battle.participants[0].uniqueTraders}</div>
                <div className="mt-4 flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/battle/${battle.id}`}>View queue</Link>
                  </Button>
                  {tokenRoute ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={tokenRoute}>Token details</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Lane 3</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Events and leagues</h2>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/arena/events">Events</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/arena/leagues">Leagues</Link>
              </Button>
            </div>
          </div>

          {activeEvents[0] ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TacticalTag label="Active event" tone="success" />
                <TacticalTag label={activeEvents[0].type.replaceAll("_", " ")} tone="sponsored" />
              </div>
              <div className="mt-3 text-sm font-semibold text-white">{activeEvents[0].title}</div>
              <div className="mt-2 text-xs text-white/60">{activeEvents[0].participantCount} participants · Ends {new Date(activeEvents[0].endsAt).toLocaleDateString()}</div>
            </div>
          ) : null}

          {upcomingEvents[0] ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TacticalTag label="Upcoming" tone="default" />
                <TacticalTag label={upcomingEvents[0].type.replaceAll("_", " ")} tone="default" />
              </div>
              <div className="mt-3 text-sm font-semibold text-white">{upcomingEvents[0].title}</div>
              <div className="mt-2 text-xs text-white/60">Starts {new Date(upcomingEvents[0].startsAt).toLocaleDateString()} · {upcomingEvents[0].participantCount} participants</div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <TacticalTag label={season.state} tone={season.state === "live" ? "success" : season.state === "playoffs" ? "sponsored" : "default"} />
              <TacticalTag label={`Week ${season.week}`} tone="default" />
            </div>
            <div className="mt-3 text-sm font-semibold text-white">{season.label}</div>
            <div className="mt-2 text-xs text-white/60">Leader {leadLeagueEntry?.tokenName ?? "TBD"} · Reward pool {formatUsd(season.rewardPoolUsd)}</div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Arena;
