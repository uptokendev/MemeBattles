import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/contexts/WalletContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { RankPromotionListener } from "@/components/RankPromotionListener";
import Showcase from "./pages/Showcase";
import Create from "./pages/Create";
import Prepare from "./pages/Prepare";
import Live from "./pages/Live";
import ProfilePage from "./pages/Profile";
import TokenDetails from "./pages/TokenDetails";
import HowItWorks from "./pages/HowItWorks";
import DraftPromotionSetup from "./pages/DraftPromotionSetup";
import PushDraftLive from "./pages/PushDraftLive";
import NotFound from "./pages/NotFound";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { LiveStreamOverlay } from "@/components/live/LiveStreamOverlay";
import { Footer } from "@/components/layout/Footer";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { TokenSocialLinksOverlay } from "@/components/social/SocialLinksOverlay";
import { PrepareHeroImagePortal } from "@/components/prepare/PrepareHeroImagePortal";
import { CommandCenterShell } from "@/components/command-center/CommandCenterShell";
import { LegacyCommandCenterRedirect } from "@/components/command-center/LegacyCommandCenterRedirect";
import { ProfileWalletFallbackRedirect } from "@/components/command-center/ProfileWalletFallbackRedirect";
import CommandCenterOverview from "@/pages/command-center/CommandCenterOverview";
import CommandCenterRecruiter from "@/pages/command-center/CommandCenterRecruiter";
import CommandCenterSquad from "@/pages/command-center/CommandCenterSquad";
import CommandCenterAirdrops from "@/pages/command-center/CommandCenterAirdrops";
import CommandCenterClaims from "@/pages/command-center/CommandCenterClaims";
import CommandCenterSettings from "@/pages/command-center/CommandCenterSettings";
import CommandCenterSocial from "@/pages/command-center/CommandCenterSocial";
import CommandCenterCoins from "@/pages/command-center/CommandCenterCoins";

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
              <PrepareHeroImagePortal />
              <div className="mwz-app-shell h-screen overflow-hidden flex flex-col">
                <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
                <TopBar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
                <RankPromotionListener />
                <LiveStreamOverlay />
                <main className="flex-1 overflow-auto scroll-pt-[2.75rem] pt-[2.45rem] px-2 md:px-3 lg:px-4 pb-4 md:pb-6 lg:pb-8">
                  <Routes>
                    <Route path="/" element={<Showcase />} />
                    <Route path="/launchpad" element={<Showcase />} />
                    <Route path="/create" element={<Create />} />
                    <Route path="/drafts/:draftId/promotion" element={<DraftPromotionSetup />} />
                    <Route path="/drafts/:draftId/push-live" element={<PushDraftLive />} />
                    <Route path="/prepare/:slug" element={<Prepare />} />
                    <Route path="/live" element={<Live />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/command" element={<LegacyCommandCenterRedirect section="overview" />} />
                    <Route path="/command/recruiter" element={<LegacyCommandCenterRedirect section="recruiter" />} />
                    <Route path="/command/squad" element={<LegacyCommandCenterRedirect section="squad" />} />
                    <Route path="/command/airdrops" element={<LegacyCommandCenterRedirect section="airdrops" />} />
                    <Route path="/command/claims" element={<LegacyCommandCenterRedirect section="claims" />} />
                    <Route path="/command/social" element={<LegacyCommandCenterRedirect section="social" />} />
                    <Route path="/command/coins" element={<LegacyCommandCenterRedirect section="coins" />} />
                    <Route path="/profile/:address/command" element={<CommandCenterShell />}>
                      <Route index element={<CommandCenterOverview />} />
                      <Route path="overview" element={<CommandCenterOverview />} />
                      <Route path="recruiter" element={<CommandCenterRecruiter />} />
                      <Route path="squad" element={<CommandCenterSquad />} />
                      <Route path="airdrops" element={<CommandCenterAirdrops />} />
                      <Route path="claims" element={<CommandCenterClaims />} />
                      <Route path="social" element={<CommandCenterSocial />} />
                      <Route path="coins" element={<CommandCenterCoins />} />
                      <Route path="settings" element={<CommandCenterSettings />} />
                    </Route>
                    <Route path="/profile/command" element={<ProfileWalletFallbackRedirect />} />
                    <Route path="/profile/command/:section" element={<ProfileWalletFallbackRedirect />} />
                    <Route path="/token/:campaignAddress" element={<TokenDetails />} />
                    <Route path="/launch/:campaignAddress" element={<TokenDetails />} />
                    <Route path="/how-it-works" element={<HowItWorks />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </main>
                <Footer />
                <ScreenFrame />
                <TokenSocialLinksOverlay />
              </div>
            </BrowserRouter>
          </div>
        </TooltipProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
};

export default App;
