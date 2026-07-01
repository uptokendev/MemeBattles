/**
 * Top Bar Component
 * Responsive header with search and actions
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Bell, Menu, Plus, Search } from "lucide-react";
import { CommandPalette } from "@/components/search/CommandPalette";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SocialTooltip } from "@/components/ui/social-media";
import { socialLinks } from "@/constants/navigation";
import { isPostGradNavEnabled, postGradFlags } from "@/features/postgrad/config";
import { ArenaDesktopNav } from "@/components/postgrad/ArenaDesktopNav";
import { useWallet } from "@/contexts/WalletContext";
import { ConnectWalletModal } from "@/components/wallet/ConnectWalletModal";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import {
  getDraftNotifications,
  markAllDraftNotificationsRead,
  markDraftNotificationRead,
  type DraftNotification,
} from "@/lib/draftPromotion";
import {
  fetchPrepareNotifications,
  markAllPrepareNotificationsRead,
  markPrepareNotificationRead,
} from "@/lib/prepareNotifications";
interface TopBarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  leftSidebarWidth?: number; // from new collapsible left battle sidebar
}

type NavLinkItem = {
  label: string;
  path: string;
  priority: "primary" | "secondary";
};
const brandMark = "/assets/navbar-logo.png";

function isExternalHref(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

function navPathMatches(currentPathname: string, currentSearch: string, target: string): boolean {
  if (isExternalHref(target)) return false;

  try {
    const url = new URL(target, "https://memewarzone.local");
    if (url.pathname !== currentPathname) return false;
    for (const [key, value] of url.searchParams.entries()) {
      if (new URLSearchParams(currentSearch).get(key) !== value) return false;
    }
    return true;
  } catch {
    if (target === "/") return currentPathname === "/";
    return currentPathname.startsWith(target);
  }
}

export const TopBar = ({ mobileMenuOpen, setMobileMenuOpen, leftSidebarWidth = 0 }: TopBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const { solanaAccount, isSolanaConnected, disconnectSolana } = useSolanaWallet();
  const account = isSolanaConnected ? (solanaAccount || wallet.account) : wallet.account;
  const connected = wallet.isConnected || isSolanaConnected;
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [draftNotifications, setDraftNotifications] = useState<DraftNotification[]>([]);
  const [notificationsFromApi, setNotificationsFromApi] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const walletRef = useRef<HTMLButtonElement | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; right: number } | null>(null);
  const topbarStyle = { "--mwz-left-sidebar-width": `${leftSidebarWidth}px` } as CSSProperties;

  useEffect(() => {
    const updateAnchor = () => {
      const anchorEl = notificationOpen ? bellRef.current : disconnectOpen ? walletRef.current : null;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      setPopoverAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    };
    updateAnchor();
    if (!notificationOpen && !disconnectOpen) return;
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [notificationOpen, disconnectOpen]);

  const { price: bnbUsd } = useBnbUsdPrice(true);

  const [allCampaigns, setAllCampaigns] = useState<CampaignInfo[]>([]);

  const { fetchCampaigns } = useLaunchpad();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setNotificationOpen(false);
        setDisconnectOpen(false);
      } else if (e.key === "/" && !meta) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notificationOpen && !disconnectOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-topbar-popover]")) return;
      setNotificationOpen(false);
      setDisconnectOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [notificationOpen, disconnectOpen]);

  const shortAddress = account && account.length > 8 ? `${account.slice(0, 4)}...${account.slice(-4)}` : account;
  const unreadNotifications = draftNotifications.filter((item) => !item.read).length;

  const topbarButtonClass =
    "mwz-button !h-[12px] !min-h-0 !gap-0.5 !px-1.5 sm:!px-2 !py-0 text-[10px] leading-none font-retro";

  const openWalletModal = () => {
    setWalletModalOpen(true);
  };

  const navLinks = useMemo<NavLinkItem[]>(
    () => [
      { label: "Launchpad", path: "/", priority: "primary" },
      ...(postGradFlags.enabled && postGradFlags.warRoom ? [{ label: "Trade War Room", path: "/war-room", priority: "primary" as const }] : []),
      { label: "Profile", path: "/profile?tab=balances", priority: "secondary" },
      { label: "Docs", path: "https://docs.memewar.zone", priority: "secondary" },
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const campaigns = await fetchCampaigns();
        if (!cancelled) {
          setAllCampaigns(campaigns ?? []);
        }
      } catch (err) {
        console.error("[TopBar] Failed to load campaigns", err);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns]);

  const isActive = (path: string) => navPathMatches(location.pathname, location.search, path);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, setMobileMenuOpen]);

  useEffect(() => {
    const onOpenWalletModal = () => setWalletModalOpen(true);
    window.addEventListener("memebattles:openWalletModal", onOpenWalletModal as EventListener);
    return () => window.removeEventListener("memebattles:openWalletModal", onOpenWalletModal as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (!wallet.account) {
        setDraftNotifications([]);
        setNotificationsFromApi(false);
        return;
      }

      try {
        const items = await fetchPrepareNotifications(wallet.account, 20);
        if (cancelled) return;
        setDraftNotifications(items);
        setNotificationsFromApi(true);
      } catch {
        if (cancelled) return;
        setDraftNotifications(getDraftNotifications());
        setNotificationsFromApi(false);
      }
    };

    refresh();
    const onLocalChange = () => refresh();
    window.addEventListener("mwz:notifications-changed", onLocalChange as EventListener);
    const timer = window.setInterval(refresh, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener("mwz:notifications-changed", onLocalChange as EventListener);
      window.clearInterval(timer);
    };
  }, [wallet.account]);

  const openNotificationTarget = async (notification: DraftNotification) => {
    if (wallet.account && notificationsFromApi) {
      await markPrepareNotificationRead(wallet.account, notification.id).catch(() => undefined);
      setDraftNotifications((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    } else {
      markDraftNotificationRead(notification.id);
      setDraftNotifications(getDraftNotifications());
    }
    setNotificationOpen(false);
    navigate(notification.target);
  };

  const markAllRead = async () => {
    if (wallet.account && notificationsFromApi) {
      await markAllPrepareNotificationsRead(wallet.account).catch(() => undefined);
      setDraftNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      return;
    }

    markAllDraftNotificationsRead();
    setDraftNotifications(getDraftNotifications());
  };

  return (
    <div
      className="fixed left-0 right-0 top-0 z-40 bg-transparent transition-[left] lg:left-[var(--mwz-left-sidebar-width)]"
      style={topbarStyle}
    >
      {/* Minimal top action bar - no borders, no menu items, no logo (logo lives in left sidebar) */}
      <div className="mx-2 mt-3 flex min-h-[30px] items-center gap-1.5 px-2 md:mx-3 md:px-3">
        {/* Mobile menu trigger only */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="mwz-button inline-flex h-8 w-8 shrink-0 items-center justify-center p-0 lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="h-4 w-4 shrink-0" />
        </button>

        {/* Small logo only on mobile (desktop logo is in the left sidebar) */}
        <Link to="/" className="mr-1 flex shrink-0 items-center lg:hidden">
          <img
            src={brandMark}
            alt="MemeWarzone"
            className="h-7 w-auto object-contain"
            draggable={false}
          />
        </Link>

        {/* Right cluster: Socials → Search → Create → Bell → Wallet (pushed right) */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Social icons first */}
          <div className="hidden items-center xl:flex">
            <SocialTooltip
              items={socialLinks}
              className="gap-1 [&_a]:!h-5 [&_a]:!w-5 [&_img]:!h-3.5 [&_img]:!w-3.5"
            />
          </div>

          {/* Compact Search (after socials) - height reduced, text larger */}
          <div className="w-[92px] lg:w-[110px] xl:w-28">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open search"
              className="mwz-button search-button group flex h-[10px] w-full items-center justify-center gap-1 px-2 text-[11px] leading-none"
            >
              <Search className="h-2 w-2 shrink-0" />
              <span className="truncate text-[11px] uppercase tracking-[0.12em] text-success/70">Search</span>
            </button>
          </div>

          {/* Orange action buttons - shorter height + pushed down + moved left */}
          <div className="relative -ml-1 flex shrink-0 items-center gap-1 self-end mb-2">
            <Button onClick={() => { setMobileMenuOpen(false); navigate("/create"); }} className={topbarButtonClass}>
              <Plus className="h-2.5 w-2.5 shrink-0" />
              <span className="hidden sm:inline">Create Coin</span>
              <span className="sm:hidden">Create</span>
            </Button>

            {connected && (
              <div className="relative" data-topbar-popover>
                <Button
                  ref={bellRef}
                  type="button"
                  onClick={() => {
                    setDisconnectOpen(false);
                    setNotificationOpen((prev) => !prev);
                  }}
                  className={cn(topbarButtonClass, "relative w-12 justify-center px-1.5")}
                  aria-label="Notifications"
                >
                  <Bell className="h-2.5 w-2.5" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -right-0.5 top-0 grid h-4 min-w-4 place-items-center border border-accent bg-background px-0.5 text-[9px] text-accent">
                      {unreadNotifications}
                    </span>
                  )}
                </Button>

                {notificationOpen && popoverAnchor && createPortal(
                  <div
                    data-topbar-popover
                    className="mwz-panel w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-2"
                    style={{ position: "fixed", top: popoverAnchor.top, right: popoverAnchor.right, zIndex: 80 }}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-2 pb-2">
                      <span className="font-retro text-xs uppercase tracking-[0.16em] text-foreground">Notifications</span>
                      <button type="button" onClick={markAllRead} className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">
                        Mark read
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto py-1">
                      {draftNotifications.slice(0, 5).map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => openNotificationTarget(notification)}
                          className="block w-full border-b border-border/40 px-2 py-3 text-left hover:bg-success/10"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-retro text-xs text-foreground">{notification.title}</span>
                            {!notification.read && <span className="h-2 w-2 shrink-0 bg-accent" />}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.body}</p>
                        </button>
                      ))}
                      {draftNotifications.length === 0 && (
                        <div className="px-2 py-4 text-xs text-muted-foreground">No notifications yet.</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationOpen(false);
                        navigate("/profile?tab=notifications");
                      }}
                      className="mt-1 w-full border border-border/70 px-3 py-2 text-center font-retro text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                    >
                      View all
                    </button>
                  </div>,
                  document.body,
                )}
              </div>
            )}

            <div className="relative" data-topbar-popover>
              <Button
                ref={walletRef}
                className={topbarButtonClass}
                onClick={() => {
                  if (!connected) {
                    openWalletModal();
                    return;
                  }
                  setNotificationOpen(false);
                  setDisconnectOpen((prev) => !prev);
                }}
              >
                <span className="hidden sm:inline">{connected ? shortAddress : "Connect Wallet"}</span>
                <span className="sm:hidden">{connected ? "Wallet" : "Connect"}</span>
              </Button>

              {disconnectOpen && popoverAnchor && createPortal(
                <div
                  data-topbar-popover
                  className="mwz-panel w-56 p-2"
                  style={{ position: "fixed", top: popoverAnchor.top, right: popoverAnchor.right, zIndex: 80 }}
                >
                  <div className="border border-success/15 bg-success/5 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-foreground">
                    {shortAddress}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (isSolanaConnected) {
                          await disconnectSolana();
                        } else {
                          await wallet.disconnect();
                        }
                      } finally {
                        setDisconnectOpen(false);
                      }
                    }}
                    className="mt-2 w-full border border-border/70 px-3 py-2 text-left font-retro text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                  >
                    Disconnect wallet
                  </button>
                </div>,
                document.body,
              )}
            </div>
          </div>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} campaigns={allCampaigns} />
      <ConnectWalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />
    </div>
  );
};