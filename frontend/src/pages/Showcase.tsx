import { useEffect, useMemo, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CampaignGrid, HomeQuery } from "@/components/home/CampaignGrid";
import { DiscoveryControls } from "@/components/home/DiscoveryControls";
import { DraftCampaignGrid } from "@/components/home/DraftCampaignGrid";
import { FeaturedCampaigns } from "@/components/home/FeaturedCampaigns";
import { HeaderBand } from "@/components/home/HeaderBand";
import { AudienceCard } from "@/components/home/HomeAudienceCtas";
import { CampaignTickerBar } from "@/components/home/CampaignTickerBar";
import { ContentContainer } from "@/components/layout/ContentContainer";
import { useWallet } from "@/contexts/WalletContext";

// Public static assets (moved out of src for easier editing/cropping)
const recruiterBg = "/assets/home/cta-recruiters-bg.png";
const recruiterSoldier = "/assets/home/cta-recruiter-soldier.png";

const Showcase = () => {
  const [query, setQuery] = useState<HomeQuery>({ tab: "trending", timeFilter: "24h", search: "", status: "all" });

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

  const isDraftRow = effectiveQuery.tab === "drafts";

  const navigate = useNavigate();
  const wallet = useWallet();
  const [pendingRecruiterRedirect, setPendingRecruiterRedirect] = useState(false);

  useEffect(() => {
    if (!pendingRecruiterRedirect || !wallet.account) return;

    setPendingRecruiterRedirect(false);
    navigate(`/profile/${wallet.account.toLowerCase()}/command/recruiter`);
  }, [pendingRecruiterRedirect, wallet.account, navigate]);

  const handleRecruiterClick = async () => {
    if (wallet.account) {
      navigate(`/profile/${wallet.account.toLowerCase()}/command/recruiter`);
      return;
    }

    setPendingRecruiterRedirect(true);

    try {
      await wallet.connect();
    } catch {
      setPendingRecruiterRedirect(false);
    }
  };

  return (
    <div className="mwz-launchpad-page h-full overflow-y-auto">
      {/* Hero section stays full width */}
      <div className="mwz-launchpad-inner">
        <HeaderBand showTicker={false} />
      </div>

      {/* All content below the hero (including ticker) uses standard constrained width */}
      <ContentContainer className="relative px-1 md:px-2 pb-10 space-y-3">
        {/* Pull ticker flush against the bottom of the full-width hero */}
        <CampaignTickerBar className="-mt-12 !pt-0" />

        <div className="relative z-20 -mt-1 mb-2 md:-mt-2 md:mb-3">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            {/* Featured Campaigns - bare so individual cards float like the drafts below */}
            <div className="flex-1 min-w-0">
              <FeaturedCampaigns bare />
            </div>

            {/* Recruiter card on the right - sized + positioned per annotation in thisweneed2.png */}
            <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 lg:pt-10">
              <AudienceCard
                tone="recruiter"
                title="Recruiters"
                kicker="We’re looking for YOU."
                body="Recruit your Squad, bring in coin creators and traders, and become the force that drives visibility and growth."
                buttonLabel="Join as Recruiter"
                footer="Scout • Recruit • Earn"
                bg={recruiterBg}
                soldier={recruiterSoldier}
                onClick={handleRecruiterClick}
                size="sm"
                className="h-full"
              />
            </div>
          </div>
        </div>

        <div className="mwz-live-heading flex flex-col gap-1 pt-2">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent">
            {isDraftRow ? "Prepare Mode" : "Live Warzone"}
          </div>
          <h2 className="mwz-section-title text-2xl text-success md:text-3xl">
            {isDraftRow ? "Draft Campaigns" : "Explore Campaigns"}
          </h2>
          <p className="max-w-2xl text-sm text-success/65">
            {isDraftRow ? "Drafts waiting for launch." : "Live, new, ending, and graduated campaigns across the selected chain."}
          </p>
        </div>

        <DiscoveryControls query={effectiveQuery} onChange={setQuery} />
        {isDraftRow ? <DraftCampaignGrid query={effectiveQuery} /> : <CampaignGrid query={effectiveQuery} />}
      </ContentContainer>
    </div>
  );
};

export default Showcase;
