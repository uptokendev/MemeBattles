import { useEffect, useState } from "react";
import { fetchPostGradWarRoomCampaignFeed } from "@/features/postgrad/apiClient";
import { apiFetch } from "@/lib/apiBase";
import { fetchCampaignDraft, fetchPublicCampaignDrafts, type CampaignDraft, type PrepareDraftBundle } from "@/lib/draftApi";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";
import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeed";
import type { SupportedChainId } from "@/lib/chainConfig";
import { fetchOnChainCampaignStats } from "@/lib/onChainCampaignStats";

export type WarRoomCampaign = CampaignInfo & Record<string, unknown>;
export type WarRoomMode = "trending" | "new" | "graduated" | "draft";
export type WarRoomCampaignFeedSource = "api" | "campaign-api" | "onchain" | "empty";

const PUBLIC_DRAFT_STATUSES = new Set(["promotion_published", "ready_to_launch", "scheduled"]);

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

function safeCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function normalizeStatus(item: any): "graduated" | "live" | "draft" | "ended" | undefined {
  const status = String(item?.status ?? item?.state ?? item?.lifecycleStatus ?? item?.lifecycle_status ?? "").toLowerCase();
  if (["graduated", "ended", "live", "draft"].includes(status)) return status as "graduated" | "live" | "draft" | "ended";
  if (Boolean(item?.isDexTrading ?? item?.is_dex_trading) || item?.dexPairAddress || item?.dex_pair_address || item?.dexScreenerUrl || item?.dex_screener_url) return "graduated";
  if (typeof item?.isDraft === "boolean" && item.isDraft) return "draft";
  if (typeof item?.is_draft === "boolean" && item.is_draft) return "draft";
  if (typeof item?.isActive === "boolean") return item.isActive ? "live" : "draft";
  if (typeof item?.is_active === "boolean") return item.is_active ? "live" : "draft";
  return undefined;
}

