import { useEffect, useMemo, useState } from "react";
import type { ArenaCampaignFeedSource, ArenaCampaignRailItem } from "@/hooks/useArenaCampaignFeed";
import { getPostGradTokenDetailRoute } from "@/features/postgrad/identityRoutes";
import { getWarRoomCampaignMetrics } from "@/features/postgrad/warRoomMetrics";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { apiFetch } from "@/lib/apiBase";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

type SponsoredCampaignInfo = CampaignInfo & {
  placementType?: "internal" | "external" | string;
  placementLabel?: string;
  targetUrl?: string | null;
  startsAt?: number;
  endsAt?: number;
  bio?: string;
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

function formatPlacementWindow(startsAt?: number, endsAt?: number) {
  if (!startsAt && !endsAt) return null;

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });

  if (startsAt && endsAt) {
    return `${formatter.format(new Date(startsAt * 1000))} - ${formatter.format(new Date(endsAt * 1000))}`;
  }

  if (startsAt) return `Starts ${formatter.format(new Date(startsAt * 1000))}`;
  return `Ends ${formatter.format(new Date((endsAt || 0) * 1000))}`;
}

function trimSummary(value?: string | null) {
  const summary = String(value ?? "").trim();
  if (!summary) return null;
  if (summary.length <= 140) return summary;
  return `${summary.slice(0, 137).trimEnd()}...`;
}

function resolveSponsoredHref(item: SponsoredCampaignInfo) {
  if (item.placementType === "external" && item.targetUrl) return item.targetUrl;
  return getPostGradTokenDetailRoute(item.campaign);
}

function normalizeCampaign(item: any, index: number): SponsoredCampaignInfo | null {
  const campaign = String(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign ?? item?.targetUrl ?? `external-sponsored-${index}`).trim().toLowerCase();
  if (!campaign) return null;

  const token = String(item?.tokenAddress ?? item?.token_address ?? item?.token ?? "").toLowerCase();
  const creator = String(item?.creatorAddress ?? item?.creator_address ?? item?.creator ?? "").toLowerCase();
  const status = String(item?.status ?? "live").toLowerCase();
  const logo = resolveImageUri(item?.logoUri ?? item?.logoURI ?? item?.logo_url ?? item?.logo_uri) || "/placeholder.svg";

  return {
    id: 300000 + index,
    campaign,
    token,
    creator,
    name: String(item?.name ?? "Unknown"),
    symbol: String(item?.symbol ?? ""),
    logoURI: logo,
    metadataURI: undefined,
    xAccount: String(item?.xAccount ?? item?.x_url ?? ""),
    website: String(item?.website ?? item?.website_url ?? item?.targetUrl ?? ""),
    extraLink: String(item?.extraLink ?? item?.extra_link ?? ""),
    createdAt: toUnixSeconds(item?.createdAtChain ?? item?.created_at_chain ?? item?.createdAt ?? item?.created_at),
    status: status === "graduated" || status === "ended" || status === "live" ? (status as CampaignInfo["status"]) : "live",
    isActive: typeof item?.isActive === "boolean" ? item.isActive : typeof item?.is_active === "boolean" ? item.is_active : true,
    isDexTrading: Boolean(item?.isDexTrading ?? item?.is_dex_trading ?? status === "graduated"),
    graduatedAt: toUnixSeconds(item?.graduatedAtChain ?? item?.graduated_at_chain),
    holdersCount: toNumber(item?.holderCount ?? item?.holder_count),
    holders: item?.holderCount != null || item?.holder_count != null ? String(item?.holderCount ?? item?.holder_count) : undefined,
    volumeBnb: toNumber(item?.vol24hBnb ?? item?.vol_24h_bnb),
    marketCapBnb: toNumber(item?.marketcapBnb ?? item?.marketcap_bnb),
    athMarketCapBnb: toNumber(item?.athMarketcapBnb ?? item?.ath_marketcap_bnb),
    raisedTotalBnb: toNumber(item?.raisedTotalBnb ?? item?.raised_total_bnb),
    raised10mBnb: toNumber(item?.raised10mBnb ?? item?.raised_10m_bnb),
    progressPct: toNumber(item?.progressPct ?? item?.progress_pct) ?? null,
    etaSec: toNumber(item?.etaSec ?? item?.eta_sec) ?? null,
    votes24h: toNumber(item?.votes24h ?? item?.votes_24h),
    votesAllTime: toNumber(item?.votesAllTime ?? item?.votes_all_time),
    dexPairAddress: item?.dexPairAddress ?? item?.dex_pair_address ?? undefined,
    dexScreenerUrl: item?.dexScreenerUrl ?? item?.dex_screener_url ?? undefined,
    placementType: item?.placementType ?? item?.placement_type ?? "internal",
    placementLabel: item?.placementLabel ?? item?.placement_label ?? "Sponsored",
    targetUrl: item?.targetUrl ?? item?.target_url ?? null,
    startsAt: toUnixSeconds(item?.startsAt ?? item?.startAt ?? item?.start_at ?? item?.preferredStart ?? item?.preferred_start),
    endsAt: toUnixSeconds(item?.endsAt ?? item?.endAt ?? item?.end_at ?? item?.preferredEnd ?? item?.preferred_end),
    bio: String(item?.bio ?? item?.summary ?? item?.description ?? "").trim(),
  } as SponsoredCampaignInfo;
}

