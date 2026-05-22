import { Link } from "react-router-dom";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
import { getMockTokenRouteById } from "@/features/postgrad/mockRegistry";
import type { ArenaCampaignRailItem } from "@/hooks/useArenaCampaignFeed";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import { useMockLeagueSeason } from "@/hooks/useMockLeagueRuntime";

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

function LeagueEntrantCard({ item }: { item: ArenaCampaignRailItem }) {
  return (
    <div className="min-w-[250px] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(9,10,14,0.96))] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TacticalTag label={item.rankLabel} tone="hot" />
        <TacticalTag label={item.statusLabel} tone={item.statusTone} />
      </div>
      <div className="mt-3 text-base font-semibold text-white">{item.title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.24em] text-white/45">{item.symbol}</div>
      <div className="mt-3 text-xs text-white/60">{item.detail}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={item.href}>Token details</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`/war-room?search=${encodeURIComponent(item.symbol || item.title)}`}>War Room</Link>
        </Button>
      </div>
    </div>
  );
}

const PostGradLeague = () => {
  const { season, history, advanceLeagueWeek, cycleMockLeagueState, rebalanceLeagueDivisions } = useMockLeagueSeason();
  const { railItems: leagueEntrants, hasRealCampaigns, loading: leagueEntrantsLoading } = useArenaCampaignFeed(10);
  const leadEntry = season.entries[0];
  const promotedCount = season.entries.filter((entry) => entry.movement === "promoted").length;
  const relegatedCount = season.entries.filter((entry) => entry.movement === "relegated").length;

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(5,6,9,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Arena leagues</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Season standings, movement, and reward pool context.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">Track the current table, see who is moving up or down, and keep the season reward pool in view as the league cycle advances.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={season.label} tone="sponsored" />
            <TacticalTag label={`Week ${season.week}`} tone="default" />
            <TacticalTag label={season.state} tone={stateTone[season.state]} />
            <TacticalTag label={`${hasRealCampaigns ? leagueEntrants.length : 0} entrants`} tone="hot" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Season leader</div>
          <div className="mt-2 text-lg font-semibold text-white">{leadEntry?.tokenName ?? "TBD"}</div>
          <div className="mt-1 text-sm text-white/60">{leadEntry ? `${leadEntry.points} pts · ${leadEntry.symbol}` : "Awaiting standings"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Reward pool</div>
          <div className="mt-2 text-lg font-semibold text-white">{formatUsd(season.rewardPoolUsd)}</div>
          <div className="mt-1 text-sm text-white/60">Resets {new Date(season.resetAt).toLocaleDateString()}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Promotion zone</div>
          <div className="mt-2 text-lg font-semibold text-white">{promotedCount}</div>
          <div className="mt-1 text-sm text-white/60">Tokens currently marked to move up</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Relegation zone</div>
          <div className="mt-2 text-lg font-semibold text-white">{relegatedCount}</div>
          <div className="mt-1 text-sm text-white/60">Tokens currently marked to move down</div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">League entrants</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Memecoins in contention</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">When the live campaign feed is available it appears here, so season seeding and standings can be viewed against the current market lineup.</p>
          </div>
          <TacticalTag label={hasRealCampaigns ? "Campaign feed" : leagueEntrantsLoading ? "Loading" : "Awaiting feed"} tone="success" />
        </div>
        <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
          {hasRealCampaigns ? (
            leagueEntrants.map((item) => <LeagueEntrantCard key={item.id} item={item} />)
          ) : leagueEntrantsLoading ? (
            [0, 1, 2].map((index) => (
              <div key={index} className="min-w-[250px] rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="h-4 w-24 rounded-full bg-white/10" />
                <div className="mt-4 h-5 w-32 rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-44 rounded-full bg-white/10" />
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              League entrants will appear here when the live campaign feed is available.
            </div>
          )}
        </div>
      </section>

      {postGradFlags.mocks ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">League actions</div>
              <div className="mt-2 text-sm text-white/70">Move the season forward, rebalance divisions, or roll into the next state from this page.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={advanceLeagueWeek}>Advance week</Button>
              <Button size="sm" variant="outline" onClick={rebalanceLeagueDivisions}>Rebalance divisions</Button>
              <Button size="sm" variant="outline" onClick={cycleMockLeagueState}>Cycle season state</Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">League table</div>
            <div className="mt-1 text-xl font-semibold text-white">Current season standings</div>
          </div>
          <TacticalTag label={`${season.entries.length} entries`} tone="success" />
        </div>
        <div className="mt-4 space-y-3">
          {season.entries.map((entry, index) => {
            const tokenRoute = getMockTokenRouteById(entry.tokenId);
            return (
              <div key={entry.tokenId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">#{index + 1} {entry.tokenName}</div>
                      <div className="text-xs uppercase tracking-[0.22em] text-white/45">{entry.symbol}</div>
                      <TacticalTag label={entry.division} tone="sponsored" />
                      <TacticalTag label={entry.movement} tone={movementTone[entry.movement]} />
                    </div>
                    <div className="mt-2 text-xs text-white/55">
                      {entry.points} pts · {entry.wins}W / {entry.losses}L · Streak {entry.streak > 0 ? `+${entry.streak}` : entry.streak}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tokenRoute ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={tokenRoute}>Token details</Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/war-room?search=${encodeURIComponent(entry.symbol)}`}>Open in War Room</Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Season archive</div>
            <div className="mt-1 text-xl font-semibold text-white">Completed seasons</div>
          </div>
          <TacticalTag label={`${history.length} stored`} tone="sponsored" />
        </div>
        <div className="mt-4 space-y-3">
          {history.length ? (
            history.map((entry) => (
              <div key={`${entry.seasonId}-${entry.completedAt}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">{entry.label}</div>
                      <TacticalTag label={`Winner ${entry.topTokenSymbol}`} tone="success" />
                    </div>
                    <div className="mt-2 text-xs text-white/55">
                      Archived {new Date(entry.completedAt).toLocaleString()} · Week {entry.week} · Reward pool {formatUsd(entry.rewardPoolUsd)}
                    </div>
                    <div className="mt-2 text-sm text-white/70">Top finisher: {entry.topTokenName}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              Completed seasons will appear here after rollover.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default PostGradLeague;
