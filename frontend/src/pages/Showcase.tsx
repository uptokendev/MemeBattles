import { useEffect, useMemo, useState } from "react";
import { FeaturedCampaigns } from "@/components/home/FeaturedCampaigns";
import { CampaignGrid, HomeQuery } from "@/components/home/CampaignGrid";
import { DiscoveryControls } from "@/components/home/DiscoveryControls";
import { HeaderBand } from "@/components/home/HeaderBand";
import { LeagueRecruiterSlider } from "@/components/home/LeagueRecruiterSlider";

const Showcase = () => {
  const [query, setQuery] = useState<HomeQuery>({ tab: "trending", timeFilter: "24h", search: "" });

  useEffect(() => {
    const onSearch = (e: Event) => {
      const q = String((e as CustomEvent<string>).detail ?? "");
      setQuery((prev) => ({ ...prev, search: q }));
    };
    window.addEventListener("memebattles:homeSearch", onSearch);
    return () => window.removeEventListener("memebattles:homeSearch", onSearch);
  }, []);

  const effectiveQuery = useMemo(() => {
    return {
      ...query,
      tab: query.tab ?? "trending",
    } as HomeQuery;
  }, [query]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative px-1 md:px-2 pb-10 space-y-3">
        <HeaderBand />

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px] items-start">
          <FeaturedCampaigns />
          <LeagueRecruiterSlider className="w-full" />
        </div>

        <DiscoveryControls query={effectiveQuery} onChange={setQuery} />
        <CampaignGrid query={effectiveQuery} />
      </div>
    </div>
  );
};

export default Showcase;