export function useArenaSponsoredFeed(limit = 4) {
  const { activeChainId } = useLaunchpad();
  const { price: bnbUsd } = useBnbUsdPrice(true);
  const [campaigns, setCampaigns] = useState<SponsoredCampaignInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<ArenaCampaignFeedSource>("empty");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          chainId: String(activeChainId || 97),
          limit: String(limit),
        });
        const response = await apiFetch(`/api/sponsored?${params.toString()}`, { cache: "no-store" as RequestCache });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));
        if (cancelled) return;

        const items = Array.isArray(json?.items) ? json.items : [];
        const nextCampaigns = items.map((item: any, index: number) => normalizeCampaign(item, index)).filter(Boolean) as SponsoredCampaignInfo[];
        setCampaigns(nextCampaigns);
        setSource(nextCampaigns.length ? "api" : "empty");
      } catch (error) {
        console.warn("[useArenaSponsoredFeed] failed to load sponsored feed", error);
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
    };
  }, [activeChainId, limit]);

  const railItems = useMemo<ArenaCampaignRailItem[]>(() => {
    return campaigns
      .map((campaign, index) => {
        const href = resolveSponsoredHref(campaign);
        if (!href) return null;

        const metrics = getWarRoomCampaignMetrics(campaign, bnbUsd ?? 0);
        const isExternal = campaign.placementType === "external";
        const activeDatesLabel = formatPlacementWindow(campaign.startsAt, campaign.endsAt);
        const websiteUrl = campaign.website || campaign.targetUrl || undefined;
        return {
          id: campaign.campaign,
          title: campaign.name,
          symbol: campaign.symbol,
          href,
          detail: isExternal ? "External sponsored placement" : `MC ${metrics.marketCapLabel} · Vol ${metrics.volumeLabel}`,
          statusLabel: campaign.placementLabel || (isExternal ? "Sponsored partner" : "Sponsored"),
          statusTone: "sponsored",
          rankLabel: `Slot ${index + 1}`,
          imageUrl: campaign.logoURI || "/placeholder.svg",
          summary: trimSummary(campaign.bio) || (isExternal ? "External project placement" : `Homepage rail placement for ${campaign.symbol}`),
          websiteUrl,
          websiteLabel: websiteUrl ? "Website" : undefined,
          activeDatesLabel,
          cardVariant: "sponsored",
        };
      })
      .filter(Boolean) as ArenaCampaignRailItem[];
  }, [bnbUsd, campaigns]);

  return {
    loading,
    source,
    railItems,
    hasSponsoredCampaigns: railItems.length > 0,
  };
}
