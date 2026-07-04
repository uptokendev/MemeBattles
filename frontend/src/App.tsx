/**
 * Main Application Component
 * Handles routing, layout structure, and loading screen display
 * Sets up global providers for query client, tooltips, and toasts
 */

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type CSSProperties } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { WalletProvider } from "@/contexts/WalletContext";
import { SolanaWalletProvider } from "@/contexts/SolanaWalletContext";
import Showcase from "./pages/Showcase";
import Arena from "./pages/Arena";
import ArenaBattles from "./pages/ArenaBattles";
import WarRoom from "./pages/WarRoom";
import BattleDetails from "./pages/BattleDetails";
import PostGradEvents from "./pages/PostGradEvents";
import PostGradLeague from "./pages/PostGradLeague";
import League from "./pages/League";
import TournamentDetails from "./pages/TournamentDetails";
import Create from "./pages/Create";
import SponsorshipApplication from "./pages/SponsorshipApplication";
import ProfilePage from "./pages/ProfilePage";
import TokenDetails from "./pages/TokenDetails";
import Playbook from "@/pages/Playbook";
import Prepare from "./pages/Prepare";
import Live from "./pages/Live";
import DraftPromotionSetup from "./pages/DraftPromotionSetup";
import PushDraftLive from "./pages/PushDraftLive";
import RecruiterLeaderboard from "./pages/RecruiterLeaderboard";
import Recruiter from "./pages/Recruiter";
import RecruiterProfile from "./pages/RecruiterProfile";
import RecruiterSignup from "./pages/RecruiterSignup";
import RecruiterReferral from "./pages/RecruiterReferral";
import AirdropOverview from "./pages/AirdropOverview";
import AirdropWinners from "./pages/AirdropWinners";
import SquadLeaderboard from "./pages/SquadLeaderboard";
import Status from "./pages/Status";
import NotFound from "./pages/NotFound";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { LeftBattleSidebar } from "@/components/LeftBattleSidebar";
import { RankPromotionListener } from "@/components/rank/RankPromotionListener";
import { LiveStreamOverlay } from "@/components/live/LiveStreamOverlay";
import { Footer } from "@/components/layout/Footer";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { TokenSafetyRouteOverlay } from "@/components/token/TokenSafetyRouteOverlay";
import { TokenSocialLinksOverlay } from "@/components/social/SocialLinksOverlay";
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
import { isPostGradRouteEnabled, postGradFlags } from "@/features/postgrad/config";

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

