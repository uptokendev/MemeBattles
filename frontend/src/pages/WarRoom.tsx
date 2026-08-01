import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ChainFeedSwitch, useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";
import { WarRoomCampaignRow } from "@/components/postgrad/WarRoomCampaignRow";
import { ContentContainer } from "@/components/layout/ContentContainer";
import { getWarRoomCampaignMetrics } from "@/features/postgrad/warRoomMetrics";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useWarRoomCampaignFeed, type WarRoomCampaign, type WarRoomMode } from "@/hooks/useWarRoomCampaignFeed";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

type SortKey = "marketCap" | "liquidity" | "volume" | "holders" | "ath" | "follows" | "optIns" | "comments";
type SortDirection = "desc" | "asc";

const terminalModes: Array<{ key: WarRoomMode; label: string }> = [
  { key: "trending", label: "Trending" },
  { key: "new", label: "New" },
  { key: "graduated", label: "Graduated" },
  { key: "draft", label: "Drafts" },
];

const marketSortButtons: Array<{ key: SortKey; label: string }> = [
  { key: "marketCap", label: "Market Cap" },
  { key: "liquidity", label: "Liquidity" },
  { key: "volume", label: "Volume" },
  { key: "holders", label: "Holders" },
  { key: "ath", label: "All-time high" },
];

const draftSortButtons: Array<{ key: SortKey; label: string }> = [
  { key: "follows", label: "Follows" },
  { key: "optIns", label: "Opt-Ins" },
  { key: "comments", label: "Comments" },
];

function draftMetricValue(campaign: WarRoomCampaign, key: "follows" | "optIns" | "comments") {
  const rich = campaign as any;
  const value =
    key === "follows"
      ? rich.draftFollowCount
      : key === "optIns"
        ? rich.draftOptInCount
        : rich.draftCommentCount;
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

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
    case "follows":
      return draftMetricValue(campaign, "follows");
    case "optIns":
      return draftMetricValue(campaign, "optIns");
    case "comments":
      return draftMetricValue(campaign, "comments");
    default:
      return 0;
  }
}

