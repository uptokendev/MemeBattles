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
    window.addEventListener("upmeme:homeSearch", onSearch);
    return () => window.removeEventListener("upmeme:homeSearch", onSearch);
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

        {/* League overlay: positioned under the TopBar connect wallet area */}
        <div className="absolute right-3 md:right-6 top-8 md:top-3 z-30 pointer-events-none">
          <LeagueOverlayCard className="pointer-events-auto" />
        </div>

        {/* Featured grid (UpVote campaigns) */}
        <div className="md:pr-[320px] -translate-y-8">
          <FeaturedCampaigns />
        </div>

        {/* Tabs / filters / sort / search */}
        <div className="mt-5 md:pr-[320px]">
          <DiscoveryControls query={effectiveQuery} onChange={setQuery} />
        </div>

        {/* Main campaign browsing surface (paged / infinite) */}
        <div className="mt-4">
          <CampaignGrid query={effectiveQuery} />
        </div>
      </div>
    </div>
  );
};

export default Showcase;
