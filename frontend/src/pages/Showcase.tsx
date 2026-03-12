import { useEffect, useMemo, useState } from "react";
import { FeaturedCampaigns } from "@/components/home/FeaturedCampaigns";
import { CampaignGrid, HomeQuery } from "@/components/home/CampaignGrid";
import { DiscoveryControls } from "@/components/home/DiscoveryControls";
import { HeaderBand } from "@/components/home/HeaderBand";
import { LeagueOverlayCard } from "@/components/home/LeagueOverlayCard";


const Showcase = () => {
  const [query, setQuery] = useState<HomeQuery>({ tab: "trending", timeFilter: "24h", search: "" });

  // Optional: keep TopBar typeahead behavior, but also allow "filter in place" for the Home grid.
  useEffect(() => {
    const onSearch = (e: any) => {
      const q = String(e?.detail ?? "");
      setQuery((prev) => ({ ...prev, search: q }));
    };
    window.addEventListener("MemeBattles:homeSearch", onSearch);
    return () => window.removeEventListener("MemeBattles:homeSearch", onSearch);
  }, []);

  const effectiveQuery = useMemo(() => {
    return {
      ...query,
      // default tab should be trending
      tab: query.tab ?? "trending",
    } as HomeQuery;
  }, [query]);

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.18)),radial-gradient(circle_at_8%_16%,rgba(255,148,28,0.15),transparent_20%),radial-gradient(circle_at_86%_14%,rgba(255,120,0,0.10),transparent_20%),radial-gradient(circle_at_50%_44%,rgba(255,120,0,0.08),transparent_22%)]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(135deg,transparent_0%,transparent_48%,rgba(255,255,255,0.08)_49%,transparent_50%)] [background-size:34px_34px]" />
        <div className="absolute left-[6%] top-24 h-56 w-56 rounded-full bg-orange-500/12 blur-3xl" />
        <div className="absolute right-[8%] top-52 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(ellipse_at_bottom,rgba(255,110,0,0.08),transparent_48%),linear-gradient(180deg,transparent,rgba(0,0,0,0.20))]" />
        <div className="absolute left-0 right-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.38))]" />
       </div>

      <div className="relative px-3 md:px-6 pb-10">
        <HeaderBand />

        {/* Featured + League card row */}
        <div className="relative -translate-y-8 md:-translate-y-[4.25rem] rounded-[1.95rem] border border-white/10 bg-[linear-gradient(180deg,rgba(55,59,67,0.40),rgba(14,16,20,0.72))] p-3 md:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_48px_rgba(0,0,0,0.26)]">
          <div className="pointer-events-none absolute inset-0 rounded-[1.95rem] bg-[linear-gradient(135deg,transparent_0%,transparent_42%,rgba(255,255,255,0.04)_43%,transparent_44%,transparent)] bg-[length:44px_44px] opacity-20" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,transparent,#f8cf45_16%,#ff9726_52%,#ff5a0d_84%,transparent)]" />
          <div className="pointer-events-none absolute left-4 top-4 h-2.5 w-2.5 rounded-full bg-stone-500/80" />
          <div className="pointer-events-none absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-stone-500/80" />
          <div className="pointer-events-none absolute left-4 bottom-4 h-2.5 w-2.5 rounded-full bg-stone-500/80" />
          <div className="pointer-events-none absolute right-4 bottom-4 h-2.5 w-2.5 rounded-full bg-stone-500/80" />

          <div className="md:hidden mt-2 mb-5">
            <LeagueOverlayCard className="w-full max-w-[460px] mx-auto" />
          </div>

          <div className="hidden md:flex gap-5 items-start">
            <div className="flex-1 min-w-0">
              <FeaturedCampaigns />
            </div>
            <div className="w-[300px] shrink-0">
              <LeagueOverlayCard className="w-full" />
            </div>
          </div>

          <div className="md:hidden">
            <FeaturedCampaigns />
          </div>
        </div>

        {/* Tabs / filters / sort / search */}
        <div className="relative mt-5 -translate-y-8 md:-translate-y-[4.25rem] rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(56,60,68,0.76),rgba(16,18,22,0.94))] p-3 md:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_38px_rgba(0,0,0,0.24)]">
          <div className="pointer-events-none absolute inset-0 rounded-[1.8rem] bg-[linear-gradient(135deg,transparent_0%,transparent_48%,rgba(255,255,255,0.04)_49%,transparent_50%)] bg-[length:36px_36px] opacity-20" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,190,84,0.42),transparent)]" />
          <DiscoveryControls query={effectiveQuery} onChange={setQuery} />
        </div>

        {/* Main campaign browsing surface (paged / infinite) */}
        <div className="relative mt-4 -translate-y-8 md:-translate-y-[4.25rem] rounded-[1.95rem] border border-white/10 bg-[linear-gradient(180deg,rgba(58,62,70,0.78),rgba(15,17,21,0.97))] p-3 md:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_46px_rgba(0,0,0,0.28)]">
          <div className="pointer-events-none absolute inset-0 rounded-[1.95rem] bg-[linear-gradient(135deg,transparent_0%,transparent_48%,rgba(255,255,255,0.04)_49%,transparent_50%)] bg-[length:40px_40px] opacity-20" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,transparent,#f8cf45_16%,#ff9726_52%,#ff5a0d_84%,transparent)]" />
          <div className="pointer-events-none absolute left-4 top-4 h-2.5 w-2.5 rounded-full bg-stone-500/80" />
          <div className="pointer-events-none absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-stone-500/80" />
          <div className="pointer-events-none absolute left-4 bottom-4 h-2.5 w-2.5 rounded-full bg-stone-500/80" />
          <div className="pointer-events-none absolute right-4 bottom-4 h-2.5 w-2.5 rounded-full bg-stone-500/80" />
          <CampaignGrid query={effectiveQuery} />
        </div>
      </div>
    </div>
  );
};

export default Showcase;
