import { useEffect, useMemo, useRef, useState } from "react";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { CampaignCard, CampaignCardVM } from "./CampaignCard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";

function formatCompactUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  const fmt = (v: number, suffix: string) => {
    const decimals = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${sign}$${v.toFixed(decimals)}${suffix}`;
  };

  if (abs >= 1e12) return fmt(abs / 1e12, "T");
  if (abs >= 1e9) return fmt(abs / 1e9, "B");
  if (abs >= 1e6) return fmt(abs / 1e6, "M");
  if (abs >= 1e3) return fmt(abs / 1e3, "K");
  const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `${sign}$${abs.toFixed(decimals)}`;
}

export type FeedTabKey = "trending" | "new" | "ending" | "dex";

export type HomeQuery = {
  tab: FeedTabKey;
  // UI filters (bound to fields we can derive immediately from existing feed/stats)
  status?: "all" | "live" | "graduated";
  mcapMinUsd?: number;
  mcapMaxUsd?: number;
  progressMinPct?: number;
  progressMaxPct?: number;

  // Future-ready (no-op until campaign categories exist in the feed)
  category?: string;

  // UI sort key. "default" means tab-defined behavior.
  sort?:
    | "default"
    | "mcap_desc"
    | "mcap_asc"
    | "votes_desc"
    | "progress_desc"
    | "created_desc"
    | "created_asc";
  timeFilter?: "1h" | "24h" | "7d" | "all";
  search?: string;
};

type Hydrated = {
  base: CampaignInfo;
  vm: CampaignCardVM;
  // used for client-side sorting
  progressPct?: number | null;
  etaToGraduationSec?: number | null;
  marketCapUsd?: number | null;
  status?: "live" | "graduated";
};

function safeUnixSeconds(ts: any): number | null {
  if (ts == null) return null;
  if (typeof ts === "number" && Number.isFinite(ts)) {
    // if it's ms, convert
    return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  }
  if (typeof ts === "string") {
    const asNum = Number(ts);
    if (Number.isFinite(asNum) && asNum > 0) return asNum > 1e12 ? Math.floor(asNum / 1000) : Math.floor(asNum);
    const ms = Date.parse(ts);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return null;
}

async function fetchVoteCounts(chainId: number, addrs: string[]) {
  if (!addrs.length) return {} as Record<string, any>;
  const qs = encodeURIComponent(addrs.join(","));
  const r = await fetch(`/api/vote_counts?chainId=${chainId}&campaigns=${qs}`);
  const j = await r.json();
  return (j?.counts ?? {}) as Record<string, { votes24h?: number }>;
}

export function CampaignGrid({ className, query }: { className?: string; query: HomeQuery }) {
  const {
    activeChainId,
    fetchCampaignsCount,
    fetchCampaignPage,
    fetchCampaignSummary,
  } = useLaunchpad();

  const { price: bnbUsd } = useBnbUsdPrice(true);

  const PAGE_SIZE = 24;

  const [items, setItems] = useState<Hydrated[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset on tab/filter/search changes.
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const t = await fetchCampaignsCount();
        if (!mounted) return;
        setTotal(t);
        if (t <= 0) {
          setItems([]);
          setNextOffset(null);
          return;
        }

        // Start from newest campaigns.
        const offset = Math.max(0, t - PAGE_SIZE);
        const page = await fetchCampaignPage(offset, PAGE_SIZE, { newestFirst: true });
        if (!mounted) return;

        const hydrated = await hydratePage(page);
        if (!mounted) return;

        setItems(hydrated);
        setNextOffset(offset > 0 ? Math.max(0, offset - PAGE_SIZE) : null);
        setLastUpdatedAt(Date.now());
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load campaigns");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChainId, bnbUsd, query.tab, query.category, query.sort, query.timeFilter, query.search, query.status, query.mcapMinUsd, query.mcapMaxUsd, query.progressMinPct, query.progressMaxPct]);

  // Infinite scroll observer.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "800px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentinelRef.current, nextOffset, loadingMore, loading, query.tab]);

  const hydratePage = async (page: CampaignInfo[]): Promise<Hydrated[]> => {
    const pageAddrs = page.map((c) => String(c.campaign ?? "").toLowerCase()).filter(Boolean);
    const voteCounts = await fetchVoteCounts(activeChainId, pageAddrs);

    const queue = page.slice();
    const out: Hydrated[] = [];

    const workers = Array.from({ length: 4 }).map(async () => {
      while (queue.length) {
        const c = queue.shift();
        if (!c) return;
        const addr = String(c.campaign ?? "").toLowerCase();

        const vm: CampaignCardVM = {
          campaignAddress: addr,
          name: c.name ?? "Unknown",
          symbol: c.symbol ?? "",
          logoURI: c.logoURI || undefined,
          creator: c.creator || undefined,
          createdAt: c.createdAt,
          votes24h: Number(voteCounts[addr]?.votes24h ?? 0),
        };

        try {
          const summary = await fetchCampaignSummary(c);
          const mcBnb = (summary as any)?.stats?.marketCapBnb ?? null;
          const mcUsd = (mcBnb != null && bnbUsd && Number.isFinite(Number(bnbUsd))) ? Number(mcBnb) * Number(bnbUsd) : null;
          vm.marketCapUsdLabel = mcUsd != null ? formatCompactUsd(mcUsd) : null;
          vm.athLabel = vm.marketCapUsdLabel;
          const sold = Number((summary as any)?.metrics?.sold ?? 0);
          const target = Number((summary as any)?.metrics?.graduationTarget ?? 0);
          const progressPct = target > 0 ? Math.min(100, Math.max(0, (sold / target) * 100)) : null;
          vm.progressPct = progressPct;

          // DEX tab truth condition: must be provided as a single boolean from backend.
          // Prefer stats.isDexTrading / metrics.isDexTrading; fall back to legacy metrics.launched.
          vm.isDexTrading = Boolean((summary as any)?.stats?.isDexTrading ?? (summary as any)?.metrics?.isDexTrading ?? (summary as any)?.metrics?.launched);

          // "Ending Soon" definition: estimate time-to-graduation from current velocity.
          // We only have aggregate progress, so we approximate velocity using sold / max(age, 10m), capped to 6h.
          const createdAtSec = safeUnixSeconds(c.createdAt);
          const nowSec = Math.floor(Date.now() / 1000);
          const ageSecRaw = createdAtSec ? Math.max(60, nowSec - createdAtSec) : null;
          const ageSec = ageSecRaw == null ? null : Math.min(Math.max(ageSecRaw, 600), 6 * 3600);
          const remaining = Math.max(0, target - sold);
          const velocity = ageSec && ageSec > 0 ? sold / ageSec : 0;
          const eta = velocity > 0 ? remaining / velocity : null;

          const status: "live" | "graduated" = (summary as any)?.metrics?.launched ? "graduated" : "live";
          out.push({ base: c, vm, progressPct, etaToGraduationSec: eta, marketCapUsd: mcUsd, status });
        } catch {
          out.push({ base: c, vm, progressPct: null, etaToGraduationSec: null, marketCapUsd: null, status: "live" });
        }
      }
    });

    await Promise.allSettled(workers);

    // Keep deterministic order based on original page ordering.
    const index = new Map(page.map((c, i) => [String(c.campaign ?? "").toLowerCase(), i]));
    out.sort((a, b) => (index.get(a.vm.campaignAddress) ?? 0) - (index.get(b.vm.campaignAddress) ?? 0));
    return out;
  };

  const loadMore = async () => {
    if (loading || loadingMore) return;
    if (nextOffset === null) return;

    setLoadingMore(true);
    try {
      const page = await fetchCampaignPage(nextOffset, PAGE_SIZE, { newestFirst: true });
      const hydrated = await hydratePage(page);
      setItems((prev) => [...prev, ...hydrated]);
      setNextOffset(nextOffset > 0 ? Math.max(0, nextOffset - PAGE_SIZE) : null);
      setLastUpdatedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load more campaigns");
    } finally {
      setLoadingMore(false);
    }
  };

  // Apply client-side search filter (fast) on hydrated items.
  const filtered = useMemo(() => {
    const s = String(query.search ?? "").trim().toLowerCase();
    let arr = items;
    if (s) {
      arr = arr.filter((x) => {
        const n = String(x.vm.name ?? "").toLowerCase();
        const sym = String(x.vm.symbol ?? "").toLowerCase();
        const ca = String(x.vm.campaignAddress ?? "").toLowerCase();
        return n.includes(s) || sym.includes(s) || ca.includes(s);
      });
    }

    if (query.tab === "dex") {
      arr = arr.filter((x) => Boolean(x.vm.isDexTrading));
    }

    // Status filter
    const status = query.status ?? "all";
    if (status !== "all") {
      arr = arr.filter((x) => (x.status ?? "live") === status);
    }

    // Market cap (USD) range filter
    const minMc = typeof query.mcapMinUsd === "number" ? query.mcapMinUsd : null;
    const maxMc = typeof query.mcapMaxUsd === "number" ? query.mcapMaxUsd : null;
    if (minMc != null || maxMc != null) {
      arr = arr.filter((x) => {
        const mc = x.marketCapUsd;
        if (mc == null) return false;
        if (minMc != null && mc < minMc) return false;
        if (maxMc != null && mc > maxMc) return false;
        return true;
      });
    }

    // Progress % range filter
    const minP = typeof query.progressMinPct === "number" ? query.progressMinPct : null;
    const maxP = typeof query.progressMaxPct === "number" ? query.progressMaxPct : null;
    if (minP != null || maxP != null) {
      arr = arr.filter((x) => {
        const p = x.progressPct;
        if (p == null) return false;
        if (minP != null && p < minP) return false;
        if (maxP != null && p > maxP) return false;
        return true;
      });
    }

    // Sorting
    const sortKey = query.sort ?? "default";

    const tabSort = (input: Hydrated[]) => {
      if (query.tab === "ending") {
        // Sort by ETA ascending; tie-breaker: higher progress first.
        return input.slice().sort((a, b) => {
          const ea = a.etaToGraduationSec;
          const eb = b.etaToGraduationSec;
          const aInf = ea == null ? Number.POSITIVE_INFINITY : ea;
          const bInf = eb == null ? Number.POSITIVE_INFINITY : eb;
          if (aInf !== bInf) return aInf - bInf;
          return Number(b.progressPct ?? 0) - Number(a.progressPct ?? 0);
        });
      }

      if (query.tab === "trending") {
        // Heuristic: vote velocity proxy (24h votes). Replace with backend score later.
        return input.slice().sort((a, b) => Number(b.vm.votes24h ?? 0) - Number(a.vm.votes24h ?? 0));
      }

      if (query.tab === "new") {
        return input.slice().sort((a, b) => {
          const aT = safeUnixSeconds(a.base.createdAt);
          const bT = safeUnixSeconds(b.base.createdAt);
          return Number(bT ?? 0) - Number(aT ?? 0);
        });
      }

      return input;
    };

    if (sortKey === "default") {
      arr = tabSort(arr);
    } else {
      arr = arr.slice().sort((a, b) => {
        switch (sortKey) {
          case "mcap_desc":
            return Number(b.marketCapUsd ?? -1) - Number(a.marketCapUsd ?? -1);
          case "mcap_asc":
            return Number(a.marketCapUsd ?? Number.POSITIVE_INFINITY) - Number(b.marketCapUsd ?? Number.POSITIVE_INFINITY);
          case "votes_desc":
            return Number(b.vm.votes24h ?? 0) - Number(a.vm.votes24h ?? 0);
          case "progress_desc":
            return Number(b.progressPct ?? -1) - Number(a.progressPct ?? -1);
          case "created_desc": {
            const aT = safeUnixSeconds(a.base.createdAt);
            const bT = safeUnixSeconds(b.base.createdAt);
            return Number(bT ?? 0) - Number(aT ?? 0);
          }
          case "created_asc": {
            const aT = safeUnixSeconds(a.base.createdAt);
            const bT = safeUnixSeconds(b.base.createdAt);
            return Number(aT ?? Number.POSITIVE_INFINITY) - Number(bT ?? Number.POSITIVE_INFINITY);
          }
          default:
            return 0;
        }
      });
    }

    return arr;
  }, [items, query.search, query.tab, query.status, query.mcapMinUsd, query.mcapMaxUsd, query.progressMinPct, query.progressMaxPct, query.sort]);

  const updatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return "—";
    const secs = Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000));
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  }, [lastUpdatedAt]);

  return (
    <div className={cn("w-full", className)}>
      {/* Results meta */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <div>
          Showing <span className="text-foreground/90 font-semibold">{filtered.length}</span> campaigns
          <span className="opacity-70"> • Loaded {items.length}</span>
          {total ? <span className="opacity-70"> • Total {total}</span> : null}
        </div>
        <div className="opacity-70">Updated {updatedLabel} ago</div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[340px] rounded-2xl border border-border/40 bg-card/40 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="py-10 text-center">
          <div className="text-sm text-muted-foreground">{error}</div>
          <div className="mt-4">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No campaigns yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((x) => (
              <CampaignCard
                key={x.vm.campaignAddress}
                vm={x.vm}
                chainIdForStorage={activeChainId}
              />
            ))}
          </div>

          {/* sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-10" />
          {loadingMore ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading more…</div>
          ) : null}
        </>
      )}
    </div>
  );
}
