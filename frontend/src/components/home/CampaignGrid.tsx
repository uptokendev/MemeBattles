import { useEffect, useMemo, useRef, useState } from "react";
import { Contract } from "ethers";
import { cn } from "@/lib/utils";
import { useLaunchpad } from "@/lib/launchpadClient";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useLeagueRealtime } from "@/hooks/useLeagueRealtime";
import { CampaignCard, type CampaignCardVM } from "./CampaignCard";
import { resolveImageUri } from "@/lib/media";
import { apiFetch } from "@/lib/apiBase";
import { getFactoryAddress } from "@/lib/chainConfig";
import { getReadProvider } from "@/lib/readProvider";
import { isTestnetCampaignsEnabled } from "@/features/postgrad/apiClient";
import { useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";

export type FeedTabKey = "drafts" | "trending" | "new" | "ending" | "dex";

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
  lastActivityAt?: string | null;
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
  source?: string;
};

const LEGACY_FACTORY_ABI = [
  "function campaignsCount() view returns (uint256)",
  "function getCampaignPage(uint256 offset, uint256 limit) view returns ((address campaign,address token,address creator,string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint64 createdAt)[] page)",
] as const;

function safeUnixSeconds(ts: any): number | null {
  if (ts == null) return null;
  if (typeof ts === "number" && Number.isFinite(ts)) return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
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
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
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

function normalizeSearch(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesSearch(item: CampaignFeedItemApi, search: unknown) {
  const q = normalizeSearch(search);
  if (!q) return true;
  return [item.name, item.symbol, item.campaignAddress, item.tokenAddress, item.creatorAddress]
    .map((v) => String(v ?? "").toLowerCase())
    .some((v) => v.includes(q));
}

function mergeCampaignItems(primary: CampaignFeedItemApi[], fallback: CampaignFeedItemApi[]) {
  const map = new Map<string, CampaignFeedItemApi>();
  for (const item of [...fallback, ...primary]) {
    const key = String(item.campaignAddress ?? "").toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    map.set(key, { ...(existing || {}), ...item });
  }
  return Array.from(map.values());
}

async function fetchOnChainCampaignFeed(params: Record<string, any>): Promise<CampaignFeedResponse> {
  const chainId = Number(params.chainId || 97);
  const limit = Math.max(1, Math.min(100, Number(params.limit || 24)));
  const cursor = Math.max(0, Number(params.cursor || 0));
  const factoryAddress = getFactoryAddress(chainId as any);
  if (!factoryAddress) return { items: [], nextCursor: null, pageSize: 0, updatedAt: new Date().toISOString(), source: "onchain-empty" };

  const provider = getReadProvider(chainId as any);
  const factory = new Contract(factoryAddress, LEGACY_FACTORY_ABI, provider) as any;
  const totalRaw: bigint = await factory.campaignsCount();
  const total = Number(totalRaw ?? 0n);
  if (!Number.isFinite(total) || total <= 0) return { items: [], nextCursor: null, pageSize: 0, updatedAt: new Date().toISOString(), source: "onchain-empty" };

  const readLimit = Math.min(100, Math.max(limit, 48));
  const endExclusive = Math.max(0, total - cursor);
  const offset = Math.max(0, endExclusive - readLimit);
  const actualLimit = Math.max(0, endExclusive - offset);
  if (actualLimit <= 0) return { items: [], nextCursor: null, pageSize: limit, updatedAt: new Date().toISOString(), source: "onchain" };

  const rows = await factory.getCampaignPage(offset, actualLimit);
  const mapped: CampaignFeedItemApi[] = Array.from(rows ?? [])
    .map((row: any) => ({
      chainId,
      campaignAddress: String(row?.campaign ?? "").toLowerCase(),
      tokenAddress: row?.token ? String(row.token).toLowerCase() : null,
      creatorAddress: row?.creator ? String(row.creator).toLowerCase() : null,
      name: row?.name ? String(row.name) : null,
      symbol: row?.symbol ? String(row.symbol) : null,
      logoUri: row?.logoURI ? String(row.logoURI) : null,
      createdAtChain: row?.createdAt ? String(Number(row.createdAt)) : null,
      graduatedAtChain: null,
      isDexTrading: false,
      marketcapBnb: null,
      votes24h: 0,
      progressPct: null,
      etaSec: null,
    }))
    .reverse()
    .filter((item) => /^0x[a-f0-9]{40}$/.test(item.campaignAddress))
    .filter((item) => matchesSearch(item, params.search));

  const items = mapped.slice(0, limit);
  const nextCursor = cursor + actualLimit < total ? cursor + actualLimit : null;

  return { items, nextCursor, pageSize: limit, updatedAt: new Date().toISOString(), source: "onchain-factory-fallback" };
}

async function fetchCampaignFeed(params: Record<string, any>): Promise<CampaignFeedResponse> {
  const qs = buildQueryString(params);
  try {
    const r = await apiFetch(`/api/campaigns?${qs}`, { cache: "no-store" as any });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? "Failed to load campaigns");
    const items = Array.isArray(j?.items) ? j.items : [];

    if (items.length < Number(params.limit || 24)) {
      const fallback = await fetchOnChainCampaignFeed(params);
      const merged = mergeCampaignItems(items, fallback.items).slice(0, Number(params.limit || 24));
      return {
        ...j,
        items: merged,
        nextCursor: fallback.nextCursor ?? j?.nextCursor ?? null,
        pageSize: Number(params.limit || 24),
        updatedAt: j?.updatedAt ?? fallback.updatedAt,
        source: items.length ? "realtime-plus-onchain" : fallback.source,
      } as CampaignFeedResponse;
    }

    return j as CampaignFeedResponse;
  } catch (error) {
    console.warn("[CampaignGrid] realtime campaign feed failed; using on-chain factory fallback", error);
    return await fetchOnChainCampaignFeed(params);
  }
}

export function CampaignGrid({ className, query }: { className?: string; query: HomeQuery }) {
  const { fetchCampaignLogoURI } = useLaunchpad();
  const [selectedChainId] = useSelectedFeedChainId();
  const activeChainId = selectedChainId;
  const includeTestnet = isTestnetCampaignsEnabled();
  const [refetchNonce, setRefetchNonce] = useState(0);

  const { patchByCampaign, created } = useLeagueRealtime({
    enabled: query.tab !== "drafts",
    chainId: activeChainId,
    fallbackMs: 25000,
    onFallbackRefresh: () => setRefetchNonce((n) => n + 1),
  });
  const { price: bnbUsd } = useBnbUsdPrice(true);

  const DEBUG = typeof window !== "undefined" && (window.localStorage?.getItem("debug_campaign_grid") === "1" || (window as any).__DEBUG_CAMPAIGN_GRID__ === true);

  const [items, setItems] = useState<CampaignFeedItemApi[]>([]);
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const initialLoadedRef = useRef(false);

  useEffect(() => {
    initialLoadedRef.current = false;
    setItems([]);
    setNextCursor(0);
    setLogoCache({});
  }, [activeChainId]);

  useEffect(() => {
    if (query.tab !== "new") return;
    if (!created?.length) return;
    setItems((prev) => {
      const seen = new Set(prev.map((x) => String(x.campaignAddress ?? "").toLowerCase()).filter(Boolean));
      const additions: CampaignFeedItemApi[] = [];
      for (const it of created) {
        const addr = String(it?.campaignAddress ?? "").toLowerCase();
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);
        additions.push({
          chainId: activeChainId,
          campaignAddress: addr,
          tokenAddress: it.tokenAddress ?? null,
          creatorAddress: it.creatorAddress ?? null,
          name: it.name ?? null,
          symbol: it.symbol ?? null,
          logoUri: null,
          createdAtChain: it.createdAtChain ?? new Date().toISOString(),
          graduatedAtChain: null,
          isDexTrading: false,
          marketcapBnb: null,
          votes24h: 0,
          progressPct: 0,
          etaSec: null,
        });
      }
      return additions.length ? [...additions, ...prev].slice(0, 200) : prev;
    });
  }, [created, query.tab, activeChainId]);

  useEffect(() => {
    const onRefresh = (e: any) => {
      const d = e?.detail ?? {};
      const cid = Number(d.chainId ?? NaN);
      if (Number.isFinite(cid) && cid !== activeChainId) return;
      setRefetchNonce((n) => n + 1);
    };
    window.addEventListener("memebattles:upvoteConfirmed", onRefresh as any);
    window.addEventListener("memebattles:txConfirmed", onRefresh as any);
    return () => {
      window.removeEventListener("memebattles:upvoteConfirmed", onRefresh as any);
      window.removeEventListener("memebattles:txConfirmed", onRefresh as any);
    };
  }, [activeChainId]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const baseParams = useMemo(() => ({
    chainId: activeChainId,
    limit: 24,
    tab: query.tab === "drafts" ? "trending" : (query.tab ?? "trending"),
    sort: query.sort ?? "default",
    status: query.status ?? "all",
    search: query.search ?? "",
    bnbUsd: bnbUsd ? bnbUsd : null,
    mcapMinUsd: query.mcapMinUsd ?? null,
    mcapMaxUsd: query.mcapMaxUsd ?? null,
    progressMinPct: query.progressMinPct ?? null,
    progressMaxPct: query.progressMaxPct ?? null,
    includeTestnet: includeTestnet ? "true" : null,
    testnet: includeTestnet ? "true" : null,
    includeDrafts: includeTestnet ? "true" : null,
  }), [activeChainId, query, bnbUsd, includeTestnet]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (query.tab === "drafts") return;
      if (!initialLoadedRef.current) setLoading(true);
      setErr(null);
      try {
        const resp = await fetchCampaignFeed({ ...baseParams, cursor: 0, _r: refetchNonce });
        if (!mounted) return;
        if (DEBUG) console.debug("[CampaignGrid] first page response", { source: resp.source, count: resp.items?.length ?? 0 });
        setItems(resp.items ?? []);
        setNextCursor(resp.nextCursor ?? null);
        setLastUpdatedAt(resp.updatedAt ?? null);
        initialLoadedRef.current = true;
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Failed to load campaigns");
        if (!initialLoadedRef.current) {
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [baseParams, refetchNonce, query.tab, DEBUG]);

  useEffect(() => {
    if (query.tab === "drafts") return;
    let cancelled = false;
    const missing = (items || [])
      .map((it) => String(it.campaignAddress ?? "").toLowerCase())
      .filter((addr) => addr && !logoCache[addr])
      .filter((addr) => {
        const found = (items || []).find((x) => String(x.campaignAddress ?? "").toLowerCase() === addr);
        return !found?.logoUri;
      })
      .slice(0, 24);
    if (!missing.length) return;
    (async () => {
      try {
        const pairs = await Promise.all(missing.map(async (addr) => [addr, await fetchCampaignLogoURI(addr)] as const));
        if (cancelled) return;
        setLogoCache((prev) => {
          const next = { ...prev };
          for (const [addr, uri] of pairs) if (uri) next[addr] = uri;
          return next;
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [items, logoCache, fetchCampaignLogoURI, query.tab]);

  const loadMore = async () => {
    if (query.tab === "drafts" || loadingMore || loading || nextCursor == null) return;
    setLoadingMore(true);
    try {
      const resp = await fetchCampaignFeed({ ...baseParams, cursor: nextCursor, _r: refetchNonce });
      setItems((prev) => mergeCampaignItems(prev, resp.items ?? []));
      setNextCursor(resp.nextCursor ?? null);
      setLastUpdatedAt(resp.updatedAt ?? null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (query.tab === "drafts") return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) loadMore();
    }, { root: null, rootMargin: "600px", threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentinelRef.current, nextCursor, loading, loadingMore, baseParams, query.tab]);

  const vms: CampaignCardVM[] = useMemo(() => {
    const GRAD_TARGET_BNB = 50;
    const isTrendingDefault = baseParams.tab === "trending" && baseParams.sort === "default";
    const mapped = (items || []).map((it) => {
      const addr = String(it.campaignAddress ?? "").toLowerCase();
      const patch = patchByCampaign[addr];
      const mcapBnb = Number((patch?.marketcapBnb ?? it.marketcapBnb) ?? NaN);
      const mcapUsd = Number.isFinite(mcapBnb) && bnbUsd ? mcapBnb * bnbUsd : NaN;
      const marketCapUsdLabel = Number.isFinite(mcapUsd) ? formatCompactUsd(mcapUsd) : null;
      const rawLogo = it.logoUri || logoCache[addr] || null;
      let progressPct: number | null = it.progressPct ?? null;
      const activitySec = (patch?.lastActivityAt != null ? Number(patch.lastActivityAt) : safeUnixSeconds((it as any).lastActivityAt ?? null)) ?? 0;
      const raised = Number(patch?.raisedTotalBnb ?? NaN);
      if (Number.isFinite(raised)) progressPct = Math.max(0, Math.min(100, (raised / GRAD_TARGET_BNB) * 100));
      return {
        campaignAddress: addr,
        name: String(it.name ?? "Unknown"),
        symbol: String(it.symbol ?? ""),
        logoURI: resolveImageUri(rawLogo) ?? undefined,
        creator: it.creatorAddress ?? undefined,
        createdAt: safeUnixSeconds(it.createdAtChain ?? null) ?? undefined,
        lastActivityAtSec: activitySec,
        marketCapUsdLabel,
        athLabel: marketCapUsdLabel,
        progressPct,
        isDexTrading: Boolean(it.isDexTrading),
        votes24h: Number(patch?.votes24h ?? it.votes24h ?? 0),
      } as CampaignCardVM;
    });
    if (!isTrendingDefault) return mapped;
    return mapped.slice().sort((a: any, b: any) => {
      const aa = Number(a.lastActivityAtSec ?? 0);
      const bb = Number(b.lastActivityAtSec ?? 0);
      if (bb !== aa) return bb - aa;
      const ac = Number(a.createdAt ?? 0);
      const bc = Number(b.createdAt ?? 0);
      if (bc !== ac) return bc - ac;
      return String(a.campaignAddress).localeCompare(String(b.campaignAddress));
    });
  }, [items, bnbUsd, logoCache, patchByCampaign, baseParams]);

  const resultsMeta = useMemo(() => {
    const count = vms.length;
    const updated = lastUpdatedAt ? Math.floor((Date.now() - Date.parse(lastUpdatedAt)) / 1000) : null;
    const updatedLabel = updated != null && Number.isFinite(updated) ? `${Math.max(0, updated)}s ago` : "—";
    return `Showing ${count} campaigns - Updated ${updatedLabel}`;
  }, [vms.length, lastUpdatedAt]);

  const gridClass = "grid grid-cols-2 gap-3 justify-items-stretch sm:[grid-template-columns:repeat(auto-fill,minmax(180px,220px))] sm:justify-start sm:gap-4";

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-xs text-muted-foreground">{resultsMeta}</div>
      </div>

      {loading && !vms.length ? (
        <div className={gridClass}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[1/2] w-full rounded-2xl border border-border/40 bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : err && !vms.length ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{err}</div>
      ) : vms.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No campaigns yet.</div>
      ) : (
        <>
          {err && (
            <div className="mb-3 rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
              Background refresh failed. Showing the last loaded campaigns.
            </div>
          )}
          <div className={gridClass}>
            {vms.map((vm) => <CampaignCard key={vm.campaignAddress} vm={vm} chainIdForStorage={activeChainId} />)}
          </div>
          <div ref={sentinelRef} className="h-12" />
          {loadingMore ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading more...</div>
          ) : nextCursor == null ? (
            <div className="py-6 text-center text-xs text-muted-foreground">End of results</div>
          ) : null}
        </>
      )}
    </div>
  );
}
