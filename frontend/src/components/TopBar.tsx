/**
 * Top Bar Component
 * Responsive header with search and actions
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Menu, Search } from "lucide-react";
import { CommandPalette } from "@/components/search/CommandPalette";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SocialTooltip } from "@/components/ui/social-media";
import { socialLinks } from "@/constants/navigation";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { isSupportedChainId, getChainLabel } from "@/lib/chainConfig";
import { normalizeRouteWallet } from "@/lib/address";
import { ConnectWalletModal } from "@/components/wallet/ConnectWalletModal";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import { ethers } from "ethers";
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
}

type TickerItem = {
  key: string;
  symbol: string;
  logoURI?: string;
  subtitle: string;
  hot: boolean;
  route: string;
};
type NavLinkItem = {
  label: string;
  path: string;
  priority: "primary" | "secondary";
};
const brandMark = "/assets/navbar-logo.png";

const ENABLE_TOPBAR_ONCHAIN_METRICS = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_ENABLE_TOPBAR_ONCHAIN_METRICS || "").trim().toLowerCase(),
);

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

export const TopBar = ({ mobileMenuOpen, setMobileMenuOpen }: TopBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const { solanaAccount, isSolanaConnected, disconnectSolana } = useSolanaWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletModalFilter, setWalletModalFilter] = useState<'evm' | 'solana' | null>(null);
  const [walletConnectCommandSection, setWalletConnectCommandSection] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [draftNotifications, setDraftNotifications] = useState<DraftNotification[]>([]);
  const [notificationsFromApi, setNotificationsFromApi] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const walletRef = useRef<HTMLButtonElement | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; right: number } | null>(null);

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

  const { fetchCampaigns, fetchCampaignMetrics } = useLaunchpad();

  const [tickerCampaigns, setTickerCampaigns] = useState<CampaignInfo[]>([]);
  const [tickerMetricsByCampaign, setTickerMetricsByCampaign] = useState<Record<string, CampaignMetrics | null>>({});
  const [tickerLoading, setTickerLoading] = useState(true);
  const tickerInitialLoadedRef = useRef(false);

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

  // Prefer Solana address if Solana connected (Phantom), else EVM.
  const activeAddress = isSolanaConnected ? solanaAccount : wallet.account;
  const shortAddress = activeAddress && activeAddress.length > 8 ? `${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}` : activeAddress;

  // Frontend-wide supported chain status (used for badges + to open correct filtered modal).
  const rawChainForTopbar = isSolanaConnected ? 101 : wallet.chainId;
  const isOnSupportedChain = !activeAddress || isSupportedChainId(rawChainForTopbar);
  const chainPillLabel = isSolanaConnected ? "SOL" : (wallet.chainId ? getChainLabel(wallet.chainId)?.split(" ")[0] || "EVM" : "");
  const unreadNotifications = draftNotifications.filter((item) => !item.read).length;

  const topbarButtonClass =
  "mwz-button !h-7 !min-h-0 !px-2 md:!px-3 !py-0 text-[10px] md:text-[11px] leading-none font-retro";

  const openWalletModal = (filter?: 'evm' | 'solana') => {
    if (filter) setWalletModalFilter(filter);
    setWalletModalOpen(true);
  };

const navLinks = useMemo<NavLinkItem[]>(
  () => [
    { label: "Launchpad", path: "/", priority: "primary" },
    { label: "Profile", path: "/profile?tab=balances", priority: "primary" },
    { label: "Docs", path: "https://docs.memewar.zone", priority: "primary" },
  ],
  []
);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (!tickerInitialLoadedRef.current) setTickerLoading(true);
        const campaigns = await fetchCampaigns();
        const all = campaigns ?? [];
        const top = all.slice(0, 12);

        if (cancelled) return;
        setAllCampaigns(all);
        setTickerCampaigns(top);

if (!ENABLE_TOPBAR_ONCHAIN_METRICS) {
  setTickerMetricsByCampaign({});
  tickerInitialLoadedRef.current = true;
  return;
}

const results = await Promise.allSettled(top.map((c) => fetchCampaignMetrics(c.campaign)));

if (cancelled) return;

const next: Record<string, CampaignMetrics | null> = {};
top.forEach((c, idx) => {
  const r = results[idx];
  next[c.campaign.toLowerCase()] = r.status === "fulfilled" ? r.value : null;
});

setTickerMetricsByCampaign(next);
tickerInitialLoadedRef.current = true;
      } catch (err) {
        console.error("[TopBar ticker] Failed to load campaigns", err);
        if (!cancelled) {
          if (!tickerInitialLoadedRef.current) {
            setTickerCampaigns([]);
            setTickerMetricsByCampaign({});
          }
        }
      } finally {
        if (!cancelled) setTickerLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns, fetchCampaignMetrics]);

  const tickerItems: TickerItem[] = useMemo(() => {
    const formatCompactUsd = (n: number) => {
      if (!Number.isFinite(n)) return "—";
      const abs = Math.abs(n);
      const sign = n < 0 ? "-" : "";
      const v = Math.abs(n);
      if (abs >= 1_000_000_000) return `${sign}$${(v / 1_000_000_000).toFixed(2)}B`;
      if (abs >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
      if (abs >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}K`;
      return `${sign}$${v.toFixed(2)}`;
    };

    const formatCompactBnb = (bnb: number) => {
      if (!Number.isFinite(bnb)) return "—";
      const abs = Math.abs(bnb);
      const pretty = abs >= 1 ? bnb.toFixed(2) : abs >= 0.01 ? bnb.toFixed(4) : abs >= 0.0001 ? bnb.toFixed(6) : bnb.toFixed(8);
      return `${pretty} BNB`;
    };

    const formatMarketCap = (m: CampaignMetrics | null | undefined) => {
      if (!m) return "MC —";
      try {
        const circulating: bigint = (m as any).sold ?? 0n;
        const priceWeiPerToken: bigint = (m as any).currentPrice ?? 0n;
        if (circulating <= 0n || priceWeiPerToken <= 0n) return "MC —";

        const mcWei = (priceWeiPerToken * circulating) / 10n ** 18n;
        const mcBnb = Number(ethers.formatEther(mcWei));
        if (!Number.isFinite(mcBnb) || mcBnb <= 0) return "MC —";

        if (Number.isFinite(bnbUsd ?? NaN) && (bnbUsd ?? 0) > 0) {
          const mcUsd = mcBnb * (bnbUsd as number);
          return `MC ${formatCompactUsd(mcUsd)}`;
        }

        return `MC ${formatCompactBnb(mcBnb)}`;
      } catch {
        return "MC —";
      }
    };

    return (tickerCampaigns ?? [])
      .filter((c) => c && typeof c.symbol === "string" && c.symbol.length > 0)
      .map((c) => {
        const metrics = tickerMetricsByCampaign[c.campaign.toLowerCase()] ?? null;
        const sold = (() => {
          try {
            const v = (metrics as any)?.sold;
            if (typeof v === "bigint") return v;
            if (typeof v === "number") return BigInt(v);
            if (typeof v === "string") return BigInt(v);
            return 0n;
          } catch {
            return 0n;
          }
        })();

        return {
          key: c.campaign,
          symbol: c.symbol,
          logoURI: (c as any).logoURI,
          subtitle: formatMarketCap(metrics),
          hot: sold > 0n,
          route: `/token/${c.campaign.toLowerCase()}`,
        };
      });
  }, [tickerCampaigns, tickerMetricsByCampaign, bnbUsd]);

  const tickerBaseLoop: TickerItem[] = useMemo(() => {
    if (!tickerItems || tickerItems.length === 0) return [];
    const MIN_ITEMS = 18;
    const target = Math.max(MIN_ITEMS, tickerItems.length);
    const out: TickerItem[] = [];
    while (out.length < target) out.push(...tickerItems);
    return out.slice(0, target);
  }, [tickerItems]);

  const isActive = (path: string) => navPathMatches(location.pathname, location.search, path);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, setMobileMenuOpen]);

  useEffect(() => {
    const onOpenWalletModal = (e: CustomEvent<{ only?: 'evm' | 'solana'; commandSection?: string }>) => {
      if (e?.detail?.only) setWalletModalFilter(e.detail.only);
      setWalletConnectCommandSection(e?.detail?.commandSection || null);
      setWalletModalOpen(true);
    };
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
    <div className="fixed top-0 left-0 right-0 z-40 bg-transparent">
      <div className="mwz-hud-frame mx-2 md:mx-3 mt-2 flex items-center gap-1.5 px-2.5 md:px-4 !py-1 !min-h-[30px]">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden mwz-button h-8 w-8 p-0" aria-label="Toggle menu">
  <Menu className="h-4 w-4" />
</button>

        <Link to="/" className="mwz-brand-link hidden md:flex items-center mr-2 shrink-0">
          {/* navbar-logo is a wide strip (~5.5:1) that already contains the
              MemeWarzone wordmark, so fix the height and let the width scale. */}
          <img
            src={brandMark}
            alt="MemeWarzone"
            className="h-7 w-auto object-contain drop-shadow-[0_0_14px_rgba(57,255,79,0.32)] lg:h-9 2xl:h-10"
            draggable={false}
          />
        </Link>

        <div className="hidden lg:flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          {navLinks.map((item) => {
            const external = isExternalHref(item.path);
            const className = cn(
              "mwz-nav-link px-2 md:px-3 !py-1 text-[11px] leading-none whitespace-nowrap 2xl:text-xs",
              item.priority === "secondary" && "hidden 2xl:inline-flex",
              !external && isActive(item.path) && "mwz-nav-link-active",
            );

            return external ? (
              <a
                key={item.path}
                href={item.path}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {item.label}
              </a>
            ) : (
              <Link key={item.path} to={item.path} className={className}>
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden lg:flex items-center shrink-0">
          <SocialTooltip
            items={socialLinks}
            className="gap-1.5 [&_a]:!h-8 [&_a]:!w-8 [&_img]:!h-4 [&_img]:!w-4"
          />
        </div>

        <div className="min-w-0 flex-1 lg:flex-none lg:shrink-0 mx-1 lg:mx-2 xl:mx-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open search"
            className="mwz-button group flex h-7 w-full items-center justify-center gap-1.5 px-2 md:w-[145px] lg:w-[105px] 2xl:w-[120px]"
          >
            <Search className="h-3 w-3 shrink-0" />
            <span className="truncate text-[10px] uppercase tracking-[0.12em] text-success/70 leading-none">
              Search
            </span>
          </button>
        </div>

        <div className="relative flex items-center gap-2 shrink-0">
          <Button onClick={() => { setMobileMenuOpen(false); navigate("/create"); }} className={topbarButtonClass}>
            <span className="hidden sm:inline">Create Coin</span>
            <span className="sm:hidden">Create</span>
          </Button>

          {wallet.isConnected && (
            <div className="relative" data-topbar-popover>
              <Button
                ref={bellRef}
                type="button"
                onClick={() => {
                  setDisconnectOpen(false);
                  setNotificationOpen((prev) => !prev);
                }}
                className={cn(topbarButtonClass, "relative px-2.5 md:px-3")}
                aria-label="Notifications"
              >
                <Bell className="h-3.5 w-3.5" />
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center border border-accent bg-background px-1 text-[9px] text-accent">
                    {unreadNotifications}
                  </span>
                )}
              </Button>

              {notificationOpen && popoverAnchor && createPortal(
                <div
                  data-topbar-popover
                  className="w-80 max-w-[calc(100vw-2rem)] mwz-panel overflow-hidden p-2"
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
            {/* Frontend-wide chain status indicator. Red "WRONG NET" when connected on unsupported chain (e.g. Trust on Ethereum). */}
            {(wallet.isConnected || isSolanaConnected) && (
              <button
                type="button"
                onClick={() => openWalletModal(isSolanaConnected ? "solana" : "evm")}
                className={`mr-1 hidden md:inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-retro tracking-[0.16em] transition ${
                  isOnSupportedChain
                    ? "border-border/50 bg-card/30 text-muted-foreground hover:border-accent/40"
                    : "border-destructive/70 bg-destructive/10 text-destructive hover:bg-destructive/20"
                }`}
                title={isOnSupportedChain ? `Connected on supported chain` : "Unsupported chain — click to switch or reconnect"}
              >
                {isOnSupportedChain ? (isSolanaConnected ? "SOL" : "BNB") : "BAD NET"}
              </button>
            )}

            <Button
              ref={walletRef}
              className={topbarButtonClass}
              onClick={() => {
                const isAnyConnected = wallet.isConnected || isSolanaConnected;
                if (!isAnyConnected) {
                  openWalletModal();
                  return;
                }
                setNotificationOpen(false);
                setDisconnectOpen((prev) => !prev);
              }}
            >
              <span className="hidden sm:inline">{(wallet.isConnected || isSolanaConnected) ? shortAddress : "Connect Wallet"}</span>
              <span className="sm:hidden">{(wallet.isConnected || isSolanaConnected) ? "Wallet" : "Connect"}</span>
            </Button>

            {(wallet.isConnected || isSolanaConnected) && disconnectOpen && popoverAnchor && createPortal(
              <div
                data-topbar-popover
                className="w-44 mwz-panel overflow-hidden p-1"
                style={{ position: "fixed", top: popoverAnchor.top, right: popoverAnchor.right, zIndex: 80 }}
              >
                <button className="w-full text-left text-xs px-3 py-2 hover:bg-success/10" onClick={() => { setDisconnectOpen(false); openWalletModal(); }}>
                  Change wallet
                </button>
                <button className="w-full text-left text-xs px-3 py-2 hover:bg-success/10" onClick={async () => {
                  try {
                    await Promise.allSettled([
                      isSolanaConnected ? disconnectSolana() : Promise.resolve(),
                      wallet.isConnected ? wallet.disconnect() : Promise.resolve(),
                    ]);
                  } finally {
                    setDisconnectOpen(false);
                  }
                }}>
                  Disconnect
                </button>
              </div>,
              document.body,
            )}
          </div>
        </div>
      </div>

      <ConnectWalletModal
        open={walletModalOpen}
        onConnected={(address) => {
          if (!walletConnectCommandSection) return;
          const routeWallet = normalizeRouteWallet(address);
          if (!routeWallet) return;
          navigate(`/profile/${routeWallet}/command/${walletConnectCommandSection}`);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setWalletModalFilter(null);
            setWalletConnectCommandSection(null);
          }
          setWalletModalOpen(open);
        }}
        filter={walletModalFilter}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} allCampaigns={allCampaigns} />

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};
