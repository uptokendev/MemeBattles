import { useEffect, useState } from "react";
import { fetchPostGradWarRoomCampaignFeed } from "@/features/postgrad/apiClient";
import { apiFetch } from "@/lib/apiBase";
import { fetchCampaignDraft, fetchPublicCampaignDrafts, type CampaignDraft, type PrepareDraftBundle } from "@/lib/draftApi";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";
import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeed";
import {
  BNB_CHAIN_ID,
  BNB_TESTNET_CHAIN_ID,
  SOLANA_CHAIN_ID,
  isEvmChainId,
  type SupportedChainId,
} from "@/lib/chainConfig";
import { fetchOnChainCampaignStats } from "@/lib/onChainCampaignStats";
import {
  lifecycleByCampaign,
  readCampaignLaunchAt,
  timestampSeconds,
  type CampaignDraftLifecycle,
  fetchPublicCampaignLifecycleDrafts,
} from "@/lib/scheduledLaunchApi";

export type WarRoomCampaign = CampaignInfo & Record<string, unknown>;
export type WarRoomMode = "trending" | "new" | "graduated" | "draft";
export type WarRoomCampaignFeedSource = "api" | "campaign-api" | "onchain" | "empty";

const PUBLIC_DRAFT_STATUSES = new Set(["promotion_published", "ready_to_launch", "scheduled"]);

/** Match Showcase: BNB feed toggle loads both mainnet + testnet prepare drafts. */
function draftFeedChainIds(selectedChainId: number): number[] {
  if (Number(selectedChainId) === SOLANA_CHAIN_ID) return [SOLANA_CHAIN_ID];
  if (isEvmChainId(selectedChainId)) return [BNB_CHAIN_ID, BNB_TESTNET_CHAIN_ID];
  return [Number(selectedChainId)];
}

function scheduledLaunchSeconds(draft: CampaignDraftLifecycle | CampaignDraft) {
  return timestampSeconds((draft as CampaignDraftLifecycle).scheduledLaunchAt ?? (draft as any).tradingLaunchAt);
}

function isScheduledDraft(draft: CampaignDraftLifecycle | CampaignDraft) {
  return String(draft.status) === "scheduled";
}

/** Armed timed launches stay discoverable even when campaignAddress is already set. */
function isDiscoverableScheduledDraft(draft: CampaignDraftLifecycle | CampaignDraft) {
  return isScheduledDraft(draft) && Boolean(draft.campaignAddress || scheduledLaunchSeconds(draft));
}

/** Same discoverability rules as Showcase DraftCampaignGrid. */
function isDiscoverableDraft(draft: CampaignDraftLifecycle | CampaignDraft) {
  const status = String(draft.status);
  if (!PUBLIC_DRAFT_STATUSES.has(status)) return false;
  if (status === "scheduled") return isDiscoverableScheduledDraft(draft);
  // Un-deployed prepare pages only (armed timed launches use status=scheduled).
  return !draft.campaignAddress;
}

function isPreLaunchCampaign(input: {
  launchAtSec?: number | null;
  draftStatus?: string | null;
  nowSec?: number;
}) {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (String(input.draftStatus || "") === "scheduled") {
    const launchAt = Number(input.launchAtSec || 0);
    // Scheduled drafts stay non-tradeable until launchAt is known and has passed.
    if (!Number.isFinite(launchAt) || launchAt <= 0) return true;
    return launchAt > now;
  }
  const launchAt = Number(input.launchAtSec || 0);
  return Number.isFinite(launchAt) && launchAt > now;
}

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
    holdersCount: toNumber(item?.holderCount ?? item?.holder_count ?? item?.holdersCount),
    holders: item?.holderCount != null || item?.holder_count != null || item?.holdersCount != null
      ? String(item?.holderCount ?? item?.holder_count ?? item?.holdersCount)
      : undefined,
    volumeBnb: toNumber(item?.vol24hBnb ?? item?.vol_24h_bnb ?? item?.volumeBnb),
    marketCapBnb: toNumber(item?.marketcapBnb ?? item?.marketcap_bnb ?? item?.marketCapBnb),
    athMarketCapBnb: toNumber(item?.athMarketcapBnb ?? item?.ath_marketcap_bnb ?? item?.athMarketCapBnb),
    raisedTotalBnb: toNumber(item?.raisedTotalBnb ?? item?.raised_total_bnb ?? item?.liquidityBnb),
    priceBnb: toNumber(item?.priceBnb ?? item?.price_bnb),
    raised10mBnb: toNumber(item?.raised10mBnb ?? item?.raised_10m_bnb),
    progressPct: toNumber(item?.progressPct ?? item?.progress_pct) ?? null,
    etaSec: toNumber(item?.etaSec ?? item?.eta_sec) ?? null,
    votes24h: toNumber(item?.votes24h ?? item?.votes_24h),
    votesAllTime: toNumber(item?.votesAllTime ?? item?.votes_all_time),
    dexPairAddress: item?.dexPairAddress ?? item?.dex_pair_address ?? undefined,
    dexScreenerUrl: item?.dexScreenerUrl ?? item?.dex_screener_url ?? undefined,
  } as WarRoomCampaign;
}

