import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, Shield, Sparkles, Swords, Zap } from "lucide-react";
import { fetchArenaOverview, type ArenaFeedItem, type ArenaOverviewResponse, type ArenaSummaryItem } from "@/lib/arenaApi";
import { ArenaSubnav } from "@/components/arena/ArenaSubnav";

function TokenRail({ title, icon: Icon, items, empty }: { title: string; icon: typeof Sparkles; items: ArenaFeedItem[]; empty: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold md:text-base">{title}</h2>
      </div>

      {items.length ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {items.map((item) => (
            <Link
              key={`${title}:${item.campaignAddress}`}
              to={`/token/${item.campaignAddress}`}
              className="min-w-[250px] rounded-2xl border border-border/50 bg-card/55 p-4 backdrop-blur-sm transition-colors hover:border-accent/45 hover:bg-card/70"
            >
              <div className="flex items-start gap-3">
                <img
                  src={item.logoUri || "/placeholder.svg"}
                  alt={item.symbol}
                  className="h-12 w-12 rounded-full border border-border/50 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.symbol || item.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.name}</div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span>{item.votes24h != null ? `${item.votes24h} votes` : "Watching"}</span>
                    <span>{item.marketcapBnb ? `${item.marketcapBnb} BNB MC` : "Live"}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-6 text-sm text-muted-foreground">
          {empty}
        </div>
      )}
    </section>
  );
}

function SummaryLane({ title, icon: Icon, items, empty }: { title: string; icon: typeof Sparkles; items: ArenaSummaryItem[]; empty: string }) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card/45 p-4 backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold md:text-base">{title}</h3>
      </div>

      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={`${title}:${item.id}`}
              to={item.href}
              className="block rounded-2xl border border-border/50 bg-background/20 px-4 py-3 transition-colors hover:border-accent/45 hover:bg-card/65"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  {item.meta ? <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div> : null}
                </div>
                {item.status ? <span className="text-[11px] uppercase tracking-[0.12em] text-accent">{item.status}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 bg-background/20 px-4 py-6 text-sm text-muted-foreground">
          {empty}
        </div>
      )}
    </section>
  );
}

export default function ArenaOverview() {
  const [data, setData] = useState<ArenaOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const next = await fetchArenaOverview();
        if (!cancelled) setData(next);
      } catch (err) {
        console.error("[ArenaOverview] failed to load", err);
        if (!cancelled) setError("Arena overview is not available right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const laneItems = useMemo(() => {
    return {
      live: data?.liveBattles ?? [],
      open: data?.openForBattle ?? [],
      summary: data?.eventsAndLeagues ?? [],
    };
  }, [data]);

  return (
    <div className="min-h-full pt-16 md:pt-16">
      <ArenaSubnav />

      <section className="mb-6 overflow-hidden rounded-[28px] border border-border/60 bg-[linear-gradient(135deg,rgba(28,33,39,0.92),rgba(16,18,22,0.96))] p-5 backdrop-blur-sm md:p-7">
        <div className="max-w-3xl">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-accent">Arena</div>
          <h1 className="text-2xl font-semibold md:text-4xl">Competition discovery without a second token page.</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Sponsored placements, featured momentum, and the live competition lanes all point back to the canonical token page.
          </p>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-border/50 bg-card/35 px-4 py-8 text-sm text-muted-foreground">Loading Arena…</div>
      ) : error ? (
        <div className="rounded-2xl border border-border/50 bg-card/35 px-4 py-8 text-sm text-muted-foreground">{error}</div>
      ) : (
        <div className="space-y-6">
          <TokenRail
            title="Sponsored"
            icon={Shield}
            items={data?.sponsored ?? []}
            empty="Sponsored placements will appear here as soon as that feed is wired."
          />

          <TokenRail
            title="Featured"
            icon={Sparkles}
            items={data?.featured ?? []}
            empty="Featured campaigns are waiting on enough UpVote data to rank."
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <SummaryLane
              title="Live Battles"
              icon={Swords}
              items={laneItems.live.map((item) => ({
                id: item.campaignAddress,
                label: item.symbol || item.name,
                href: `/token/${item.campaignAddress}`,
                status: item.status || "Live",
                meta: item.name,
              }))}
              empty="No live battles are published yet."
            />

            <SummaryLane
              title="Open for Battle"
              icon={Zap}
              items={laneItems.open.map((item) => ({
                id: item.campaignAddress,
                label: item.symbol || item.name,
                href: `/token/${item.campaignAddress}`,
                status: item.status || "Open",
                meta: item.name,
              }))}
              empty="Creator battle listings will appear here once the battle status endpoint lands."
            />

            <SummaryLane
              title="Events and Leagues"
              icon={LayoutGrid}
              items={laneItems.summary}
              empty="Leagues and live events will populate here as those feeds come online."
            />
          </div>
        </div>
      )}
    </div>
  );
}
