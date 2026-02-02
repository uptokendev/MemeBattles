import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { cn } from "@/lib/utils";
import { useLaunchpad } from "@/lib/launchpadClient";
import { ChevronLeft, ChevronRight, Flame, ThumbsUp } from "lucide-react";
import { AthBar } from "@/components/token/AthBar";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";

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
  marketcapBnb?: string | null;
};

function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
  return fmt.format(value);
}

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

const FALLBACK_LOGOS = ["/placeholder.svg"];

function pickFallbackLogo(seed: string): string {
  // deterministic index based on address
  let acc = 0;
  for (let i = 0; i < seed.length; i++) acc = (acc + seed.charCodeAt(i)) % 9973;
  return FALLBACK_LOGOS[acc % FALLBACK_LOGOS.length];
}

export function FeaturedCampaigns({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { activeChainId } = useLaunchpad();
  const { price: bnbUsd } = useBnbUsdPrice(true);

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

  const cards = useMemo(() => {
    return items.map((it, idx) => {
      const addr = String(it.campaignAddress ?? "").toLowerCase();
      const createdAt = it.createdAtChain ? Math.floor(new Date(it.createdAtChain).getTime() / 1000) : undefined;
      const votes24h = Number(it.votes24h ?? 0);
      const mcapBnb = Number(it.marketcapBnb ?? NaN);
      const mcapUsdLabel = Number.isFinite(mcapBnb) && bnbUsd ? formatCompactUsd(mcapBnb * bnbUsd) : null;
      const image = String(it.logoUri ?? "").trim() || pickFallbackLogo(addr);

return {
  idx: idx + 1,
  addr,
  name: String(it.name ?? "Unknown"),
  symbol: String(it.symbol ?? ""),
  createdAt,
  votes24h,
  mcapUsdLabel,
  image,
};
    });
  }, [items, bnbUsd]);

  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(280, Math.floor(el.clientWidth * 0.8));
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-0">
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
  className="snap-start min-w-[420px] md:min-w-[520px] h-[168px] rounded-2xl border border-border/40 bg-card/40 animate-pulse"
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
    className="snap-start min-w-[420px] md:min-w-[520px] rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-accent/50 transition-colors"
    role="button"
    tabIndex={0}
    onClick={() => navigate(`/token/${c.addr}`)}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") navigate(`/token/${c.addr}`);
    }}
  >
    {/* Top row: image (square) + data (same height) */}
    <div className="flex h-[168px]">
      {/* Left: token image square */}
      <div className="relative w-[168px] h-[168px] shrink-0 bg-black">
        <img
          src={c.image}
          alt={c.name}
          className="w-full h-full object-cover"
          draggable={false}
        />

        {/* Subtle bottom fade for readability */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Rank badge */}
        <div className="absolute top-2 left-2 h-7 min-w-7 px-2 flex items-center justify-center rounded-full bg-black/60 border-2 border-emerald-400 text-xs font-bold text-emerald-400">
          {c.idx}
        </div>
      </div>

      {/* Right: data panel (same height as image) */}
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        {/* Title */}
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">{c.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {c.symbol ? `$${c.symbol}` : ""}
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-xs text-accent">
            <Flame className="h-4 w-4" />
            <span className="font-semibold">{c.votes24h}</span>
            <span className="text-muted-foreground">/ 24h</span>
          </div>
          <div className="text-xs text-muted-foreground">{timeAgoFromUnix(c.createdAt)} ago</div>
        </div>

        <div>
          <div className="text-[10px] text-muted-foreground">MCap</div>
          <div className="text-sm font-semibold truncate">{c.mcapUsdLabel ?? "—"}</div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end">
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
    </div>

    {/* Bottom row: ATH bar across BOTH halves */}
    <div className="px-3 py-2 bg-black/40 border-t border-border/40">
      <AthBar
        currentLabel={c.mcapUsdLabel ?? null}
        storageKey={`ath:${activeChainId}:${c.addr}`}
        className="text-[10px]"
        barWidthPx={520}
        barMaxWidth="100%"
      />
    </div>
  </div>
))
          )}
        </div>
      </div>
    </div>
  );
}