function mapDraftToWarRoomCampaign(
  draft: CampaignDraftLifecycle | CampaignDraft,
  index: number,
  bundle?: PrepareDraftBundle | null,
): WarRoomCampaign {
  const draftSlug = String(draft.slug || "").trim();
  const promotionHref = draftSlug ? `/prepare/${draftSlug}` : `/drafts/${draft.id}`;
  const promotion = bundle?.promotion;
  const popularity = bundle?.popularity;
  const launchAtSec = scheduledLaunchSeconds(draft);
  const scheduled = isScheduledDraft(draft);
  // Prefer real campaign address for armed timed launches so we can de-dupe against on-chain rows,
  // but keep draft status so the row never opens a trade panel pre-launch.
  const campaignKey = draft.campaignAddress
    ? String(draft.campaignAddress).toLowerCase()
    : `draft:${draft.id}`;

  return {
    id: 200000 + index,
    chainId: Number(draft.chainId),
    campaign: campaignKey,
    token: "",
    creator: String(draft.creatorWallet || "").toLowerCase(),
    name: String(draft.name || "Unknown"),
    symbol: String(draft.ticker || ""),
    logoURI: resolveImageUri(promotion?.bannerUrl || draft.logoUrl) || resolveImageUri(draft.logoUrl) || "/placeholder.svg",
    metadataURI: undefined,
    xAccount: String(draft.xUrl || promotion?.xUrl || ""),
    website: String(draft.websiteUrl || promotion?.websiteUrl || ""),
    extraLink: String(draft.otherUrl || ""),
    createdAt: toUnixSeconds((draft as any).draftCreatedAt || draft.createdAt),
    status: "draft",
    isActive: false,
    isDexTrading: false,
    isScheduled: scheduled,
    launchAt: launchAtSec ?? undefined,
    draftId: draft.id,
    draftSlug,
    draftStatus: scheduled ? "scheduled" : draft.status,
    draftVisibility: draft.visibility,
    draftCategory: draft.category,
    draftDescription: draft.description || promotion?.missionStatement || "No promotion description has been added yet.",
    draftFounderNote: promotion?.creatorNote || "No founder note has been added yet.",
    draftUpdatedAt: draft.updatedAt,
    draftFollowCount: safeCount(popularity?.follows),
    draftOptInCount: safeCount(popularity?.armedCount),
    draftCommentCount: safeCount(popularity?.comments),
    promotionHref,
    scheduledCampaignAddress: draft.campaignAddress ? String(draft.campaignAddress).toLowerCase() : null,
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

function isGraduatedCampaign(campaign: WarRoomCampaign) {
  const rich = campaign as any;
  return Boolean(
    rich.isDexTrading ||
      rich.status === "graduated" ||
      rich.status === "ended" ||
      rich.dexPairAddress ||
      rich.dexScreenerUrl ||
      rich.graduatedAt,
  );
}

function matchesModeAndSearch(campaign: WarRoomCampaign, mode: WarRoomMode, search: string) {
  const rich = campaign as any;
  const graduated = isGraduatedCampaign(campaign);
  // Once graduated, never treat as draft even if a stale scheduled lifecycle row remains.
  const preLaunch =
    !graduated &&
    isPreLaunchCampaign({
      launchAtSec: rich.launchAt,
      draftStatus: rich.draftStatus || (rich.status === "draft" ? rich.draftStatus : null),
    });
  const isDraftRow =
    !graduated &&
    (rich.status === "draft" || preLaunch || Boolean(rich.draftId && rich.isActive === false) || Boolean(rich.isScheduled));

  if (mode === "draft") {
    if (!isDraftRow) return false;
  } else if (mode === "graduated") {
    if (!graduated || preLaunch) return false;
  } else {
    // Trending / New: live bonding only — never timed drafts, pre-launch, or graduated.
    if (isDraftRow || preLaunch || graduated) return false;
  }

  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [campaign.name, campaign.symbol, campaign.campaign, campaign.token, campaign.creator, rich.draftSlug]
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

async function fetchDraftCampaignsForWarRoom(selectedChainId: number): Promise<WarRoomCampaign[]> {
  try {
    const chainIds = draftFeedChainIds(selectedChainId);
    // Match Showcase: public drafts are the primary discovery source
    // (promotion_published + ready_to_launch + scheduled).
    // lifecycle=campaign only returns armed/scheduled campaign rows — merge it
    // for launchAt metadata, never use it as the sole source.
    const [publicPages, lifecyclePages] = await Promise.all([
      Promise.all(
        chainIds.map((id) =>
          fetchPublicCampaignDrafts({ chainId: id, limit: 100 }).catch(() => [] as CampaignDraft[]),
        ),
      ),
      Promise.all(
        chainIds.map((id) =>
          fetchPublicCampaignLifecycleDrafts({ chainId: id, limit: 200 }).catch(
            () => [] as CampaignDraftLifecycle[],
          ),
        ),
      ),
    ]);

    const byId = new Map<string, CampaignDraftLifecycle>();
    for (const draft of [...publicPages.flat(), ...lifecyclePages.flat()]) {
      const id = String(draft?.id || "");
      if (!id) continue;
      const current = byId.get(id);
      byId.set(id, current ? ({ ...current, ...draft } as CampaignDraftLifecycle) : (draft as CampaignDraftLifecycle));
    }

    const visibleDrafts = Array.from(byId.values())
      .filter((draft) => chainIds.includes(Number(draft.chainId)))
      .filter((draft) => draft.visibility === "public" || !draft.visibility)
      .filter((draft) => String(draft.status) !== "deployed" && String(draft.status) !== "archived")
      .filter((draft) => isDiscoverableDraft(draft))
      .sort((a, b) =>
        String((b as any).draftCreatedAt || b.createdAt || "").localeCompare(
          String((a as any).draftCreatedAt || a.createdAt || ""),
        ),
      )
      .slice(0, 100);

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

        // Lifecycle drafts always load (for draft tab + to demote pre-launch on-chain rows).
        const draftItems = await fetchDraftCampaignsForWarRoom(chainId);
        const lifecycleMap = lifecycleByCampaign(
          draftItems
            .map((item) => ({
              id: String((item as any).draftId || ""),
              chainId: Number((item as any).chainId || chainId),
              campaignAddress: String((item as any).scheduledCampaignAddress || item.campaign || ""),
              status: String((item as any).draftStatus || "draft") as any,
              scheduledLaunchAt: (item as any).launchAt
                ? new Date(Number((item as any).launchAt) * 1000).toISOString()
                : null,
            }))
            .filter((item) => item.campaignAddress && !item.campaignAddress.startsWith("draft:")) as any,
        );

        // Also hydrate launchAt from lifecycle endpoint directly for richer scheduled metadata.
        const lifecyclePages = await Promise.all(
          draftFeedChainIds(chainId).map((id) =>
            fetchPublicCampaignLifecycleDrafts({ chainId: id, limit: 200 }).catch(() => [] as CampaignDraftLifecycle[]),
          ),
        );
        const lifecycleByAddress = lifecycleByCampaign(lifecyclePages.flat());

        const onChainPage = await fetchOnChainCampaignPage(chainId as SupportedChainId, { limit: 100 }).catch(() => ({
          campaigns: [],
          nextCursor: null,
          total: 0,
        }));
        const nowSec = Math.floor(Date.now() / 1000);
        // Hydrate on-chain stats (including launched/graduated) BEFORE mode filtering.
        // Graduated mode was empty because isDexTrading was hard-coded false pre-stats.
        const onChainHydrated = await Promise.all(
          onChainPage.campaigns.map(async (campaign, index) => {
            const address = String(campaign.campaign || "").toLowerCase();
            const lifecycle = lifecycleByAddress.get(address) || lifecycleMap.get(address);
            const launchAtFromDraft = timestampSeconds(lifecycle?.scheduledLaunchAt || lifecycle?.tradingLaunchAt);
            const launchAtOnChain =
              launchAtFromDraft ??
              (await readCampaignLaunchAt(chainId, address).catch(() => null));

            const stats = await fetchOnChainCampaignStats({
              chainId: chainId as SupportedChainId,
              campaignAddress: campaign.campaign,
              tokenAddress: campaign.token,
            }).catch(() => null);

            const launched = Boolean(stats?.isDexTrading || stats?.status === "graduated");
            const preLaunch =
              !launched &&
              isPreLaunchCampaign({
                launchAtSec: launchAtOnChain,
                draftStatus: lifecycle?.status,
                nowSec,
              });

            return normalizeApiCampaign({
              ...campaign,
              ...(stats || {}),
              chainId,
              campaignAddress: campaign.campaign,
              tokenAddress: campaign.token,
              creatorAddress: campaign.creator,
              logoUri: campaign.logoURI,
              createdAtChain: campaign.createdAt,
              status: launched ? "graduated" : preLaunch ? "draft" : "live",
              isActive: !preLaunch && !launched,
              isDexTrading: launched,
              isScheduled: preLaunch || (!launched && String(lifecycle?.status) === "scheduled"),
              launchAt: launchAtOnChain ?? undefined,
              // Only attach draft ids for real pre-launch draft rows, never for graduated.
              draftId: preLaunch ? lifecycle?.id : undefined,
              draftSlug: preLaunch ? lifecycle?.slug : undefined,
              draftStatus: preLaunch ? "scheduled" : undefined,
              promotionHref: preLaunch
                ? lifecycle?.slug
                  ? `/prepare/${lifecycle.slug}`
                  : lifecycle?.id
                    ? `/drafts/${lifecycle.id}`
                    : undefined
                : undefined,
            }, 500000 + index);
          }),
        );
        const onChainItems = onChainHydrated.filter((campaign) =>
          matchesModeAndSearch(campaign, activeMode, search),
        );

        const draftItemsForMode = draftItems.filter((campaign) => matchesModeAndSearch(campaign, activeMode, search));
        const apiItemsForMode = apiItems
          .map((campaign) => {
            if (isGraduatedCampaign(campaign)) return campaign;
            const address = String(campaign.campaign || "").toLowerCase();
            const lifecycle = lifecycleByAddress.get(address);
            if (!lifecycle) return campaign;
            const launchAt = timestampSeconds(lifecycle.scheduledLaunchAt || lifecycle.tradingLaunchAt);
            const preLaunch = isPreLaunchCampaign({
              launchAtSec: launchAt,
              draftStatus: lifecycle.status,
              nowSec,
            });
            if (!preLaunch) return campaign;
            return {
              ...campaign,
              status: "draft",
              isActive: false,
              isDexTrading: false,
              isScheduled: true,
              launchAt: launchAt ?? undefined,
              draftId: lifecycle.id,
              draftSlug: lifecycle.slug,
              draftStatus: "scheduled",
              promotionHref: lifecycle.slug ? `/prepare/${lifecycle.slug}` : `/drafts/${lifecycle.id}`,
            } as WarRoomCampaign;
          })
          .filter((campaign) => matchesModeAndSearch(campaign, activeMode, search));

        if (cancelled) return;
        const mergedMap = new Map<string, WarRoomCampaign>();
        // Prefer market rows (on-chain / API) over draft rows so graduated campaigns are not demoted.
        for (const campaign of [...onChainItems, ...apiItemsForMode, ...draftItemsForMode]) {
          if (!campaign.campaign) continue;
          const key = String(campaign.campaign).toLowerCase();
          const current = mergedMap.get(key);
          if (!current) {
            mergedMap.set(key, campaign);
            continue;
          }

          const currentGraduated = isGraduatedCampaign(current);
          const nextGraduated = isGraduatedCampaign(campaign);
          if (currentGraduated || nextGraduated) {
            const base = currentGraduated ? current : campaign;
            const extra = currentGraduated ? campaign : current;
            const merged = mergeWarRoomCampaign(base, extra);
            (merged as any).status = "graduated";
            (merged as any).isDexTrading = true;
            (merged as any).isActive = false;
            (merged as any).isScheduled = false;
            (merged as any).draftId = undefined;
            (merged as any).draftStatus = undefined;
            mergedMap.set(key, merged);
            continue;
          }

          const currentPreLaunch =
            (current as any).status === "draft" ||
            Boolean((current as any).isScheduled) ||
            isPreLaunchCampaign({
              launchAtSec: (current as any).launchAt,
              draftStatus: (current as any).draftStatus,
              nowSec,
            });
          const nextPreLaunch =
            (campaign as any).status === "draft" ||
            Boolean((campaign as any).isScheduled) ||
            isPreLaunchCampaign({
              launchAtSec: (campaign as any).launchAt,
              draftStatus: (campaign as any).draftStatus,
              nowSec,
            });

          // Prefer pre-launch draft metadata only when neither side is graduated.
          if (currentPreLaunch || nextPreLaunch) {
            const base = currentPreLaunch ? current : campaign;
            const extra = currentPreLaunch ? campaign : current;
            const merged = mergeWarRoomCampaign(base, extra);
            (merged as any).status = "draft";
            (merged as any).isActive = false;
            (merged as any).isDexTrading = false;
            (merged as any).isScheduled = true;
            mergedMap.set(key, merged);
            continue;
          }

          mergedMap.set(key, mergeWarRoomCampaign(current, campaign));
        }
        const merged = Array.from(mergedMap.values())
          .filter((campaign: WarRoomCampaign) => campaign.campaign)
          .filter((campaign) => matchesModeAndSearch(campaign, activeMode, search));
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
