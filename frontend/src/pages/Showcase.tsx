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
    <div className="h-full overflow-y-auto">
      <div className="relative px-3 md:px-6 pb-10">
        {/*
          Header band (logo + glow strip)
          IMPORTANT: avoid negative margins here — the scroll container clips anything pushed above its top.
          We align the logo by tightening App.tsx main padding instead.
        */}
        <HeaderBand />

        {/* Featured + League card row */}
        <div className="-translate-y-6 md:-translate-y-14">
          {/* Mobile: show the league card above featured */}
          <div className="md:hidden mt-2 mb-5">
            <LeagueOverlayCard className="w-full max-w-[460px] mx-auto" />
          </div>

          {/* Desktop: side-by-side so the league card has a fixed slot next to Featured */}
          <div className="hidden md:flex gap-4 items-start">
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
        <div className="mt-5 -translate-y-6 md:-translate-y-14">
          <DiscoveryControls query={effectiveQuery} onChange={setQuery} />
        </div>

        {/* Main campaign browsing surface (paged / infinite) */}
        <div className="mt-4 -translate-y-6 md:-translate-y-14">
          <CampaignGrid query={effectiveQuery} />
        </div>
      </div>
    </div>
  );
};

export default Showcase;
