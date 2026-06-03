import { useEffect, useMemo, useState } from "react";
import { getPostGradTokenDetailRoute } from "@/features/postgrad/identityRoutes";
import { apiFetch } from "@/lib/apiBase";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

export type ArenaFeaturedFeedSource = "api" | "campaigns" | "empty";

export type ArenaFeaturedRailItem = {
  id: string;
  title: string;
  symbol: string;
  href: string;
  detail: string;
  statusLabel: string;
  statusTone: "default" | "hot" | "sponsored" | "success";
  rankLabel: string;
  imageUrl?: string | null;
  summary?: string | null;
};

type FeaturedCampaignRecord = {
  campaignAddress: string;
  name: string;
  symbol: string;
  votes24h: number;
  votesAllTime: number;
  trendingScore: number;
  imageUrl?: string | null;
  marketCapBnb?: number;
  holdersCount?: number;
  source: "upvotes" | "campaigns";
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toOptionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeFeaturedCampaign(item: any, source: "upvotes" | "campaigns"): FeaturedCampaignRecord | null {
  const campaignAddress = String(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign ?? "").trim().toLowerCase();
  if (!campaignAddress) return null;

  return {
    campaignAddress,
    name: String(item?.name ?? item?.symbol ?? "Unknown"),
    symbol: String(item?.symbol ?? ""),
    votes24h: toNumber(item?.votes24h ?? item?.votes_24h),
    votesAllTime: toNumber(item?.votesAllTime ?? item?.votes_all_time),
    trendingScore: toNumber(item?.trendingScore ?? item?.trending_score),
    imageUrl: resolveImageUri(item?.imageUrl ?? item?.image_url ?? item?.logoUri ?? item?.logoURI ?? item?.logo_url ?? item?.logo_uri),
    marketCapBnb: toOptionalNumber(item?.marketCapBnb ?? item?.marketcapBnb ?? item?.marketcap_bnb),
    holdersCount: toOptionalNumber(item?.holdersCount ?? item?.holderCount ?? item?.holder_count),
    source,
  };
}

async function loadFeatured(activeChainId: number, limit: number) {
  const params = new URLSearchParams({
    chainId: String(activeChainId || 97),
    sort: "24h",
    limit: String(limit),
  });
  const response = await apiFetch(`/api/featured?${params.toString()}`, { cache: "no-store" as RequestCache });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));

  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((item: any) => normalizeFeaturedCampaign(item, "upvotes")).filter(Boolean) as FeaturedCampaignRecord[];
}

async function loadCampaignFallback(activeChainId: number, limit: number) {
  const params = new URLSearchParams({
    chainId: String(activeChainId || 97),
    limit: String(limit),
    cursor: "0",
    tab: "trending",
    status: "all",
    sort: "default",
  });
  const response = await apiFetch(`/api/campaigns?${params.toString()}`, { cache: "no-store" as RequestCache });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));

  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((item: any) => normalizeFeaturedCampaign(item, "campaigns")).filter(Boolean) as FeaturedCampaignRecord[];
}

export function useArenaFeaturedFeed(limit = 6) {
  const { activeChainId } = useLaunchpad();
  const [items, setItems] = useState<FeaturedCampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<ArenaFeaturedFeedSource>("empty");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        let nextItems = await loadFeatured(activeChainId, limit);
        let nextSource: ArenaFeaturedFeedSource = nextItems.length ? "api" : "empty";

        if (!nextItems.length) {
          try {
            nextItems = await loadCampaignFallback(activeChainId, limit);
            nextSource = nextItems.length ? "campaigns" : "empty";
          } catch (fallbackError) {
            console.warn("[useArenaFeaturedFeed] failed to load campaign fallback", fallbackError);
          }
        }

        if (cancelled) return;
        setItems(nextItems);
        setSource(nextSource);
      } catch (error) {
        console.warn("[useArenaFeaturedFeed] failed to load featured feed", error);
        if (!cancelled) {
          setItems([]);
          setSource("empty");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeChainId, limit]);

  const railItems = useMemo<ArenaFeaturedRailItem[]>(() => {
    return items
      .map((item, index) => {
        const href = getPostGradTokenDetailRoute(item.campaignAddress);
        if (!href) return null;

        const isUpvoteSource = item.source === "upvotes";
        const hasVotes = item.votes24h > 0 || item.votesAllTime > 0;
        const fallbackBits = [
          item.marketCapBnb != null ? `${item.marketCapBnb.toLocaleString(undefined, { maximumFractionDigits: 2 })} BNB MC` : null,
          item.holdersCount != null ? `${item.holdersCount.toLocaleString()} holders` : null,
        ].filter(Boolean);

        return {
          id: item.campaignAddress,
          title: item.name,
          symbol: item.symbol,
          href,
          detail: hasVotes
            ? `${item.votes24h.toLocaleString()} votes in 24h · ${item.votesAllTime.toLocaleString()} all-time`
            : fallbackBits.join(" · ") || "Trending token",
          statusLabel: isUpvoteSource ? "UpVotes" : "Trending",
          statusTone: "success",
          rankLabel: `Rank ${index + 1}`,
          imageUrl: resolveImageUri(item.imageUrl),
          summary: isUpvoteSource ? null : "Featured fallback until UpVote totals are indexed.",
        };
      })
      .filter(Boolean) as ArenaFeaturedRailItem[];
  }, [items]);

  return {
    loading,
    source,
    railItems,
    hasFeaturedCampaigns: railItems.length > 0,
  };
}