function AppShellLayout({
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}) {
  const postGradEnabled = isPostGradRouteEnabled();

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("mwz:left-sidebar-collapsed") === "true";
  });

  const toggleLeftSidebar = () => {
    const next = !leftSidebarCollapsed;
    setLeftSidebarCollapsed(next);
    try {
      localStorage.setItem("mwz:left-sidebar-collapsed", String(next));
    } catch {}
  };

  const sidebarExpanded = 224;
  const sidebarCollapsed = 64;
  const currentSidebarWidth = leftSidebarCollapsed ? sidebarCollapsed : sidebarExpanded;
  const mainStyle = { "--mwz-left-sidebar-width": `${currentSidebarWidth}px` } as CSSProperties;

  return (
    <div className="mwz-app-shell h-screen overflow-hidden flex flex-col">
      <div className="hidden lg:block">
        <LeftBattleSidebar collapsed={leftSidebarCollapsed} onToggleCollapse={toggleLeftSidebar} />
      </div>

      <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <TopBar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} leftSidebarWidth={currentSidebarWidth} />

      <RankPromotionListener />
      <LiveStreamOverlay />

      <main
        className="flex-1 overflow-auto scroll-pt-2 md:scroll-pt-3 pt-2 md:pt-3 pb-4 md:pb-6 lg:pb-8 lg:pl-[calc(var(--mwz-left-sidebar-width)+0.75rem)]"
        style={mainStyle}
      >
        <Routes>
          <Route path="/" element={<Showcase />} />
          {postGradEnabled && postGradFlags.arena ? <Route path="/arena" element={<Arena />} /> : null}
          {postGradEnabled && postGradFlags.battle ? <Route path="/arena/battles" element={<ArenaBattles />} /> : null}
          {postGradEnabled && postGradFlags.league ? <Route path="/arena/major-war-league" element={<PostGradLeague />} /> : null}
          {postGradEnabled && postGradFlags.league ? <Route path="/arena/leagues" element={<Navigate to="/arena/major-war-league" replace />} /> : null}
          {postGradEnabled && postGradFlags.events ? <Route path="/arena/events" element={<PostGradEvents />} /> : null}
          {postGradEnabled && postGradFlags.warRoom ? <Route path="/war-room" element={<WarRoom />} /> : null}
          {postGradEnabled && postGradFlags.battle ? <Route path="/battle/:id" element={<BattleDetails />} /> : null}
          <Route path="/sponsorships/apply" element={<SponsorshipApplication />} />
          {postGradEnabled && postGradFlags.events ? <Route path="/events" element={<Navigate to="/arena/events" replace />} /> : null}
          {postGradEnabled && postGradFlags.league ? <Route path="/league" element={<League />} /> : null}
          {postGradEnabled && postGradFlags.league ? <Route path="/leagues" element={<Navigate to="/league" replace />} /> : null}
          {postGradEnabled && postGradFlags.tournament ? <Route path="/tournament/:id" element={<TournamentDetails />} /> : null}
          <Route path="/create" element={<Create />} />
          <Route path="/drafts/:draftId/promotion" element={<DraftPromotionSetup />} />
          <Route path="/drafts/:draftId/push-live" element={<PushDraftLive />} />
          <Route path="/prepare/:slug" element={<Prepare />} />
          <Route path="/live" element={<Live />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/command" element={<LegacyCommandCenterRedirect section="overview" />} />
          <Route path="/command/overview" element={<LegacyCommandCenterRedirect section="overview" />} />
          <Route path="/command/recruiter" element={<LegacyCommandCenterRedirect section="recruiter" />} />
          <Route path="/command/squad" element={<LegacyCommandCenterRedirect section="squad" />} />
          <Route path="/command/airdrops" element={<LegacyCommandCenterRedirect section="airdrops" />} />
          <Route path="/command/claims" element={<LegacyCommandCenterRedirect section="claims" />} />
          <Route path="/command/settings" element={<LegacyCommandCenterRedirect section="settings" />} />
          <Route path="/command/followers" element={<LegacyCommandCenterRedirect section="followers" />} />
          <Route path="/command/following" element={<LegacyCommandCenterRedirect section="following" />} />
          <Route path="/command/coins" element={<LegacyCommandCenterRedirect section="coins" />} />
          <Route path="/command/*" element={<LegacyCommandCenterRedirect section="overview" />} />
          <Route path="/profile/:wallet/command" element={<CommandCenterShell><CommandCenterOverview /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/overview" element={<CommandCenterShell><CommandCenterOverview /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/recruiter" element={<CommandCenterShell><CommandCenterRecruiter /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/squad" element={<CommandCenterShell><CommandCenterSquad /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/airdrops" element={<CommandCenterShell><CommandCenterAirdrops /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/claims" element={<CommandCenterShell><CommandCenterClaims /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/settings" element={<CommandCenterShell><CommandCenterSettings /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/followers" element={<CommandCenterShell><CommandCenterSocial mode="followers" /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/following" element={<CommandCenterShell><CommandCenterSocial mode="following" /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/coins" element={<CommandCenterShell><CommandCenterCoins /></CommandCenterShell>} />
          <Route path="/profile/:wallet/command/*" element={<CommandCenterShell><CommandCenterOverview /></CommandCenterShell>} />
          <Route path="/profile/:identifier" element={<ProfilePage />} />
          <Route path="/profile/:wallet/*" element={<ProfileWalletFallbackRedirect />} />
          <Route path="/airdrops" element={<AirdropOverview />} />
          <Route path="/airdrops/winners" element={<AirdropWinners />} />
          <Route path="/recruiter" element={<Recruiter />} />
          <Route path="/recruiter/signup" element={<RecruiterSignup />} />
          <Route path="/recruiters" element={<RecruiterLeaderboard />} />
          <Route path="/recruiters/:code" element={<RecruiterProfile />} />
          <Route path="/recruiter-dashboard" element={<LegacyCommandCenterRedirect section="recruiter" />} />
          <Route path="/squads" element={<SquadLeaderboard />} />
          <Route path="/squad-dashboard" element={<LegacyCommandCenterRedirect section="squad" />} />
          <Route path="/r/:code" element={<RecruiterReferral />} />
          <Route path="/token/:campaignAddress" element={<><TokenDetails /><TokenSocialLinksOverlay /><TokenSafetyRouteOverlay /></>} />
          <Route path="/playbook" element={<Playbook />} />
          <Route path="/docs" element={<Playbook />} />
          <Route path="/status" element={<Status />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </main>
      <ScreenFrame />
    </div>
  );
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
        <SolanaWalletProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            {isLoading && <LoadingScreen onLoadComplete={handleLoadComplete} />}
            {showContent && (
              <BrowserRouter>
                <InternalLinkInterceptor />
                <AppShellLayout mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
              </BrowserRouter>
            )}
          </TooltipProvider>
        </SolanaWalletProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
};

export default App;
