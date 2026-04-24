/**
 * Main Application Component
 * Handles routing, layout structure, and loading screen display
 * Sets up global providers for query client, tooltips, and toasts
 */

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { WalletProvider } from "@/contexts/WalletContext";
import Showcase from "./pages/Showcase";
import Create from "./pages/Create";
import League from "./pages/League";
import LeagueDetail from "./pages/LeagueDetail";
import Profile from "./pages/Profile";
import TokenDetails from "./pages/TokenDetails";
import Playbook from "@/pages/Playbook";
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

const queryClient = new QueryClient();

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLoadComplete = () => {
    setIsLoading(false);
    // Delay showing content slightly for smooth transition
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
              <div className="h-screen overflow-hidden bg-transparent flex flex-col">
                <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
                <TopBar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
                <RankPromotionListener />
                {/*
                  TopBar is fixed-position, so main content needs top padding.
                  pt-20/pt-24 offsets the fixed TopBar so hero logos sit fully below it.
                */}
                {/* Allow page scrolling inside the app shell */}
                <main className="flex-1 overflow-auto pt-[4.75rem] md:pt-[5.25rem] px-4 md:px-6 lg:px-8 pb-4 md:pb-6 lg:pb-8">
                  <Routes>
                    <Route path="/" element={<Showcase />} />
                    <Route path="/create" element={<Create />} />
                    {/* New naming (keep old paths as aliases) */}
                    <Route path="/battle-leagues" element={<League />} />
                    <Route path="/battle-leagues/:leagueKey" element={<LeagueDetail />} />
                    <Route path="/league" element={<League />} />
                    <Route path="/profile" element={<Profile />} />
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
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  <Footer />
                </main>
              </div>
            </BrowserRouter>
          </div>
        </TooltipProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
};

export default App;
