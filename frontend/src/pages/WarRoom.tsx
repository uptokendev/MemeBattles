import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { WarRoomCampaignRow } from "@/components/postgrad/WarRoomCampaignRow";
import { getWarRoomCampaignMetrics } from "@/features/postgrad/warRoomMetrics";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useWarRoomCampaignFeed, type WarRoomCampaign, type WarRoomMode } from "@/hooks/useWarRoomCampaignFeed";
import { useLaunchpad } from "@/lib/launchpadClient";

type SortKey = "marketCap" | "liquidity" | "volume" | "holders" | "ath";
type SortDirection = "desc" | "asc";

const terminalModes: Array<{ key: WarRoomMode; label: string }> = [
  { key: "trending", label: "Trending" },
  { key: "new", label: "New" },
  { key: "graduated", label: "Graduated" },
  { key: "draft", label: "Draft" },
];

const sortButtons: Array<{ key: SortKey; label: string }> = [
  { key: "marketCap", label: "Market Cap" },
  { key: "liquidity", label: "Liquidity" },
  { key: "volume", label: "Volume" },
  { key: "holders", label: "Holders" },
  { key: "ath", label: "ATH" },
];

function getSortValue(campaign: WarRoomCampaign, bnbUsd: number, sortKey: SortKey) {
  const metrics = getWarRoomCampaignMetrics(campaign, bnbUsd);
  switch (sortKey) {
    case "marketCap":
      return metrics.marketCapUsd;
    case "liquidity":
      return metrics.liquidityUsd;
    case "volume":
      return metrics.volumeUsd;
    case "holders":
      return metrics.holdersCount;
    case "ath":
      return metrics.athMarketCapUsd;
    default:
      return 0;
  }
}

const WarRoom = () => {
  const { activeChainId } = useLaunchpad();
  const { price: bnbUsd } = useBnbUsdPrice(true);
  const [search, setSearch] = useState("");
  const [activeMode, setActiveMode] = useState<WarRoomMode>("trending");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const { campaigns, loading, error, source } = useWarRoomCampaignFeed({
    activeMode,
    activeChainId: Number(activeChainId || 97),
    bnbUsd,
    search,
  });

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
        if (sortKey) {
          const leftValue = getSortValue(left, bnbUsd ?? 0, sortKey);
          const rightValue = getSortValue(right, bnbUsd ?? 0, sortKey);
          const delta = rightValue - leftValue;
          if (delta !== 0) return sortDirection === "desc" ? delta : -delta;
        }

        if (activeMode === "new") {
          return Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0);
        }

        const leftMetrics = getWarRoomCampaignMetrics(left, bnbUsd ?? 0);
        const rightMetrics = getWarRoomCampaignMetrics(right, bnbUsd ?? 0);
        return rightMetrics.trendScore - leftMetrics.trendScore;
      });
  }, [activeMode, bnbUsd, campaigns, search, sortDirection, sortKey]);

  const handleSortClick = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("desc");
  };

  const handleModeClick = (nextMode: WarRoomMode) => {
    setActiveMode(nextMode);
    setSortKey(null);
    setSortDirection("desc");
  };

  const sourceLabel = source === "api" ? "Campaign feed" : "Feed unavailable";
  const sourceTone = source === "api" ? "success" : "default";

  return (
    <div className="space-y-3 px-1 pb-10">
      <section className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,16,22,0.96),rgba(7,8,11,0.98))] p-3 md:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">War Room</div>
              <div className="mt-1 text-sm text-white/65">Scan live memecoin rows, compare market signals, and jump into token details or battle context from one terminal-style surface.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TacticalTag label={terminalModes.find((mode) => mode.key === activeMode)?.label ?? "Trending"} tone="sponsored" />
              <TacticalTag label={sourceLabel} tone={sourceTone} />
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-white/70 focus-within:border-accent/40">
            <Search className="h-4 w-4 text-white/45" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            {terminalModes.map((mode) => {
              const active = activeMode === mode.key && !sortKey;
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => handleModeClick(mode.key)}
                  className={`text-sm font-semibold transition-colors md:text-base ${active ? "text-white" : "text-white/55 hover:text-white"}`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {sortButtons.map((button) => {
              const active = sortKey === button.key;
              const directionLabel = active ? (sortDirection === "desc" ? "↓" : "↑") : "";
              return (
                <button
                  key={button.key}
                  type="button"
                  onClick={() => handleSortClick(button.key)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${active ? "border-white/25 bg-white/10 text-white" : "border-white/10 bg-black/20 text-white/65 hover:text-white"}`}
                >
                  {button.label} {directionLabel}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-orange-300/20 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
          War Room feed is unavailable right now. {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,23,29,0.96),rgba(14,15,19,0.98))]">
        <div className="hidden grid-cols-[minmax(320px,1.55fr)_110px_110px_110px_90px_130px_28px] gap-3 border-b border-white/10 px-4 py-2.5 text-xs font-medium text-white/65 lg:grid">
          <div>Memecoin info</div>
          {sortButtons.map((button) => {
            const active = sortKey === button.key;
            const directionLabel = active ? (sortDirection === "desc" ? "↓" : "↑") : "";
            return (
              <button
                key={button.key}
                type="button"
                onClick={() => handleSortClick(button.key)}
                className={`flex items-center gap-1 text-left transition-colors ${active ? "text-white" : "text-white/65 hover:text-white"}`}
              >
                <span>{button.label}</span>
                <span className="text-[10px] text-white/45">{directionLabel}</span>
              </button>
            );
          })}
          <div />
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-white/55">Loading War Room coins…</div>
          ) : filteredCampaigns.length ? (
            filteredCampaigns.map((campaign) => <WarRoomCampaignRow key={campaign.campaign} campaign={campaign} bnbUsd={bnbUsd ?? 0} />)
          ) : (
            <div className="py-10 text-center text-sm text-white/55">
              {source === "empty"
                ? "War Room campaign data is not available on this branch yet."
                : search.trim()
                  ? "No coins match the current War Room filter."
                  : "No War Room campaigns are available right now."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WarRoom;
