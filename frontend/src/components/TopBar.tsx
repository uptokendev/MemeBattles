/**
 * Top Bar Component
 * Responsive header with search, actions, and ticker feed
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { SearchBar } from "./ui/search-bar";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWallet, type WalletType } from "@/contexts/WalletContext";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import { useTokenSearch } from "@/hooks/useTokenSearch";
import { ethers } from "ethers";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { toast } from "sonner";

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
  const topbarButtonClass = "border border-accent/35 bg-primary/90 text-foreground hover:border-accent/60 hover:bg-primary font-retro text-xs md:text-sm px-3 md:px-4 py-2 rounded-xl shadow-[0_18px_40px_-28px_rgba(0,0,0,0.95),0_0_0_1px_rgba(240,106,26,0.10)]";

  const openWalletModal = () => {
    // You can decide: allow switching wallet even when connected or not
    setWalletModalOpen(true);
  };

  const navLinks = useMemo(
    () => [
      { label: "Launchpad", path: "/" },
      { label: "Create Coin", path: "/create" },
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
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? "Wallet connection failed");
      toast.error(
        message.includes("No EVM wallet found")
          ? "No injected wallet found. On mobile, open MemeWarzone inside your wallet browser."
          : message
      );
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, setMobileMenuOpen]);

  useEffect(() => {
    const onOpenWalletModal = () => setWalletModalOpen(true);
    window.addEventListener("memebattles:openWalletModal", onOpenWalletModal as EventListener);
    return () => window.removeEventListener("memebattles:openWalletModal", onOpenWalletModal as EventListener);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-transparent">
      <div className="mx-2 md:mx-4 mt-2 flex items-center justify-between rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(23,26,31,0.82),rgba(11,13,16,0.92))] px-4 md:px-6 py-3 shadow-[0_22px_50px_-30px_rgba(0,0,0,0.95),0_0_0_1px_rgba(240,106,26,0.08)] backdrop-blur-xl">
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
            <img src={brandMark} alt="MemeWarzone" className="h-10 w-10" draggable={false} />
            <span className="font-retro text-base">MemeWarzone</span>
          </Link>

          <div className="flex items-center gap-1">
            {navLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "px-3 py-2 rounded-xl text-base font-retro transition-colors border",
                  isActive(item.path)
                    ? "bg-card/80 border-accent/40 text-foreground shadow-[0_0_0_1px_rgba(240,106,26,0.12),0_14px_30px_-22px_rgba(240,106,26,0.35)]"
                    : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="min-w-0 flex-none w-28 sm:flex-1 sm:max-w-xs md:max-w-md mx-1.5 md:mx-0 lg:mx-6">
          <SearchBar
            placeholder="Search campaigns..."
            value={searchQuery}
            onValueChange={(q) => {
              setSearchQuery(q);
              // Also broadcast to the Home grid as an optional "filter-in-place" search.
              // Pages that don't care can ignore this event.
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
       <div className="relative flex items-center gap-2">
        {/* Right side actions */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Primary CTA */}
          <Button onClick={() => { setMobileMenuOpen(false); navigate("/create"); }} className={topbarButtonClass}>
            <span className="hidden sm:inline">Create Coin</span>
            <span className="sm:hidden">Create</span>
          </Button>

          {/* Connect wallet button with SAME style, but now opens modal */}
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
              <span className="hidden sm:inline">
                {wallet.isConnected ? shortAddress : "Connect wallet"}
              </span>
              <span className="sm:hidden">
                {wallet.isConnected ? "Wallet" : "Connect"}
              </span>
            </Button>

            {wallet.isConnected && disconnectOpen && (
              <div className="absolute right-0 mt-1 w-40 rounded-xl border border-border/70 bg-card/95 backdrop-blur-xl shadow-[0_18px_40px_-28px_rgba(0,0,0,0.95)] z-50 overflow-hidden">
                <button
                  className="w-full text-left text-xs px-3 py-2 hover:bg-muted"
                  onClick={() => {
                    setDisconnectOpen(false);
                    openWalletModal();
                  }}
                >
                  Change wallet
                </button>
                <button
                  className="w-full text-left text-xs px-3 py-2 hover:bg-muted"
                  onClick={async () => {
                    await wallet.disconnect();
                    setDisconnectOpen(false);
                  }}
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Wallet selection modal */}
      {walletModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[linear-gradient(180deg,rgba(23,26,31,0.94),rgba(11,13,16,0.98))] border border-border/80 rounded-3xl shadow-[0_28px_80px_-36px_rgba(0,0,0,0.98),0_0_0_1px_rgba(240,106,26,0.10)] w-[90%] max-w-sm p-4 md:p-6 space-y-4 backdrop-blur-xl">
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
                className="w-full flex items-center justify-between px-3 py-2 rounded-2xl border border-border/70 bg-card/85 hover:border-accent/35 hover:bg-card transition-colors text-left"
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
                className="w-full flex items-center justify-between px-3 py-2 rounded-2xl border border-border/70 bg-card/85 hover:border-accent/35 hover:bg-card transition-colors text-left"
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
                className="w-full flex items-center justify-between px-3 py-2 rounded-2xl border border-border/70 bg-card/85 hover:border-accent/35 hover:bg-card transition-colors text-left"
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
        </div>,
        document.body
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
