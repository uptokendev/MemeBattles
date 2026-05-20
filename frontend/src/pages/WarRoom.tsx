import { useMemo, useState } from "react";
import { RankingsPanel, TacticalHint, TacticalTag, TokenIntelRow } from "@/components/postgrad/PostGradPrimitives";
import { arenaRankings, defaultTradeRoomFilters, featuredTokens } from "@/features/postgrad/mockData";

const WarRoom = () => {
  const [search, setSearch] = useState(defaultTradeRoomFilters.search);
  const [watchlistOnly, setWatchlistOnly] = useState(defaultTradeRoomFilters.watchlistOnly);

  const filtered = useMemo(() => {
    return featuredTokens.filter((token) => {
      const matchesSearch = !search || `${token.name} ${token.symbol}`.toLowerCase().includes(search.toLowerCase());
      const matchesWatchlist = !watchlistOnly || token.tacticalTags.includes("Featured") || token.tacticalTags.includes("League Climber");
      return matchesSearch && matchesWatchlist;
    });
  }, [search, watchlistOnly]);

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,14,20,0.94),rgba(4,6,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Trade room scaffold</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">War Room search, filters, and intel foundation.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This is the additive shell for the future battle-intel work: filters, watchlists, token rows, and ranking context are in place so we can land real APIs later without reworking layout.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label="Search contract ready" tone="success" />
            <TacticalHint label="Next backend" body="The UI already matches the filter contract. The next step is swapping the mock feed with indexed ranking and watchlist APIs." />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Filters</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Watch, scan, and queue targets</h2>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-black/30" checked={watchlistOnly} onChange={(event) => setWatchlistOnly(event.target.checked)} />
              Watchlist only
            </label>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search graduated tokens"
            className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
          />
          <div className="mt-4 space-y-3">
            {filtered.map((token) => (
              <TokenIntelRow key={token.id} token={token} metricLabel="Intel" metricValue={token.tacticalTags.join(" · ") || "Stable"} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <RankingsPanel payload={arenaRankings[1]} icon="trophy" />
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Battle intel payload</div>
            <div className="mt-2 font-semibold text-white">Prepared for quick trade integration</div>
            <ul className="mt-3 space-y-2 text-white/65">
              <li>Holder growth and trader counts already fit the token intel rows.</li>
              <li>Search and watchlist state are ready for persistence when the API lands.</li>
              <li>Mobile-first filters stay compact enough for later quick-trade actions.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};

export default WarRoom;
