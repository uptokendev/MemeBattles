/**
 * Top Bar Component
 * Responsive header with search, actions, and ticker feed
 */

import { useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { SearchBar } from "./ui/search-bar";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWallet, WalletType } from "@/hooks/useWallet";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import { useTokenSearch } from "@/hooks/useTokenSearch";
import { ethers } from "ethers";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { LeagueOverlayCard } from "@/components/home/LeagueOverlayCard";

interface TopBarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

type TickerItem = {
  key: string; // campaign address (or unique)
  symbol: string;
  logoURI?: string;
  subtitle: string; // e.g. "Price 0.0123 BNB" or "Live"
  hot: boolean;
  route: string; // where to navigate on click
};

// Public brand asset (no bundler import required)
const brandMark = "/assets/ticker.png";

export const TopBar = ({ mobileMenuOpen, setMobileMenuOpen }: TopBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const { price: bnbUsd } = useBnbUsdPrice(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [allCampaigns, setAllCampaigns] = useState<CampaignInfo[]>([]);

  const { fetchCampaigns, fetchCampaignMetrics } = useLaunchpad();

  // Ticker feed state
  const [tickerCampaigns, setTickerCampaigns] = useState<CampaignInfo[]>([]);
  const [tickerMetricsByCampaign, setTickerMetricsByCampaign] = useState<
    Record<string, CampaignMetrics | null>
  >({});
  const [tickerLoading, setTickerLoading] = useState(true);

  const { results: searchResults, loading: searchLoading, error: searchError } = useTokenSearch(
    searchQuery,
    allCampaigns,
    { limit: 10, debounceMs: 250 }
  );

  const shortAddress =
    wallet.account && wallet.account.length > 8
      ? `${wallet.account.slice(0, 4)}...${wallet.account.slice(-4)}`
      : wallet.account;

  // Match the primary button styling used across the app
  const topbarButtonClass = "bg-accent hover:bg-accent/90 text-accent-foreground font-retro text-xs md:text-sm px-3 md:px-4 py-2 rounded-xl shadow-lg";

  const openWalletModal = () => {
    // You can decide: allow switching wallet even when connected or not
    setWalletModalOpen(true);
  };

  const navLinks = useMemo(
    () => [
      { label: "Launchpad", path: "/" },
      { label: "Create Coin", path: "/create" },
      { label: "Battle Dashboard", path: "/battle-dashboard" },
      { label: "Battle Leagues", path: "/battle-leagues" },
      { label: "Profile", path: "/profile" },
      { label: "Docs", path: "/docs" },
    ],
    []
  );

  const handleWalletSelect = async (type: WalletType) => {
    try {
      await wallet.connect(type);
      setWalletModalOpen(false);
    } catch (e) {
      console.error(e);
      // Optional: add toast here if you want feedback
    }
  };

  // Load campaigns for ticker (handled by your launchpadClient)
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

        // Best-effort metrics per campaign (don’t block UI if some fail)
        const results = await Promise.allSettled(
          top.map((c) => fetchCampaignMetrics(c.campaign))
        );

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

  // Build ticker items from campaigns + metrics
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
        // Match the bonding-curve chart semantics: circulating = net sold tokens.
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

  // Ensure the scrolling band is always long enough, even if we only have a few campaigns.
  const tickerBaseLoop: TickerItem[] = useMemo(() => {
    if (!tickerItems || tickerItems.length === 0) return [];

    const MIN_ITEMS = 18; // tweak if you want more density on desktop
    const target = Math.max(MIN_ITEMS, tickerItems.length);

    const out: TickerItem[] = [];
    while (out.length < target) out.push(...tickerItems);

    return out.slice(0, target);
  }, [tickerItems]);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-transparent">
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-4 flex-1">
          <Link to="/" className="flex items-center gap-2 mr-2">
            <img src={brandMark} alt="MemeBattles" className="h-7 w-7" draggable={false} />
            <span className="font-retro text-sm">MemeBattles</span>
          </Link>

          <div className="flex items-center gap-1">
            {navLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "px-3 py-2 rounded-xl text-xs font-retro transition-colors border",
                  isActive(item.path)
                    ? "bg-card/60 border-amber-400/40 text-amber-200"
                    : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-card/30"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="flex-none w-32 sm:flex-1 sm:max-w-xs md:max-w-md mx-2 md:mx-0 lg:mx-6">
          <SearchBar
            placeholder="Search campaigns..."
            value={searchQuery}
            onValueChange={(q) => {
              setSearchQuery(q);
              // Also broadcast to the Home grid as an optional "filter-in-place" search.
              // Pages that don't care can ignore this event.
              try {
                window.dispatchEvent(new CustomEvent("upmeme:homeSearch", { detail: String(q ?? "") }));
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
       <div className="relative flex items-center gap-2">
        {/* Right side actions */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Primary CTA */}
          <Button onClick={() => navigate("/create")} className={topbarButtonClass}>
            <span className="hidden sm:inline">Create Coin</span>
            <span className="sm:hidden">Create</span>
          </Button>

          {/* Connect wallet button with SAME style, but now opens modal */}
          <div
            className="relative"
            onMouseEnter={() => wallet.isConnected && setDisconnectOpen(true)}
            onMouseLeave={() => setDisconnectOpen(false)}
          >
            <Button className={topbarButtonClass} onClick={() => { if (!wallet.isConnected) { openWalletModal(); } }}>
              <span className="hidden sm:inline">
                {wallet.isConnected ? shortAddress : "Connect wallet"}
              </span>
              <span className="sm:hidden">
                {wallet.isConnected ? "Wallet" : "Connect"}
              </span>
            </Button>

            {/* Disconnect dropdown */}
            {wallet.isConnected && disconnectOpen && (
              <div className="absolute right-0 mt-1 w-32 rounded-md border border-border bg-background shadow-lg z-50">
                <button
                  className="w-full text-left text-xs px-3 py-2 hover:bg-muted"
                  onClick={() => {
                    wallet.disconnect();
                    setDisconnectOpen(false);
                  }}
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
         {/* League overlay: always under the buttons */}
         {location.pathname === "/" && (
  <div className="absolute right-6 top-full mt-2 z-20 pointer-events-none">
    <LeagueOverlayCard className="pointer-events-auto" />
  </div>
  )}
        </div>
      </div>

      {/* Wallet selection modal */}
      {walletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl shadow-xl w-[90%] max-w-sm p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm md:text-base font-retro">Connect a wallet</h2>
              <button
                onClick={() => setWalletModalOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-2">
              Select a BSC-compatible EVM wallet. You can switch between testnet and
              mainnet from your wallet settings.
            </p>

            <div className="space-y-2">
              {/* MetaMask / Rabby / browser wallet */}
              <button
                onClick={() => handleWalletSelect("metamask")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">MetaMask</p>
                  <p className="text-[11px] text-muted-foreground">
                    Browser wallet (Rabby etc.) on BSC
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>EVM</span>
                </div>
              </button>

              {/* Binance Wallet */}
              <button
                onClick={() => handleWalletSelect("binance")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Binance Wallet</p>
                  <p className="text-[11px] text-muted-foreground">
                    Official Binance extension for BSC
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>BSC</span>
                </div>
              </button>

              {/* Generic injected fallback */}
              <button
                onClick={() => handleWalletSelect("injected")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Other EVM wallet</p>
                  <p className="text-[11px] text-muted-foreground">
                    Any injected BSC-compatible wallet
                  </p>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground mt-2">
              Make sure your selected wallet is configured for Binance Smart Chain
              (BSC mainnet or testnet, depending on your setup).
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};