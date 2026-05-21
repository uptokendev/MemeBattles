import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { WarRoomCampaignRow } from "@/components/postgrad/WarRoomCampaignRow";
import { getWarRoomCampaignMetrics } from "@/features/postgrad/warRoomMetrics";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { apiFetch } from "@/lib/apiBase";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

type WarRoomMode = "trending" | "new" | "graduated" | "draft" | "mcap" | "holders" | "volume";

const terminalModes: Array<{ key: WarRoomMode; label: string; type: "feed" | "sort" }> = [
  { key: "trending", label: "Trending", type: "feed" },
  { key: "new", label: "New", type: "feed" },
  { key: "graduated", label: "Graduated", type: "feed" },
  { key: "draft", label: "Draft", type: "feed" },
  { key: "mcap", label: "Mcap", type: "sort" },
  { key: "holders", label: "Holders", type: "sort" },
  { key: "volume", label: "Volume", type: "sort" },
];

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

function normalizeApiCampaign(item: any, index: number): CampaignInfo {
  const campaign = String(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign ?? "").toLowerCase();
  const token = String(item?.tokenAddress ?? item?.token_address ?? item?.token ?? "").toLowerCase();
  const creator = String(item?.creatorAddress ?? item?.creator_address ?? item?.creator ?? "").toLowerCase();
  const status = String(item?.status ?? "").toLowerCase();
  const logo = resolveImageUri(item?.logoUri ?? item?.logoURI ?? item?.logo_url ?? item?.logoURI) || "/placeholder.svg";

  return {
    id: 100000 + index,
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
    raised10mBnb: toNumber(item?.raised10mBnb ?? item?.raised_10m_bnb),
    progressPct: toNumber(item?.progressPct ?? item?.progress_pct) ?? null,
    etaSec: toNumber(item?.etaSec ?? item?.eta_sec) ?? null,
    votes24h: toNumber(item?.votes24h ?? item?.votes_24h),
    votesAllTime: toNumber(item?.votesAllTime ?? item?.votes_all_time),
    dexPairAddress: item?.dexPairAddress ?? item?.dex_pair_address ?? undefined,
    dexScreenerUrl: item?.dexScreenerUrl ?? item?.dex_screener_url ?? undefined,
  };
}

function queryForMode(mode: WarRoomMode, chainId: number, bnbUsd: number | null, search: string) {
  const params = new URLSearchParams({
    chainId: String(chainId || 97),
    limit: "250",
    cursor: "0",
    tab: mode === "new" ? "new" : mode === "graduated" ? "dex" : "trending",
    status: mode === "graduated" ? "graduated" : mode === "draft" ? "live" : "all",
    sort: mode === "mcap" ? "mcap_desc" : mode === "holders" ? "holders_desc" : mode === "volume" ? "volume_desc" : mode === "new" ? "created_desc" : "default",
  });
  if (bnbUsd && Number.isFinite(bnbUsd)) params.set("bnbUsd", String(bnbUsd));
  if (search.trim()) params.set("search", search.trim());
  return params.toString();
}

const WarRoom = () => {
  const { activeChainId } = useLaunchpad();
  const { price: bnbUsd } = useBnbUsdPrice(true);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeMode, setActiveMode] = useState<WarRoomMode>("trending");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const query = queryForMode(activeMode, Number(activeChainId || 97), bnbUsd, search);
        const response = await apiFetch(`/api/campaigns?${query}`, { cache: "no-store" as RequestCache });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));
        if (cancelled) return;
        const items = Array.isArray(json?.items) ? json.items : [];
        setCampaigns(items.map((item: any, index: number) => normalizeApiCampaign(item, index)).filter((campaign: CampaignInfo) => campaign.campaign));
      } catch (error) {
        console.error("[WarRoom] failed to load campaigns", error);
        if (!cancelled) setCampaigns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeChainId, activeMode, bnbUsd, search]);

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();

    return campaigns
      .filter((campaign) => {
        const metrics = getWarRoomCampaignMetrics(campaign, bnbUsd ?? 0);
        const matchesSearch = !query || `${campaign.name} ${campaign.symbol} ${campaign.creator} ${campaign.campaign}`.toLowerCase().includes(query);
        const matchesMode = activeMode === "graduated" ? metrics.status === "graduated" : activeMode === "draft" ? metrics.status === "draft" : true;
        return matchesSearch && matchesMode;
      })
      .sort((left, right) => {
        const leftMetrics = getWarRoomCampaignMetrics(left, bnbUsd ?? 0);
        const rightMetrics = getWarRoomCampaignMetrics(right, bnbUsd ?? 0);

        switch (activeMode) {
          case "new":
            return Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0);
          case "mcap":
            return rightMetrics.marketCapUsd - leftMetrics.marketCapUsd;
          case "holders":
            return rightMetrics.holdersCount - leftMetrics.holdersCount;
          case "volume":
            return rightMetrics.volumeUsd - leftMetrics.volumeUsd;
          case "graduated":
          case "draft":
          case "trending":
          default:
            return rightMetrics.trendScore - leftMetrics.trendScore;
        }
      });
  }, [activeMode, bnbUsd, campaigns, search]);

  return (
    <div className="space-y-3 px-1 pb-10">
      <section className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,16,22,0.96),rgba(7,8,11,0.98))] p-3 md:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              {terminalModes.map((mode) => {
                const active = activeMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setActiveMode(mode.key)}
                    className={`text-sm font-semibold transition-colors md:text-lg ${active ? "text-white" : mode.type === "sort" ? "text-emerald-200/90 hover:text-white" : "text-white/55 hover:text-white"}`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
              <span>{filteredCampaigns.length} visible</span>
              <span>•</span>
              <span>{campaigns.length} total</span>
              <span>•</span>
              <span>{activeMode === "mcap" || activeMode === "holders" || activeMode === "volume" ? `sorted by ${activeMode}` : `${activeMode} feed`}</span>
            </div>
          </div>

          <label className="flex min-w-[240px] items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-white/70 focus-within:border-accent/40">
            <Search className="h-4 w-4 text-white/45" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,23,29,0.96),rgba(14,15,19,0.98))]">
        <div className="hidden grid-cols-[minmax(320px,1.55fr)_110px_110px_110px_90px_130px_28px] gap-3 border-b border-white/10 px-4 py-2.5 text-xs font-medium text-white/65 lg:grid">
          <div>Pair info</div>
          <div>Market Cap</div>
          <div>Liquidity</div>
          <div>Volume</div>
          <div>Holders</div>
          <div>ATH</div>
          <div />
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-white/55">Loading War Room coins…</div>
          ) : filteredCampaigns.length ? (
            filteredCampaigns.map((campaign) => <WarRoomCampaignRow key={campaign.campaign} campaign={campaign} bnbUsd={bnbUsd ?? 0} />)
          ) : (
            <div className="py-10 text-center text-sm text-white/55">No coins match the current War Room filter.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WarRoom;
