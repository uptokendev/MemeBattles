/**
 * Top Bar Component
 * Responsive header with search, actions, and ticker feed
 */

import { useEffect, useMemo, useState } from "react";
import { Bell, Menu } from "lucide-react";
import { SearchBar } from "./ui/search-bar";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { ConnectWalletModal } from "@/components/wallet/ConnectWalletModal";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import { useTokenSearch } from "@/hooks/useTokenSearch";
import { ethers } from "ethers";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import {
  getDraftNotifications,
  markAllDraftNotificationsRead,
  markDraftNotificationRead,
  type DraftNotification,
} from "@/lib/draftPromotion";
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

const brandMark = "/assets/ticker.png";

function navPathMatches(currentPathname: string, currentSearch: string, target: string): boolean {
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
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [draftNotifications, setDraftNotifications] = useState<DraftNotification[]>([]);

  const { price: bnbUsd } = useBnbUsdPrice(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [allCampaigns, setAllCampaigns] = useState<CampaignInfo[]>([]);

  const { fetchCampaigns, fetchCampaignMetrics } = useLaunchpad();

  const [tickerCampaigns, setTickerCampaigns] = useState<CampaignInfo[]>([]);
  const [tickerMetricsByCampaign, setTickerMetricsByCampaign] = useState<Record<string, CampaignMetrics | null>>({});
  const [tickerLoading, setTickerLoading] = useState(true);

  const { results: searchResults, loading: searchLoading, error: searchError } = useTokenSearch(searchQuery, allCampaigns, {
    limit: 10,
    debounceMs: 250,
  });

  const shortAddress = wallet.account && wallet.account.length > 8 ? `${wallet.account.slice(0, 4)}...${wallet.account.slice(-4)}` : wallet.account;
  const unreadNotifications = draftNotifications.filter((item) => !item.read).length;

  const topbarButtonClass = "mwz-button h-10 px-3 md:px-5 text-xs md:text-sm font-retro";

  const openWalletModal = () => {
    setWalletModalOpen(true);
  };

  const navLinks = useMemo(
    () => [
      { label: "Launchpad", path: "/" },
      { label: "Create Coin", path: "/create" },
      { label: "Battle Leagues", path: "/battle-leagues" },
      { label: "Profile", path: "/profile?tab=balances" },
      { label: "Docs", path: "/docs" },
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setTickerLoading(true);
        const campaigns = await fetchCampaigns();
        const all = campaigns ?? [];
        const top = all.slice(0, 12);

        if (cancelled) return;
        setAllCampaigns(all);
        setTickerCampaigns(top);

        const results = await Promise.allSettled(top.map((c) => fetchCampaignMetrics(c.campaign)));

        if (cancelled) return;

        const next: Record<string, CampaignMetrics | null> = {};
        top.forEach((c, idx) => {
          const r = results[idx];
          next[c.campaign.toLowerCase()] = r.status === "fulfilled" ? r.value : null;
        });

        setTickerMetricsByCampaign(next);
      } catch (err) {
        console.error("[TopBar ticker] Failed to load campaigns", err);
        if (!cancelled) {
          setTickerCampaigns([]);
          setTickerMetricsByCampaign({});
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
    const onOpenWalletModal = () => setWalletModalOpen(true);
    window.addEventListener("memebattles:openWalletModal", onOpenWalletModal as EventListener);
    return () => window.removeEventListener("memebattles:openWalletModal", onOpenWalletModal as EventListener);
  }, []);

  useEffect(() => {
    const refresh = () => setDraftNotifications(getDraftNotifications());
    refresh();
    window.addEventListener("mwz:notifications-changed", refresh as EventListener);
    return () => window.removeEventListener("mwz:notifications-changed", refresh as EventListener);
  }, []);

  const openNotificationTarget = (notification: DraftNotification) => {
    markDraftNotificationRead(notification.id);
    setDraftNotifications(getDraftNotifications());
    setNotificationOpen(false);
    navigate(notification.target);
  };

  const markAllRead = () => {
    markAllDraftNotificationsRead();
    setDraftNotifications(getDraftNotifications());
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-transparent">
      <div className="mwz-hud-frame mx-2 md:mx-3 mt-2 flex items-center gap-2 px-3 md:px-5 py-2.5 min-h-[66px]">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden mwz-button p-2" aria-label="Toggle menu">
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden lg:flex items-center gap-5 flex-1 min-w-0">
          <Link to="/" className="flex items-center gap-2 mr-2 shrink-0">
            <img src={brandMark} alt="MemeWarzone" className="h-10 w-10 object-contain drop-shadow-[0_0_14px_rgba(57,255,79,0.32)]" draggable={false} />
            <span className="mwz-section-title text-base">MemeWarzone</span>
          </Link>

          <div className="flex items-center gap-1 min-w-0">
            {navLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn("mwz-nav-link px-3 py-2 text-sm font-retro whitespace-nowrap", isActive(item.path) && "mwz-nav-link-active")}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 lg:flex-none lg:w-[340px] xl:w-[420px] mx-1 lg:mx-4">
          <SearchBar
            placeholder="Search campaigns..."
            value={searchQuery}
            onValueChange={(q) => {
              setSearchQuery(q);
              try {
                window.dispatchEvent(new CustomEvent("memebattles:homeSearch", { detail: String(q ?? "") }));
              } catch {
                // ignore
              }
            }}
            results={searchResults}
            loading={searchLoading}
            error={searchError}
            onSelectResult={(r) => {
              setSearchQuery("");
              navigate(`/token/${r.campaignAddress.toLowerCase()}`);
            }}
          />
        </div>

        <div className="relative flex items-center gap-2 shrink-0">
          <Button onClick={() => { setMobileMenuOpen(false); navigate("/create"); }} className={topbarButtonClass}>
            <span className="hidden sm:inline">Create Coin</span>
            <span className="sm:hidden">Create</span>
          </Button>

          {wallet.isConnected && (
            <div className="relative">
              <Button
                type="button"
                onClick={() => {
                  setDisconnectOpen(false);
                  setNotificationOpen((prev) => !prev);
                }}
                className={cn(topbarButtonClass, "relative px-3")}
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center border border-accent bg-background px-1 text-[10px] text-accent">
                    {unreadNotifications}
                  </span>
                )}
              </Button>

              {notificationOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] mwz-panel z-50 overflow-hidden p-2">
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
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <Button
              className={topbarButtonClass}
              onClick={() => {
                if (!wallet.isConnected) {
                  openWalletModal();
                  return;
                }
                setDisconnectOpen((prev) => !prev);
              }}
            >
              <span className="hidden sm:inline">{wallet.isConnected ? shortAddress : "Connect Wallet"}</span>
              <span className="sm:hidden">{wallet.isConnected ? "Wallet" : "Connect"}</span>
            </Button>

            {wallet.isConnected && disconnectOpen && (
              <div className="absolute right-0 mt-2 w-44 mwz-panel z-50 overflow-hidden p-1">
                <button className="w-full text-left text-xs px-3 py-2 hover:bg-success/10" onClick={() => { setDisconnectOpen(false); openWalletModal(); }}>
                  Change wallet
                </button>
                <button className="w-full text-left text-xs px-3 py-2 hover:bg-success/10" onClick={async () => { await wallet.disconnect(); setDisconnectOpen(false); }}>
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="hidden xl:flex mx-4 mt-3 h-5 overflow-hidden text-[10px] uppercase tracking-[0.18em] mwz-muted">
        <div className="flex animate-[scroll_45s_linear_infinite] whitespace-nowrap gap-8 pr-8">
          {(tickerLoading || tickerBaseLoop.length === 0 ? [{ key: "loading", symbol: "MWZ", subtitle: "COMMAND FEED ONLINE", hot: true, route: "/" }] : tickerBaseLoop).concat(tickerBaseLoop).map((item, idx) => (
            <button key={`${item.key}-${idx}`} type="button" onClick={() => navigate(item.route)} className="inline-flex items-center gap-2 hover:text-[var(--mwz-orange)]">
              <span className={item.hot ? "mwz-orange" : ""}>▰</span>
              <span>${item.symbol}</span>
              <span>{item.subtitle}</span>
            </button>
          ))}
        </div>
      </div>

      <ConnectWalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};
