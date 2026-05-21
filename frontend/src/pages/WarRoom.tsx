import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { WarRoomCampaignRow } from "@/components/postgrad/WarRoomCampaignRow";
import { getWarRoomCampaignMetrics } from "@/features/postgrad/warRoomMetrics";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";

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

const WarRoom = () => {
  const { fetchCampaigns } = useLaunchpad();
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeMode, setActiveMode] = useState<WarRoomMode>("trending");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const results = await fetchCampaigns();
        if (cancelled) return;
        setCampaigns([...(results ?? [])]);
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
  }, [fetchCampaigns]);

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();

    return campaigns
      .filter((campaign) => {
        const metrics = getWarRoomCampaignMetrics(campaign);
        const matchesSearch = !query || `${campaign.name} ${campaign.symbol} ${campaign.creator} ${campaign.campaign}`.toLowerCase().includes(query);
        const matchesMode = activeMode === "graduated" ? metrics.status === "graduated" : activeMode === "draft" ? metrics.status === "draft" : true;
        return matchesSearch && matchesMode;
      })
      .sort((left, right) => {
        const leftMetrics = getWarRoomCampaignMetrics(left);
        const rightMetrics = getWarRoomCampaignMetrics(right);

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
  }, [activeMode, campaigns, search]);

  return (
    <div className="space-y-4 px-1 pb-10">
      <section className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,16,22,0.96),rgba(7,8,11,0.98))] p-4 md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
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
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
              <span>{filteredCampaigns.length} visible</span>
              <span>•</span>
              <span>{campaigns.length} total</span>
              <span>•</span>
              <span>{activeMode === "mcap" || activeMode === "holders" || activeMode === "volume" ? `sorted by ${activeMode}` : `${activeMode} feed`}</span>
            </div>
          </div>

          <label className="flex min-w-[260px] items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-white/70 focus-within:border-accent/40">
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
        <div className="grid grid-cols-[minmax(360px,1.55fr)_120px_120px_120px_110px_150px] gap-4 border-b border-white/10 px-4 py-3 text-xs font-medium text-white/65">
          <div>Pair info</div>
          <div>Market Cap</div>
          <div>Liquidity</div>
          <div>Volume</div>
          <div>Holders</div>
          <div>ATH</div>
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-white/55">Loading War Room coins…</div>
          ) : filteredCampaigns.length ? (
            filteredCampaigns.map((campaign) => <WarRoomCampaignRow key={campaign.campaign} campaign={campaign} />)
          ) : (
            <div className="py-10 text-center text-sm text-white/55">No coins match the current War Room filter.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WarRoom;
