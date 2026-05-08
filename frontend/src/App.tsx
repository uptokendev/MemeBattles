/**
 * Main Application Component
 * Handles routing, layout structure, and loading screen display
 * Sets up global providers for query client, tooltips, and toasts
 */

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { WalletProvider } from "@/contexts/WalletContext";
import Showcase from "./pages/Showcase";
import Create from "./pages/Create";
import PromotionSetup from "./pages/PromotionSetup";
import PublicPromotion from "./pages/PublicPromotion";
import League from "./pages/League";
import LeagueDetail from "./pages/LeagueDetail";
import ProfilePage from "./pages/ProfilePage";
import TokenDetails from "./pages/TokenDetails";
import Playbook from "@/pages/Playbook";
import Prepare from "./pages/Prepare";
import DraftPromotionSetup from "./pages/DraftPromotionSetup";
import PushDraftLive from "./pages/PushDraftLive";
import RecruiterDashboard from "./pages/RecruiterDashboard";
import RecruiterLeaderboard from "./pages/RecruiterLeaderboard";
import Recruiter from "./pages/Recruiter";
import RecruiterProfile from "./pages/RecruiterProfile";
import RecruiterSignup from "./pages/RecruiterSignup";
import RecruiterReferral from "./pages/RecruiterReferral";
import AirdropOverview from "./pages/AirdropOverview";
import AirdropWinners from "./pages/AirdropWinners";
import SquadLeaderboard from "./pages/SquadLeaderboard";
import SquadDashboard from "./pages/SquadDashboard";
import RewardOps from "./pages/RewardOps";
import Status from "./pages/Status";
import NotFound from "./pages/NotFound";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { RankPromotionListener } from "@/components/rank/RankPromotionListener";
import { Footer } from "@/components/layout/Footer";
import { ScreenFrame } from "@/components/layout/ScreenFrame";

const queryClient = new QueryClient();

function InternalLinkInterceptor() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;

      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const rawHref = anchor.getAttribute("href") || "";
      if (!rawHref) return;
      if (rawHref.startsWith("#")) return;
      if (/^(mailto:|tel:|sms:)/i.test(rawHref)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/assets/") ||
        url.pathname.startsWith("/favicon") ||
        url.pathname.startsWith("/robots.txt")
      ) {
        return;
      }

      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${location.pathname}${location.search}${location.hash}`;

      event.preventDefault();
      if (next !== current) navigate(next);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate, location.pathname, location.search, location.hash]);

  return null;
}


const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLoadComplete = () => {
    setIsLoading(false);
    setTimeout(() => setShowContent(true), 100);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {isLoading && <LoadingScreen onLoadComplete={handleLoadComplete} />}
          <div
            className={`transition-all duration-700 ${
              showContent ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            <BrowserRouter>
            <InternalLinkInterceptor />
              <div className="mwz-app-shell h-screen overflow-hidden flex flex-col">
                <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
                <TopBar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
                <RankPromotionListener />
                <main className="flex-1 overflow-auto pt-[5.1rem] md:pt-[5.4rem] px-2 md:px-3 lg:px-4 pb-4 md:pb-6 lg:pb-8">
                  <Routes>
                    <Route path="/" element={<Showcase />} />
                    <Route path="/create" element={<Create />} />
                    <Route path="/drafts/:draftId/promotion" element={<DraftPromotionSetup />} />
                    <Route path="/drafts/:draftId/push-live" element={<PushDraftLive />} />
                    <Route path="/prepare/:slug" element={<Prepare />} />
                    <Route path="/battle-leagues" element={<League />} />
                    <Route path="/battle-leagues/:leagueKey" element={<LeagueDetail />} />
                    <Route path="/league" element={<League />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/profile/:identifier" element={<ProfilePage />} />
                    <Route path="/airdrops" element={<AirdropOverview />} />
                    <Route path="/airdrops/winners" element={<AirdropWinners />} />
                    <Route path="/recruiter" element={<Recruiter />} />
                    <Route path="/recruiter/signup" element={<RecruiterSignup />} />
                    <Route path="/recruiters" element={<RecruiterLeaderboard />} />
                    <Route path="/recruiters/:code" element={<RecruiterProfile />} />
                    <Route path="/recruiter-dashboard" element={<RecruiterDashboard />} />
                    <Route path="/squads" element={<SquadLeaderboard />} />
                    <Route path="/squad-dashboard" element={<SquadDashboard />} />
                    <Route path="/ops/rewards" element={<RewardOps />} />
                    <Route path="/r/:code" element={<RecruiterReferral />} />
                    <Route path="/token/:campaignAddress" element={<TokenDetails />} />
                    <Route path="/playbook" element={<Playbook />} />
                    <Route path="/docs" element={<Playbook />} />
                    <Route path="/status" element={<Status />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  <Footer />
                </main>
                <ScreenFrame />
              </div>
            </BrowserRouter>
          </div>
        </TooltipProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
};

export default App;