function normalizeApiCampaign(item: any, index: number): WarRoomCampaign {
  const campaign = String(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign ?? "").toLowerCase();
  const token = String(item?.tokenAddress ?? item?.token_address ?? item?.token ?? "").toLowerCase();
  const creator = String(item?.creatorAddress ?? item?.creator_address ?? item?.creator ?? "").toLowerCase();
  const normalizedStatus = normalizeStatus(item);
  const logo = resolveImageUri(item?.logoUri ?? item?.logoURI ?? item?.logo_url ?? item?.logo_uri) || "/placeholder.svg";
  const isDexTrading = Boolean((item?.isDexTrading ?? item?.is_dex_trading) ?? (normalizedStatus === "graduated" || normalizedStatus === "ended"));

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
    status: normalizedStatus === "ended" ? "graduated" : normalizedStatus,
    isActive: typeof item?.isActive === "boolean" ? item.isActive : typeof item?.is_active === "boolean" ? item.is_active : normalizedStatus === "live" ? true : normalizedStatus === "draft" ? false : undefined,
    isDexTrading,
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

function mapDraftToWarRoomCampaign(draft: CampaignDraft, index: number, bundle?: PrepareDraftBundle | null): WarRoomCampaign {
  const draftSlug = String(draft.slug || "").trim();
  const promotionHref = draftSlug ? `/prepare/${draftSlug}` : `/drafts/${draft.id}`;
  const promotion = bundle?.promotion;
  const popularity = bundle?.popularity;

  return {
    id: 200000 + index,
    chainId: Number(draft.chainId),
    campaign: `draft:${draft.id}`,
    token: "",
    creator: String(draft.creatorWallet || "").toLowerCase(),
    name: String(draft.name || "Unknown"),
    symbol: String(draft.ticker || ""),
    logoURI: resolveImageUri(promotion?.bannerUrl || draft.logoUrl) || resolveImageUri(draft.logoUrl) || "/placeholder.svg",
    metadataURI: undefined,
    xAccount: String(draft.xUrl || promotion?.xUrl || ""),
    website: String(draft.websiteUrl || promotion?.websiteUrl || ""),
    extraLink: String(draft.otherUrl || ""),
    createdAt: toUnixSeconds(draft.createdAt),
    status: "draft",
    isActive: false,
    isDexTrading: false,
    draftId: draft.id,
    draftSlug,
    draftStatus: draft.status,
    draftVisibility: draft.visibility,
    draftCategory: draft.category,
    draftDescription: draft.description || promotion?.missionStatement || "No promotion description has been added yet.",
    draftFounderNote: promotion?.creatorNote || "No founder note has been added yet.",
    draftUpdatedAt: draft.updatedAt,
    draftFollowCount: safeCount(popularity?.follows),
    draftOptInCount: safeCount(popularity?.armedCount),
    draftCommentCount: safeCount(popularity?.comments),
    promotionHref,
  } as WarRoomCampaign;
}

function modeToCampaignStatus(mode: WarRoomMode) {
  if (mode === "graduated") return "graduated";
  if (mode === "draft") return "ended";
  return "all";
}

function modeToCampaignTab(mode: WarRoomMode) {
  if (mode === "new") return "new";
  if (mode === "graduated") return "dex";
  return "trending";
}

function matchesModeAndSearch(campaign: WarRoomCampaign, mode: WarRoomMode, search: string) {
  if (mode === "graduated" && !campaign.isDexTrading) return false;
  if (mode !== "graduated" && mode !== "draft" && campaign.isDexTrading) return false;
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [campaign.name, campaign.symbol, campaign.campaign, campaign.token, campaign.creator]
    .some((value) => String(value ?? "").toLowerCase().includes(query));
}

function hasValue(value: unknown) {
  const raw = String(value ?? "").trim();
  return Boolean(raw && raw !== "0" && raw !== "-" && raw !== "—" && raw !== "/placeholder.svg");
}

function mergeWarRoomCampaign(base: WarRoomCampaign, incoming: WarRoomCampaign): WarRoomCampaign {
  const merged: WarRoomCampaign = { ...base, ...incoming };
  for (const key of ["name", "symbol", "logoURI", "metadataURI", "xAccount", "website", "extraLink"] as const) {
    if (hasValue((base as any)[key])) (merged as any)[key] = (base as any)[key];
    else if (hasValue((incoming as any)[key])) (merged as any)[key] = (incoming as any)[key];
  }
  merged.createdAt = base.createdAt || incoming.createdAt;
  merged.marketCapBnb = toNumber((base as any).marketCapBnb) || toNumber((incoming as any).marketCapBnb);
  merged.volumeBnb = toNumber((base as any).volumeBnb) || toNumber((incoming as any).volumeBnb);
  merged.raisedTotalBnb = toNumber((base as any).raisedTotalBnb) || toNumber((incoming as any).raisedTotalBnb);
  merged.holdersCount = toNumber((base as any).holdersCount) || toNumber((incoming as any).holdersCount);
  merged.athMarketCapBnb = toNumber((base as any).athMarketCapBnb) || toNumber((incoming as any).athMarketCapBnb);
  return merged;
}

async function fetchCampaignApiFallback(chainId: number, mode: WarRoomMode, search: string, signal: AbortSignal): Promise<WarRoomCampaign[]> {
  const params = new URLSearchParams({
    chainId: String(chainId),
    limit: "250",
    cursor: "0",
    tab: modeToCampaignTab(mode),
    sort: "default",
    status: modeToCampaignStatus(mode),
    includeTestnet: "true",
    testnet: "true",
    includeDrafts: "true",
  });
  if (search.trim()) params.set("search", search.trim());
  const response = await apiFetch(`/api/campaigns?${params.toString()}`, { cache: "no-store" as RequestCache, signal });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(json?.error || `Campaign fallback HTTP ${response.status}`));
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((item: any, index: number) => normalizeApiCampaign(item, index));
}

