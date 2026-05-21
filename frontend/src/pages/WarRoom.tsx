import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RankingsPanel, TacticalHint, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
import { arenaRankings } from "@/features/postgrad/mockRegistry";
import { useMockWarRoomState } from "@/hooks/useMockWarRoomRuntime";

const sortLabels = {
  heat: "Heat",
  volume: "Volume",
  holders: "Holders",
  watchers: "Watchers",
} as const;

const liquidityOptions = [0, 100000, 250000, 400000] as const;

const WarRoom = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { filters, tokens, watchlistTokenIds, setMockWarRoomFilters, toggleMockWarRoomWatchlist, resetMockWarRoomRuntime } = useMockWarRoomState();

  useEffect(() => {
    const search = searchParams.get("search");
    if (search && search !== filters.search) {
      setMockWarRoomFilters({ search });
    }
  }, [filters.search, searchParams, setMockWarRoomFilters]);

  const filtered = useMemo(() => {
    return tokens
      .filter((token) => {
        const matchesSearch = !filters.search || `${token.name} ${token.symbol}`.toLowerCase().includes(filters.search.toLowerCase());
        const matchesWatchlist = !filters.watchlistOnly || token.watched;
        const matchesLiquidity = token.liquidityUsd >= filters.minimumLiquidityUsd;
        return matchesSearch && matchesWatchlist && matchesLiquidity;
      })
      .sort((left, right) => {
        switch (filters.sort) {
          case "volume": {
            const leftBattleVolume = left.relatedBattleId ? 1 : 0;
            const rightBattleVolume = right.relatedBattleId ? 1 : 0;
            return rightBattleVolume - leftBattleVolume || right.liquidityUsd - left.liquidityUsd;
          }
          case "holders":
            return right.holders - left.holders;
          case "watchers":
            return right.effectiveWatchlistCount - left.effectiveWatchlistCount;
          case "heat":
          default: {
            const heatScore = (token: typeof left) => (token.sentiment === "heating_up" ? 3 : token.sentiment === "volatile" ? 2 : 1);
            return heatScore(right) - heatScore(left) || right.marketCapUsd - left.marketCapUsd;
          }
        }
      });
  }, [filters, tokens]);

  const setSearch = (value: string) => {
    setMockWarRoomFilters({ search: value });
    const next = new URLSearchParams(searchParams);
    if (value) next.set("search", value);
    else next.delete("search");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,14,20,0.94),rgba(4,6,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Trade room scaffold</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">War Room search, filters, and intel foundation.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">The War Room now keeps its own mock runtime for filters and watchlists, which makes frontend QA feel much closer to the real daily workflow we want to simplify later.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={`${filtered.length} visible`} tone="success" />
            <TacticalTag label={`${watchlistTokenIds.length} watched`} tone="sponsored" />
            <TacticalHint label="Next backend" body="The runtime mirrors the filter and watchlist contract closely, so we can replace it with indexed APIs later without changing the page behavior much." />
            {postGradFlags.mocks ? (
              <Button variant="outline" size="sm" onClick={resetMockWarRoomRuntime}>
                Reset War Room
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Filters</div>
                <h2 className="mt-1 text-xl font-semibold text-white">Watch, scan, and queue targets</h2>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-black/30"
                  checked={filters.watchlistOnly}
                  onChange={(event) => setMockWarRoomFilters({ watchlistOnly: event.target.checked })}
                />
                Watchlist only
              </label>
            </div>

            <input
              value={filters.search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search graduated tokens"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
            />

            <div className="flex flex-wrap gap-2">
              {Object.entries(sortLabels).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filters.sort === value ? "default" : "outline"}
                  onClick={() => setMockWarRoomFilters({ sort: value as typeof filters.sort })}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {liquidityOptions.map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filters.minimumLiquidityUsd === value ? "default" : "outline"}
                  onClick={() => setMockWarRoomFilters({ minimumLiquidityUsd: value })}
                >
                  {value === 0 ? "All liquidity" : `$${Math.round(value / 1000)}K+ liquidity`}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filtered.map((token) => (
              <div key={token.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <Link to={postGradFlags.mocks ? `/arena/token/${token.id}` : "/arena"} className="block rounded-xl transition-colors hover:bg-white/5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{token.name}</div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/45">{token.symbol}</div>
                        {token.watched ? <TacticalTag label="Watched" tone="success" /> : null}
                        {token.relatedBattleId ? <TacticalTag label="Battle linked" tone="hot" /> : null}
                      </div>
                      <div className="mt-2 text-xs text-white/55">
                        MC ${(token.marketCapUsd / 1000000).toFixed(2)}M · Liquidity ${(token.liquidityUsd / 1000).toFixed(0)}K · Holders {token.holders.toLocaleString()} · Watchlists {token.effectiveWatchlistCount.toLocaleString()}
                      </div>
                      <div className="mt-2 text-sm text-white/70">{token.thesis}</div>
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button size="sm" variant={token.watched ? "default" : "outline"} onClick={() => toggleMockWarRoomWatchlist(token.id)}>
                      {token.watched ? "Remove watch" : "Watch token"}
                    </Button>
                    {token.relatedBattleId ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/battle/${token.relatedBattleId}`}>Open battle</Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/arena/token/${token.id}`}>Open token</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
                No mock tokens match the current filters.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <RankingsPanel payload={arenaRankings[1]} icon="trophy" />
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Battle intel payload</div>
            <div className="mt-2 font-semibold text-white">Prepared for quick trade integration</div>
            <div className="mt-3 space-y-2 text-white/65">
              <div>Watchlists now persist across the mock post-grad routes.</div>
              <div>Search can be deep-linked into the War Room from token pages.</div>
              <div>Sorting and liquidity thresholds now behave like a real operator surface.</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default WarRoom;
