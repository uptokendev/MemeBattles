import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { cn } from "@/lib/utils";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/types/launchpad";
import { ChevronLeft, ChevronRight, Flame, ThumbsUp } from "lucide-react";
import { AthBar } from "@/components/token/AthBar";

type FeaturedItemApi = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  name?: string | null;
  symbol?: string | null;
  logoUri?: string | null;
  createdAtChain?: string | null;
  graduatedAtChain?: string | null;
  votes24h?: number | null;
  votesAllTime?: number | null;
};

function timeAgoFromUnix(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - seconds);
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function FeaturedCampaigns({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { activeChainId, fetchCampaignCardStats } = useLaunchpad();

  const [items, setItems] = useState<FeaturedItemApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load top-20 by votes in last 24h; tie-break handled in SQL (votes_24h).
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/featured?chainId=${activeChainId}&sort=24h&limit=20`);
        const j = await r.json();
        if (!mounted) return;
        setItems(Array.isArray(j.items) ? j.items : []);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Failed to load featured");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeChainId]);

  // Pull on-chain card stats (market cap / launched) with a light debounce.
  const [statsByCampaign, setStatsByCampaign] = useState<Record<string, { marketCapUsdLabel?: string | null }>>({});

  useEffect(() => {
    let mounted = true;
    if (!items.length) return;

    const load = async () => {
      const next: Record<string, { marketCapUsdLabel?: string | null }> = {};
      // Small concurrency to avoid RPC spikes.
      const queue = items.slice(0, 20);
      const workers = Array.from({ length: 4 }).map(async () => {
        while (queue.length) {
          const it = queue.shift();
          if (!it) return;
          const addr = String(it.campaignAddress ?? "").toLowerCase();
          if (!addr) continue;

          const ci: CampaignInfo = {
            id: 0,
            campaign: addr,
            token: String(it.tokenAddress ?? ""),
            creator: String(it.creatorAddress ?? ""),
            name: String(it.name ?? ""),
            symbol: String(it.symbol ?? ""),
            logoURI: it.logoUri ?? undefined,
            xAccount: "",
            website: "",
            extraLink: "",
            createdAt: it.createdAtChain ? Math.floor(new Date(it.createdAtChain).getTime() / 1000) : undefined,
          };

          try {
            const r = await fetchCampaignCardStats(ci);
            // We already have compact formatting helper; marketCap in stats is string.
            // NOTE: marketCapBnb->USD is handled on the main grid; featured keeps it simple for now.
            const mc = r?.stats?.marketCap ?? null;
            next[addr] = { marketCapUsdLabel: mc ? `$${mc}` : null };
          } catch {
            next[addr] = { marketCapUsdLabel: null };
          }
        }
      });

      await Promise.allSettled(workers);
      if (!mounted) return;
      setStatsByCampaign((prev) => ({ ...prev, ...next }));
    };

    const t = window.setTimeout(load, 120);
    return () => {
      mounted = false;
      window.clearTimeout(t);
    };
  }, [items, fetchCampaignCardStats]);

  const cards = useMemo(() => {
    return items.map((it, idx) => {
      const addr = String(it.campaignAddress ?? "").toLowerCase();
      const createdAt = it.createdAtChain ? Math.floor(new Date(it.createdAtChain).getTime() / 1000) : undefined;
      const votes24h = Number(it.votes24h ?? 0);
      return {
        idx: idx + 1,
        addr,
        name: String(it.name ?? "Unknown"),
        symbol: String(it.symbol ?? ""),
        createdAt,
        votes24h,
      };
    });
  }, [items]);

  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(280, Math.floor(el.clientWidth * 0.8));
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <ThumbsUp className="h-4 w-4 text-accent" />
            UpVote Campaigns
          </div>
          <div className="text-xs text-muted-foreground">Top 20 (last 24h)</div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => scrollByCards("left")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => scrollByCards("right")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 pr-2 snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: "none" } as any}
        >
          {loading && !cards.length ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="snap-start min-w-[260px] md:min-w-[280px] h-[154px] rounded-2xl border border-border/40 bg-card/40 animate-pulse"
              />
            ))
          ) : err ? (
            <div className="text-sm text-muted-foreground py-8">{err}</div>
          ) : cards.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8">No featured campaigns yet.</div>
          ) : (
            cards.map((c) => (
              <div
                key={c.addr}
                className="snap-start min-w-[260px] md:min-w-[280px] rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-accent/50 transition-colors"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/token/${c.addr}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") navigate(`/token/${c.addr}`);
                }}
              >
                <div className="p-4 flex items-start gap-3">
                  <div className="relative">
                    <img
                      src="/assets/profile_placeholder.png"
                      alt="Creator"
                      className="w-12 h-12 rounded-xl object-cover border border-border/60"
                      draggable={false}
                    />
                    <div className="absolute -top-2 -left-2 h-7 min-w-7 px-2 flex items-center justify-center rounded-full bg-card border-2 border-emerald-400 text-xs font-bold text-emerald-400">
                      {c.idx}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.symbol ? `$${c.symbol}` : ""}</div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-accent">
                        <Flame className="h-4 w-4" />
                        <span className="font-semibold">{c.votes24h}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">{timeAgoFromUnix(c.createdAt)}</div>
                      <div className="flex items-center gap-2">
                          <div onClick={(e) => e.stopPropagation()}>
                            <UpvoteDialog campaignAddress={c.addr} />
                          </div>
                        <Button
                          size="sm"
                          className="bg-accent hover:bg-accent/90 text-accent-foreground font-retro"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/token/${c.addr}`);
                            }}
                        >
                          Buy
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <AthBar
                        currentLabel={statsByCampaign[c.addr]?.marketCapUsdLabel ?? null}
                        storageKey={`ath:${activeChainId}:${c.addr}`}
                        className="text-[10px]"
                        barWidthPx={230}
                        barMaxWidth="100%"
                      />
                    </div>
                  </div>
                </div>

              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
