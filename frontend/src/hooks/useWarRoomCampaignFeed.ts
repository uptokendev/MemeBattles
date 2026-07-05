import { useEffect, useState } from "react";
import { fetchPostGradWarRoomCampaignFeed } from "@/features/postgrad/apiClient";
import { apiFetch } from "@/lib/apiBase";
import { fetchPublicCampaignDrafts, type CampaignDraft } from "@/lib/draftApi";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

export type WarRoomCampaign = CampaignInfo & Record<string, unknown>;
export type WarRoomMode = "trending" | "new" | "graduated" | "draft";
export type WarRoomCampaignFeedSource = "api" | "campaign-api" | "empty";

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

function mapDraftToWarRoomCampaign(draft: CampaignDraft, index: number): WarRoomCampaign {
  const draftSlug = String(draft.slug || "").trim();
  const promotionHref = draftSlug ? `/prepare/${draftSlug}` : `/drafts/${draft.id}`;

  return {
    id: 200000 + index,
    chainId: Number(draft.chainId),
    campaign: `draft:${draft.id}`,
    token: "",
    creator: String(draft.creatorWallet || "").toLowerCase(),
    name: String(draft.name || "Unknown"),
    symbol: String(draft.ticker || ""),
    logoURI: resolveImageUri(draft.logoUrl) || "/placeholder.svg",
    metadataURI: undefined,
    xAccount: String(draft.xUrl || ""),
    website: String(draft.websiteUrl || ""),
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
    draftDescription: draft.description || "No promotion description has been added yet.",
    draftUpdatedAt: draft.updatedAt,
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
    return drafts
      .filter((draft) => Number(draft.chainId) === Number(chainId))
      .filter((draft) => draft.visibility === "public")
      .filter((draft) => PUBLIC_DRAFT_STATUSES.has(String(draft.status)))
      .filter((draft) => !draft.campaignAddress && String(draft.status) !== "deployed")
      .map(mapDraftToWarRoomCampaign);
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
          signal: controller.signal,
        });
        if (cancelled) return;
        let feedSource: WarRoomCampaignFeedSource = "api";
        let apiItems = Array.isArray(json?.items) ? json.items.map((item: any, index: number) => normalizeApiCampaign(item, index)) : [];

        if (!apiItems.length && (json?.disabled || json?.warning)) {
          apiItems = await fetchCampaignApiFallback(chainId, activeMode, search, controller.signal);
          feedSource = "campaign-api";
        }

        const draftItems = activeMode === "draft" ? await fetchDraftCampaignsForWarRoom(chainId) : [];
        if (cancelled) return;
        const merged = [...apiItems, ...draftItems]
          .filter((campaign: WarRoomCampaign) => campaign.campaign)
          .filter((campaign, index, all) => all.findIndex((other) => String(other.campaign) === String(campaign.campaign)) === index);
        setCampaigns(merged);
        setSource(merged.length ? feedSource : "empty");
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
