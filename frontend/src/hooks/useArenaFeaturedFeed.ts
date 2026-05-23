import { useEffect, useMemo, useState } from "react";
import { getPostGradTokenDetailRoute } from "@/features/postgrad/identityRoutes";
import { apiFetch } from "@/lib/apiBase";
import { useLaunchpad } from "@/lib/launchpadClient";

export type ArenaFeaturedFeedSource = "api" | "empty";

export type ArenaFeaturedRailItem = {
  id: string;
  title: string;
  symbol: string;
  href: string;
  detail: string;
  statusLabel: string;
  statusTone: "default" | "hot" | "sponsored" | "success";
  rankLabel: string;
};

type FeaturedCampaignRecord = {
  campaignAddress: string;
  name: string;
  symbol: string;
  votes24h: number;
  votesAllTime: number;
  trendingScore: number;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeFeaturedCampaign(item: any): FeaturedCampaignRecord | null {
  const campaignAddress = String(item?.campaignAddress ?? item?.campaign_address ?? "").trim().toLowerCase();
  if (!campaignAddress) return null;

  return {
    campaignAddress,
    name: String(item?.name ?? item?.symbol ?? "Unknown"),
    symbol: String(item?.symbol ?? ""),
    votes24h: toNumber(item?.votes24h ?? item?.votes_24h),
    votesAllTime: toNumber(item?.votesAllTime ?? item?.votes_all_time),
    trendingScore: toNumber(item?.trendingScore ?? item?.trending_score),
  };
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
        const params = new URLSearchParams({
          chainId: String(activeChainId || 97),
          sort: "24h",
          limit: String(limit),
        });
        const response = await apiFetch(`/api/featured?${params.toString()}`, { cache: "no-store" as RequestCache });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));
        if (cancelled) return;

        const nextItems = Array.isArray(json?.items)
          ? json.items.map(normalizeFeaturedCampaign).filter(Boolean) as FeaturedCampaignRecord[]
          : [];
        setItems(nextItems);
        setSource(nextItems.length ? "api" : "empty");
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

        return {
          id: item.campaignAddress,
          title: item.name,
          symbol: item.symbol,
          href,
          detail: `${item.votes24h.toLocaleString()} votes in 24h · ${item.votesAllTime.toLocaleString()} all-time`,
          statusLabel: "UpVotes",
          statusTone: "success",
          rankLabel: `Rank ${index + 1}`,
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