const WarRoom = () => {
  const [selectedChainId] = useSelectedFeedChainId();
  const { price: bnbUsd } = useBnbUsdPrice(true);
  const [search, setSearch] = useState("");
  const [activeMode, setActiveMode] = useState<WarRoomMode>("trending");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { campaigns: rawCampaigns, loading, error, source } = useWarRoomCampaignFeed({
    activeMode,
    activeChainId: Number(selectedChainId || 97),
    bnbUsd,
    search,
  });

  const [logoCache, setLogoCache] = useState<Record<string, string>>({});
  const { fetchCampaignLogoURI } = useLaunchpad();
  const metricButtons = activeMode === "draft" ? draftSortButtons : marketSortButtons;

  useEffect(() => {
    setLogoCache({});
  }, [selectedChainId]);

  useEffect(() => {
    let cancelled = false;
    const missing = (rawCampaigns || [])
      .filter((c) => !String((c as any).campaign || "").startsWith("draft:"))
      .map((c) => c.campaign?.toLowerCase())
      .filter((addr): addr is string => !!addr)
      .filter((addr) => !logoCache[addr])
      .slice(0, 12);

    if (!missing.length) return;

    (async () => {
      try {
        // Sequential logo fetch — avoid browser connection exhaustion.
        const next: Record<string, string> = {};
        for (const addr of missing) {
          if (cancelled) return;
          const uri = await fetchCampaignLogoURI(addr).catch(() => null);
          if (uri) next[addr] = uri;
        }
        if (cancelled || !Object.keys(next).length) return;
        setLogoCache((prev) => ({ ...prev, ...next }));
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit logoCache from deps to prevent re-entry storms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCampaigns, fetchCampaignLogoURI]);

  const campaigns = useMemo(() => {
    return (rawCampaigns || []).map((c) => {
      const key = c.campaign?.toLowerCase();
      const hydratedLogo = key && logoCache[key] ? logoCache[key] : c.logoURI;
      return {
        ...c,
        chainId: Number((c as any).chainId || selectedChainId),
        logoURI: resolveImageUri(hydratedLogo) || c.logoURI || "/placeholder.svg",
      };
    });
  }, [rawCampaigns, logoCache, selectedChainId]);

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

        if (activeMode === "draft") {
          return draftMetricValue(right, "follows") - draftMetricValue(left, "follows");
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

  return (
    <ContentContainer className="space-y-4 px-3 pb-10 pt-20 md:px-5 md:pt-24 lg:pt-24">
      <section className="mwz-hud-frame px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.28em] text-orange-400">Trade War Room</div>
              <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.08em] text-white md:text-3xl">War Trade Room</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ChainFeedSwitch />
            </div>
          </div>

          <label className="flex items-center gap-3 border border-[var(--mwz-flat-card-border)] bg-black/25 px-3 py-2.5 text-white/70 focus-within:border-orange-400/50">
            <Search className="h-4 w-4 text-white/45" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {terminalModes.map((mode) => {
              const active = activeMode === mode.key && !sortKey;
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => handleModeClick(mode.key)}
                  className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${active ? "border-orange-400/60 bg-orange-500/10 text-orange-300" : "border-[var(--mwz-flat-card-border)] bg-black/20 text-white/58 hover:border-[var(--mwz-flat-card-border-strong)] hover:bg-white/[0.035] hover:text-white"}`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {metricButtons.map((button) => {
              const active = sortKey === button.key;
              const directionLabel = active ? (sortDirection === "desc" ? "↓" : "↑") : "";
              return (
                <button
                  key={button.key}
                  type="button"
                  onClick={() => handleSortClick(button.key)}
                  className={`shrink-0 border px-3 py-1.5 text-[11px] font-medium transition-colors ${active ? "border-orange-400/60 bg-orange-500/10 text-orange-200" : "border-[var(--mwz-flat-card-border)] bg-black/20 text-white/65 hover:border-[var(--mwz-flat-card-border-strong)] hover:text-white"}`}
                >
                  {button.label} {directionLabel}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error ? (
        <div className="mwz-card border-orange-300/25 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
          Trade data is unavailable right now. {error}
        </div>
      ) : null}

      <section className="mwz-hud-frame overflow-hidden">
        <div className={activeMode === "draft"
          ? "hidden grid-cols-[minmax(320px,1.55fr)_110px_110px_110px] gap-3 border-b border-[var(--mwz-flat-card-border)] px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-white/58 lg:grid"
          : "hidden grid-cols-[minmax(320px,1.55fr)_110px_110px_110px_90px_130px_28px] gap-3 border-b border-[var(--mwz-flat-card-border)] px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-white/58 lg:grid"}
        >
          <div>Coin info</div>
          {metricButtons.map((button) => {
            const active = sortKey === button.key;
            const directionLabel = active ? (sortDirection === "desc" ? "↓" : "↑") : "";
            return (
              <button
                key={button.key}
                type="button"
                onClick={() => handleSortClick(button.key)}
                className={`flex items-center gap-1 text-left transition-colors ${active ? "text-orange-300" : "text-white/58 hover:text-white"}`}
              >
                <span>{button.label}</span>
                <span className="text-[10px] text-white/45">{directionLabel}</span>
              </button>
            );
          })}
          {activeMode !== "draft" ? <div /> : null}
        </div>
        <div>
          {loading ? (
            <div className="py-10 text-center text-sm text-white/55">Loading coins...</div>
          ) : filteredCampaigns.length ? (
            filteredCampaigns.map((campaign) => <WarRoomCampaignRow key={campaign.campaign} campaign={campaign} bnbUsd={bnbUsd ?? 0} />)
          ) : (
            <div className="py-10 text-center text-sm text-white/55">
              {source === "empty"
                ? activeMode === "draft" ? "No public drafts are available on this chain yet." : "Coin data isn't available right now."
                : search.trim()
                  ? "No coins match your filters."
                  : "No coins are available right now."}
            </div>
          )}
        </div>
      </section>
    </ContentContainer>
  );
};

export default WarRoom;
