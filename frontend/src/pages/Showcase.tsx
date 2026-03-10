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
    window.addEventListener("memebattles:homeSearch", onSearch);
    return () => window.removeEventListener("memebattles:homeSearch", onSearch);
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
        <div className="absolute left-[8%] top-24 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-[10%] top-56 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
      </div>

      <div className="relative px-3 md:px-6 pb-10">
        {/*
          Header band (logo + glow strip)
          IMPORTANT: avoid negative margins here — the scroll container clips anything pushed above its top.
          We align the logo by tightening App.tsx main padding instead.
        */}
        <HeaderBand />

        {/* Featured + League card row */}
        <div className="-translate-y-6 md:-translate-y-14 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(54,58,66,0.32),rgba(16,18,22,0.62))] p-3 md:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_44px_rgba(0,0,0,0.24)]">
           {/* Mobile: show the league card above featured */}
          <div className="md:hidden mt-2 mb-5">
            <LeagueOverlayCard className="w-full max-w-[460px] mx-auto" />
          </div>

          {/* Desktop: side-by-side so the league card has a fixed slot next to Featured */}
          <div className="hidden md:flex gap-5 items-start">
            <div className="flex-1 min-w-0">
              <FeaturedCampaigns />
            </div>
            <div className="w-[300px] shrink-0">
              <LeagueOverlayCard className="w-full" />
            </div>
          </div>

          {/* Mobile: featured below the league card */}
          <div className="md:hidden">
            <FeaturedCampaigns />
          </div>
        </div>

        {/* Tabs / filters / sort / search */}
        <div className="mt-5 -translate-y-6 md:-translate-y-14 rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(56,60,68,0.70),rgba(16,18,22,0.92))] p-3 md:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_38px_rgba(0,0,0,0.22)]">
           <DiscoveryControls query={effectiveQuery} onChange={setQuery} />
        </div>

        {/* Main campaign browsing surface (paged / infinite) */}
        <div className="mt-4 -translate-y-6 md:-translate-y-14 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(58,62,70,0.72),rgba(15,17,21,0.96))] p-3 md:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_46px_rgba(0,0,0,0.26)]">
           <CampaignGrid query={effectiveQuery} />
        </div>
      </div>
    </div>
  );
};

export default Showcase;
