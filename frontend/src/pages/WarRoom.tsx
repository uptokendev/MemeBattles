import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { WarRoomCampaignRow } from "@/components/postgrad/WarRoomCampaignRow";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";

const WarRoom = () => {
  const { fetchCampaigns } = useLaunchpad();
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const results = await fetchCampaigns();
        if (cancelled) return;
        setCampaigns(
          [...(results ?? [])].sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0)),
        );
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
    if (!search.trim()) return campaigns;
    const query = search.trim().toLowerCase();
    return campaigns.filter((campaign) =>
      `${campaign.name} ${campaign.symbol} ${campaign.creator} ${campaign.campaign}`.toLowerCase().includes(query),
    );
  }, [campaigns, search]);

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,14,20,0.94),rgba(4,6,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">War Room</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Scanner list first, token actions second.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">War Room is now a simplified campaign list. Expand any coin to see its slideout chart, open the same trading surface used by token details, or jump straight to the canonical token page.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-white/60">
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{filteredCampaigns.length} visible</div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{campaigns.length} total</div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-black/25 p-4 md:p-5">
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white/70 focus-within:border-accent/40">
          <Search className="h-4 w-4 text-white/45" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by coin name, symbol, creator, or campaign address"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </label>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,16,22,0.92),rgba(7,8,11,0.96))] px-4 py-2 md:px-5">
        {loading ? (
          <div className="py-10 text-center text-sm text-white/55">Loading War Room coins…</div>
        ) : filteredCampaigns.length ? (
          filteredCampaigns.map((campaign) => <WarRoomCampaignRow key={campaign.campaign} campaign={campaign} />)
        ) : (
          <div className="py-10 text-center text-sm text-white/55">No coins match the current search.</div>
        )}
      </section>
    </div>
  );
}

export default WarRoom;
