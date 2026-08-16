import { useEffect, useMemo, useState } from "react";
import { fetchPostGradCampaignFeed } from "@/features/postgrad/apiClient";
import { getPostGradTokenDetailRoute } from "@/features/postgrad/identityRoutes";
import { getWarRoomCampaignMetrics } from "@/features/postgrad/warRoomMetrics";
import { useNativeUsdPrice } from "@/hooks/useNativeUsdPrice";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

export type ArenaCampaignFeedSource = "api" | "empty";

export type ArenaCampaignRailItem = {
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
  websiteUrl?: string | null;
  websiteLabel?: string | null;
  activeDatesLabel?: string | null;
  cardVariant?: "default" | "sponsored";
};

function toNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toUnixSeconds(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function normalizeCampaign(item: any, index: number): CampaignInfo | null {
  const campaign = String(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign ?? "").toLowerCase();
  if (!campaign) return null;

  const token = String(item?.tokenAddress ?? item?.token_address ?? item?.token ?? "").toLowerCase();
  const creator = String(item?.creatorAddress ?? item?.creator_address ?? item?.creator ?? "").toLowerCase();
  const status = String(item?.status ?? "").toLowerCase();
  const logo = resolveImageUri(item?.logoUri ?? item?.logoURI ?? item?.logo_url ?? item?.logo_uri) || "/placeholder.svg";

  return {
    id: 200000 + index,
    campaign,
    token,
    creator,
    name: String(item?.name ?? "Unknown"),
    symbol: String(item?.symbol ?? ""),
    logoURI: logo,
    metadataURI: undefined,
    xAccount: String(item?.xAccount ?? item?.x_url ?? ""),
    website: String(item?.website ?? item?.website_url ?? ""),
    extraLink: String(item?.extraLink ?? item?.extra_link ?? ""),
    createdAt: toUnixSeconds(item?.createdAtChain ?? item?.created_at_chain ?? item?.createdAt ?? item?.created_at),
    status: status === "graduated" || status === "ended" || status === "live" ? (status as CampaignInfo["status"]) : undefined,
    isActive: typeof item?.isActive === "boolean" ? item.isActive : typeof item?.is_active === "boolean" ? item.is_active : undefined,
    isDexTrading: Boolean(item?.isDexTrading ?? item?.is_dex_trading ?? status === "graduated"),
    graduatedAt: toUnixSeconds(item?.graduatedAtChain ?? item?.graduated_at_chain),
    holdersCount: toNumber(item?.holderCount ?? item?.holder_count),
    holders: item?.holderCount != null || item?.holder_count != null ? String(item?.holderCount ?? item?.holder_count) : undefined,
    volumeBnb: toNumber(item?.vol24hBnb ?? item?.vol_24h_bnb),
    marketCapBnb: toNumber(item?.marketcapBnb ?? item?.marketcap_bnb),
    athMarketCapBnb: toNumber(item?.athMarketcapBnb ?? item?.ath_marketcap_bnb),
    raisedTotalBnb: toNumber(item?.raisedTotalBnb ?? item?.raised_total_bnb),
    priceBnb: toNumber(item?.lastPriceBnb ?? item?.last_price_bnb ?? item?.priceBnb ?? item?.price_bnb),
    soldTokens: toNumber(item?.soldTokens ?? item?.sold_tokens),
    raised10mBnb: toNumber(item?.raised10mBnb ?? item?.raised_10m_bnb),
    progressPct: toNumber(item?.progressPct ?? item?.progress_pct) ?? null,
    etaSec: toNumber(item?.etaSec ?? item?.eta_sec) ?? null,
    votes24h: toNumber(item?.votes24h ?? item?.votes_24h),
    votesAllTime: toNumber(item?.votesAllTime ?? item?.votes_all_time),
    dexPairAddress: item?.dexPairAddress ?? item?.dex_pair_address ?? undefined,

  };
}

function resolveStatus(campaign: CampaignInfo) {
  const metrics = getWarRoomCampaignMetrics(campaign, 0);
  if (metrics.status === "graduated") return { label: "Graduated", tone: "success" as const };
  if (metrics.status === "bonding") return { label: "Bonding", tone: "hot" as const };
  return { label: "Draft", tone: "default" as const };
}

export function useArenaCampaignFeed(limit = 12) {
  const { activeChainId } = useLaunchpad();
  const { price: nativeUsd } = useNativeUsdPrice(activeChainId);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<ArenaCampaignFeedSource>("empty");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const json = await fetchPostGradCampaignFeed({
          chainId: activeChainId || 97,
          limit,
          bnbUsd: nativeUsd,
          signal: controller.signal,
        });
        if (cancelled) return;

        const items = Array.isArray(json?.items) ? json.items : [];
        const nextCampaigns = items.map((item: any, index: number) => normalizeCampaign(item, index)).filter(Boolean) as CampaignInfo[];
        setCampaigns(nextCampaigns);
        setSource(nextCampaigns.length ? "api" : "empty");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("[useArenaCampaignFeed] failed to load campaign feed", error);
        if (!cancelled) {
          setCampaigns([]);
          setSource("empty");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeChainId, nativeUsd, limit]);

  const railItems = useMemo<ArenaCampaignRailItem[]>(() => {
    return campaigns
      .map((campaign, index) => {
        const href = getPostGradTokenDetailRoute(campaign.campaign);
        if (!href) return null;

        const metrics = getWarRoomCampaignMetrics(campaign, nativeUsd ?? 0);
        const status = resolveStatus(campaign);
        return {
          id: campaign.campaign,
          title: campaign.name,
          symbol: campaign.symbol,
          href,
          detail: `MC ${metrics.marketCapLabel} · Vol ${metrics.volumeLabel}`,
          statusLabel: status.label,
          statusTone: status.tone,
          rankLabel: `Rank ${index + 1}`,
          imageUrl: campaign.logoURI || "/placeholder.svg",
          summary: `Liquidity ${metrics.liquidityLabel} · ${metrics.holdersLabel} holders`,
          websiteUrl: campaign.website || undefined,
          websiteLabel: "Website",
          cardVariant: "default",
        };
      })
      .filter(Boolean) as ArenaCampaignRailItem[];
  }, [nativeUsd, campaigns]);

  return {
    loading,
    source,
    campaigns,
    railItems,
    hasRealCampaigns: railItems.length > 0,
  };
}
