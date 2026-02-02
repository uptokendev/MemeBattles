import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLaunchpad } from "@/lib/launchpadClient";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { CampaignCard, type CampaignCardVM } from "./CampaignCard";
import { resolveImageUri } from "@/lib/media";

export type FeedTabKey = "trending" | "new" | "ending" | "dex";

export type HomeQuery = {
  tab: FeedTabKey;
  status?: "all" | "live" | "graduated";
  mcapMinUsd?: number;
  mcapMaxUsd?: number;
  progressMinPct?: number;
  progressMaxPct?: number;
  category?: string;
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

type CampaignFeedItemApi = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  name?: string | null;
  symbol?: string | null;
  logoUri?: string | null;
  createdAtChain?: string | null;
  graduatedAtChain?: string | null;
  isDexTrading?: boolean;
  marketcapBnb?: string | null;
  votes24h?: number;
  progressPct?: number | null;
  etaSec?: number | null;
};

type CampaignFeedResponse = {
  items: CampaignFeedItemApi[];
  nextCursor: number | null;
  pageSize: number;
  updatedAt?: string;
};

function safeUnixSeconds(ts: any): number | null {
  if (ts == null) return null;
  if (typeof ts === "number" && Number.isFinite(ts)) {
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

function buildQueryString(params: Record<string, any>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    qs.set(k, String(v));
  }
  return qs.toString();
}

async function fetchCampaignFeed(params: Record<string, any>): Promise<CampaignFeedResponse> {
  const qs = buildQueryString(params);
  const r = await fetch(`/api/campaigns?${qs}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? "Failed to load campaigns");
  return j as CampaignFeedResponse;
}

export function CampaignGrid({ className, query }: { className?: string; query: HomeQuery }) {
  const { activeChainId } = useLaunchpad();
  const { price: bnbUsd } = useBnbUsdPrice(true);

  const [items, setItems] = useState<CampaignFeedItemApi[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const baseParams = useMemo(() => {
    return {
      chainId: activeChainId,
      limit: 24,
      tab: query.tab ?? "trending",
      sort: query.sort ?? "default",
      status: query.status ?? "all",
      search: query.search ?? "",

      // Filters that require USD conversion.
      // We pass bnbUsd so the API can filter on marketcap_usd deterministically.
      bnbUsd: bnbUsd ? bnbUsd : null,
      mcapMinUsd: query.mcapMinUsd ?? null,
      mcapMaxUsd: query.mcapMaxUsd ?? null,
      progressMinPct: query.progressMinPct ?? null,
      progressMaxPct: query.progressMaxPct ?? null,
    };
  }, [activeChainId, query, bnbUsd]);

  // Reset + fetch first page whenever the query changes.
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const resp = await fetchCampaignFeed({ ...baseParams, cursor: 0 });
        if (!mounted) return;
        setItems(resp.items ?? []);
        setNextCursor(resp.nextCursor ?? null);
        setLastUpdatedAt(resp.updatedAt ?? null);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Failed to load campaigns");
        setItems([]);
        setNextCursor(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [baseParams]);

  const loadMore = async () => {
    if (loadingMore || loading || nextCursor == null) return;
    setLoadingMore(true);
    try {
      const resp = await fetchCampaignFeed({ ...baseParams, cursor: nextCursor });
      setItems((prev) => [...prev, ...(resp.items ?? [])]);
      setNextCursor(resp.nextCursor ?? null);
      setLastUpdatedAt(resp.updatedAt ?? null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  // Infinite scroll: load next page when sentinel becomes visible.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) loadMore();
        }
      },
      { root: null, rootMargin: "600px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentinelRef.current, nextCursor, loading, loadingMore, baseParams]);

  const vms: CampaignCardVM[] = useMemo(() => {
  return (items || []).map((it) => {
    const mcapBnb = Number(it.marketcapBnb ?? NaN);
    const mcapUsd = Number.isFinite(mcapBnb) && bnbUsd ? mcapBnb * bnbUsd : NaN;
    const marketCapUsdLabel = Number.isFinite(mcapUsd) ? formatCompactUsd(mcapUsd) : null;

    const image =
      (it as any).logoURI ||
      (it as any).logoUri ||
      (it as any).image ||
      "/placeholder.svg";

    return {
      campaignAddress: String(it.campaignAddress ?? "").toLowerCase(),
      name: String(it.name ?? "Unknown"),
      symbol: String(it.symbol ?? ""),
      logoURI: resolveImageUri(image) ?? undefined,
      creator: it.creatorAddress ?? undefined,
      createdAt: safeUnixSeconds(it.createdAtChain ?? null) ?? undefined,
      marketCapUsdLabel,
      athLabel: marketCapUsdLabel,
      progressPct: it.progressPct ?? null,
      isDexTrading: Boolean(it.isDexTrading),
      votes24h: Number(it.votes24h ?? 0),
    } as CampaignCardVM;
  });
}, [items, bnbUsd]);

  const resultsMeta = useMemo(() => {
    const count = vms.length;
    const updated = lastUpdatedAt ? Math.floor((Date.now() - Date.parse(lastUpdatedAt)) / 1000) : null;
    const updatedLabel = updated != null && Number.isFinite(updated) ? `${Math.max(0, updated)}s ago` : "—";
    return `Showing ${count} campaigns • Updated ${updatedLabel}`;
  }, [vms.length, lastUpdatedAt]);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-xs text-muted-foreground">{resultsMeta}</div>
      </div>

      {loading && !vms.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-[320px] rounded-2xl border border-border/40 bg-card/40 animate-pulse"
            />
          ))}
        </div>
      ) : err ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{err}</div>
      ) : vms.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No campaigns yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {vms.map((vm) => (
              <CampaignCard key={vm.campaignAddress} vm={vm} chainIdForStorage={activeChainId} />
            ))}
          </div>

          <div ref={sentinelRef} className="h-12" />

          {loadingMore ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading more…</div>
          ) : nextCursor == null ? (
            <div className="py-6 text-center text-xs text-muted-foreground">End of results</div>
          ) : null}
        </>
      )}
    </div>
  );
}
