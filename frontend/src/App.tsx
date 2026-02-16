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
import Status from "./pages/Status";
import NotFound from "./pages/NotFound";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

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
            <div className="h-screen overflow-hidden bg-black flex flex-col">
              <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
              <TopBar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
              {/*
                TopBar is fixed-position, so main content needs top padding.
                pt-14 (~56px) matches the TopBar height more closely and removes the
                extra dead space above the hero/logo.
              */}
              {/* Allow page scrolling inside the app shell */}
              <main className="flex-1 overflow-auto pt-4 px-4 md:px-6 lg:px-8 pb-4 md:pb-6 lg:pb-8">
                <Routes>
                  <Route path="/" element={<Showcase />} />
                  <Route path="/create" element={<Create />} />
                  {/* New naming (keep old paths as aliases) */}
                  <Route path="/battle-leagues" element={<League />} />
                  <Route path="/battle-leagues/:leagueKey" element={<LeagueDetail />} />
                  <Route path="/league" element={<League />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/token/:campaignAddress" element={<TokenDetails />} />
                  <Route path="/docs" element={<Playbook />} />
            <Route path="/playbook" element={<Playbook />} />
            <Route path="/docs" element={<Playbook />} />
                  <Route path="/status" element={<Status />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
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
