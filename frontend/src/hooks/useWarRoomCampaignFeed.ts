import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiBase";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

export type WarRoomCampaign = CampaignInfo & Record<string, unknown>;
export type WarRoomMode = "trending" | "new" | "graduated" | "draft";
export type WarRoomCampaignFeedSource = "api" | "empty";

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

function normalizeApiCampaign(item: any, index: number): WarRoomCampaign {
  const campaign = String(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign ?? "").toLowerCase();
  const token = String(item?.tokenAddress ?? item?.token_address ?? item?.token ?? "").toLowerCase();
  const creator = String(item?.creatorAddress ?? item?.creator_address ?? item?.creator ?? "").toLowerCase();
  const status = String(item?.status ?? "").toLowerCase();
  const logo = resolveImageUri(item?.logoUri ?? item?.logoURI ?? item?.logo_url ?? item?.logo_uri) || "/placeholder.svg";

  return {
    id: 100000 + index,
    chainId: toNumber(item?.chainId ?? item?.chain_id),
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
    status: status === "graduated" || status === "ended" || status === "live" ? status : undefined,
    isActive: typeof item?.isActive === "boolean" ? item.isActive : typeof item?.is_active === "boolean" ? item.is_active : undefined,
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
  } as WarRoomCampaign;
}

function queryForMode(mode: WarRoomMode, chainId: number, search: string) {
  const params = new URLSearchParams({
    chainId: String(chainId || 97),
    limit: "250",
    mode,
  });
  if (search.trim()) params.set("search", search.trim());
  return params.toString();
}

export function useWarRoomCampaignFeed({
  activeMode,
  activeChainId,
  bnbUsd: _bnbUsd,
  search,
}: {
  activeMode: WarRoomMode;
  activeChainId: number | undefined;
  bnbUsd: number | null;
  search: string;
}) {
  const [campaigns, setCampaigns] = useState<WarRoomCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<WarRoomCampaignFeedSource>("empty");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const query = queryForMode(activeMode, Number(activeChainId || 97), search);
        const response = await apiFetch(`/api/war-room?${query}`, { cache: "no-store" as RequestCache, signal: controller.signal });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));
        if (cancelled) return;
        const items = Array.isArray(json?.items) ? json.items : [];
        setCampaigns(items.map((item: any, index: number) => normalizeApiCampaign(item, index)).filter((campaign: WarRoomCampaign) => campaign.campaign));
        setSource(items.length ? "api" : "empty");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("[useWarRoomCampaignFeed] failed to load campaigns", loadError);
        if (!cancelled) {
          setCampaigns([]);
          setSource("empty");
          setError(loadError instanceof Error ? loadError.message : "Failed to load War Room campaigns");
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
  }, [activeChainId, activeMode, search]);

  return { campaigns, loading, error, source };
}
