import { useEffect, useMemo, useState } from "react";
import { FeaturedCampaigns } from "@/components/home/FeaturedCampaigns";
import { CampaignGrid, HomeQuery } from "@/components/home/CampaignGrid";
import { DiscoveryControls } from "@/components/home/DiscoveryControls";
import { DraftCampaignGrid } from "@/components/home/DraftCampaignGrid";
import { HeaderBand } from "@/components/home/HeaderBand";
import { LeagueRecruiterSlider } from "@/components/home/LeagueRecruiterSlider";

const Showcase = () => {
  const [query, setQuery] = useState<HomeQuery>({ tab: "drafts", timeFilter: "24h", search: "" });

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
      tab: query.tab ?? "drafts",
    } as HomeQuery;
  }, [query]);

  const isDraftRow = effectiveQuery.tab === "drafts";

  return (
    <div className="mwz-launchpad-page h-full overflow-y-auto">
      <div className="mwz-launchpad-inner relative px-1 md:px-2 pb-10 space-y-3">
        <HeaderBand />

        <div className="mwz-featured-layout grid gap-3 xl:grid-cols-[minmax(0,1fr)_480px] items-start">
          <FeaturedCampaigns />
          <LeagueRecruiterSlider className="w-full" />
        </div>

        <div className="mwz-live-heading flex flex-col gap-1 pt-2">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent">
            {isDraftRow ? "Prepare Mode" : "Live Warzone"}
          </div>
          <h2 className="mwz-section-title text-2xl text-success md:text-3xl">
            {isDraftRow ? "Draft Campaigns" : "Explore Campaigns"}
          </h2>
          <p className="max-w-2xl text-sm text-success/65">
            {isDraftRow
              ? ""
              : ""}
          </p>
        </div>

        <DiscoveryControls query={effectiveQuery} onChange={setQuery} />
        {isDraftRow ? <DraftCampaignGrid query={effectiveQuery} /> : <CampaignGrid query={effectiveQuery} />}
      </div>
    </div>
  );
};

export default Showcase;