async function fetchDraftCampaignsForWarRoom(chainId: number): Promise<WarRoomCampaign[]> {
  try {
    const drafts = await fetchPublicCampaignDrafts({ chainId, limit: 100 });
    const visibleDrafts = drafts
      .filter((draft) => Number(draft.chainId) === Number(chainId))
      .filter((draft) => draft.visibility === "public")
      .filter((draft) => PUBLIC_DRAFT_STATUSES.has(String(draft.status)))
      .filter((draft) => !draft.campaignAddress && String(draft.status) !== "deployed");

    const hydrated = await Promise.all(
      visibleDrafts.map(async (draft, index) => {
        const bundle = await fetchCampaignDraft(draft.id).catch(() => null);
        return mapDraftToWarRoomCampaign(draft, index, bundle);
      }),
    );

    return hydrated;
  } catch (error) {
    console.warn("[useWarRoomCampaignFeed] public draft fallback failed", error);
    return [];
  }
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
        const chainId = Number(activeChainId || 97);
        const json = await fetchPostGradWarRoomCampaignFeed({
          chainId,
          mode: activeMode,
          search,
          includeTestnet: chainId === 97,
          signal: controller.signal,
        });
        if (cancelled) return;
        let feedSource: WarRoomCampaignFeedSource = "api";
        let apiItems = Array.isArray(json?.items) ? json.items.map((item: any, index: number) => normalizeApiCampaign(item, index)) : [];

        if (!apiItems.length) {
          apiItems = await fetchCampaignApiFallback(chainId, activeMode, search, controller.signal).catch(() => []);
          if (apiItems.length) feedSource = "campaign-api";
        }

        const onChainPage = await fetchOnChainCampaignPage(chainId as SupportedChainId, { limit: 100 }).catch(() => ({
          campaigns: [],
          nextCursor: null,
          total: 0,
        }));
        const onChainBaseItems = onChainPage.campaigns
          .map((campaign, index) => normalizeApiCampaign({
            ...campaign,
            chainId,
            campaignAddress: campaign.campaign,
            tokenAddress: campaign.token,
            creatorAddress: campaign.creator,
            logoUri: campaign.logoURI,
            createdAtChain: campaign.createdAt,
            status: "live",
            isActive: true,
            isDexTrading: false,
          }, 500000 + index))
          .filter((campaign) => matchesModeAndSearch(campaign, activeMode, search));
        const onChainItems = await Promise.all(
          onChainBaseItems.map(async (campaign) => {
            const stats = await fetchOnChainCampaignStats({
              chainId: chainId as SupportedChainId,
              campaignAddress: campaign.campaign,
              tokenAddress: campaign.token,
            }).catch(() => null);
            return stats ? ({ ...campaign, ...stats } as WarRoomCampaign) : campaign;
          }),
        );

        const draftItems = activeMode === "draft" ? await fetchDraftCampaignsForWarRoom(chainId) : [];
        if (cancelled) return;
        const mergedMap = new Map<string, WarRoomCampaign>();
        for (const campaign of [...onChainItems, ...apiItems, ...draftItems]) {
          if (!campaign.campaign) continue;
          const key = String(campaign.campaign).toLowerCase();
          const current = mergedMap.get(key);
          mergedMap.set(key, current ? mergeWarRoomCampaign(current, campaign) : campaign);
        }
        const merged = Array.from(mergedMap.values())
          .filter((campaign: WarRoomCampaign) => campaign.campaign)
        setCampaigns(merged);
        setSource(merged.length ? (onChainItems.length ? "onchain" : feedSource) : "empty");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("[useWarRoomCampaignFeed] failed to load campaigns", loadError);
        if (!cancelled) {
          setCampaigns([]);
          setSource("empty");
          setError(loadError instanceof Error ? loadError.message : "Failed to load market campaigns");
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
