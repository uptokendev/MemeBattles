/**
 * Top Bar Component
 * Responsive header with search and actions
 */

import { useEffect, useMemo, useState } from "react";
import { Menu, Shield, Swords } from "lucide-react";
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

  const topbarButtonClass =
    "h-10 rounded-xl border border-[#7a531d] bg-[linear-gradient(180deg,rgba(255,201,92,0.98)_0%,rgba(255,148,28,0.94)_42%,rgba(145,74,8,0.98)_100%)] text-black font-retro text-xs md:text-sm px-3 md:px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-1px_0_rgba(0,0,0,0.28),0_12px_30px_rgba(0,0,0,0.28)] hover:brightness-110";
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
    <div className="fixed top-0 left-0 right-0 z-40 px-2 md:px-4 pt-2">
      <div className="relative mx-auto overflow-hidden rounded-[1.55rem] border border-white/10 bg-[linear-gradient(180deg,rgba(57,61,69,0.97),rgba(17,19,23,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.42),0_22px_46px_rgba(0,0,0,0.34)] backdrop-blur-md">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(0,0,0,0.16)),radial-gradient(circle_at_16%_20%,rgba(255,150,40,0.12),transparent_18%),radial-gradient(circle_at_84%_20%,rgba(255,110,0,0.10),transparent_18%),linear-gradient(135deg,transparent_0%,transparent_46%,rgba(255,255,255,0.05)_47%,transparent_48%,transparent)] bg-[length:auto,auto,auto,36px_36px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,transparent,#f8cf45_16%,#ff9726_52%,#ff5a0d_84%,transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,170,60,0.35),transparent)]" />

        <div className="flex items-center justify-between gap-3 px-3 md:px-5 py-3">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(60,65,74,0.96),rgba(18,20,24,0.98))] text-foreground transition-all hover:border-amber-400/30"
          aria-label="Toggle menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-4 flex-1">
          <Link
            to="/"
            className="relative mr-1 inline-flex items-center gap-3 overflow-hidden rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(69,74,82,0.96),rgba(19,21,25,0.99))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.40),0_12px_28px_rgba(0,0,0,0.24)]"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,200,90,0.45),transparent)]" />
            <img src={brandMark} alt="MemeBattles" className="h-10 w-10 rounded-xl object-cover" draggable={false} />
            <span className="font-retro text-sm tracking-wide text-stone-100">MemeBattles</span>
           </Link>

          <div className="relative flex items-center gap-2 rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(44,48,55,0.95),rgba(14,16,20,0.99))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(0,0,0,0.40)]">
            <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(135deg,transparent_0%,transparent_48%,rgba(255,255,255,0.06)_49%,transparent_50%)] [background-size:28px_28px]" />
             {navLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative px-4 py-2 rounded-xl text-sm font-retro tracking-wide transition-all border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                  isActive(item.path)
                    ? "border-amber-400/35 bg-[linear-gradient(180deg,rgba(255,191,74,0.96),rgba(166,86,12,0.98))] text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_18px_rgba(0,0,0,0.22)]"
                    : "border-white/5 bg-[linear-gradient(180deg,rgba(58,62,70,0.78),rgba(20,22,26,0.92))] text-stone-300 hover:border-amber-400/25 hover:text-white"
                 )}
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)]" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-none w-32 sm:flex-1 sm:max-w-xs md:max-w-md mx-2 md:mx-0 lg:mx-6 overflow-hidden rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(36,39,45,0.96),rgba(13,15,18,0.99))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(0,0,0,0.44)]">
          <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(135deg,transparent_0%,transparent_48%,rgba(255,255,255,0.06)_49%,transparent_50%)] [background-size:24px_24px]" />
           <SearchBar
            placeholder="Search campaigns..."
            value={searchQuery}
            onValueChange={(q) => {
              setSearchQuery(q);
              // Also broadcast to the Home grid as an optional "filter-in-place" search.
              // Pages that don't care can ignore this event.
              try {
                window.dispatchEvent(new CustomEvent("MemeBattles:homeSearch", { detail: String(q ?? "") }));
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
          <div className="flex items-center gap-2 md:gap-3">
           {/* Primary CTA */}
          <Button onClick={() => navigate("/create")} className={topbarButtonClass}>
            <Swords className="mr-1.5 hidden sm:block h-4 w-4" />
            <span className="hidden sm:inline">Create Coin</span>
            <span className="sm:hidden">Create</span>
          </Button>

          <div
            className="relative"
            onMouseEnter={() => wallet.isConnected && setDisconnectOpen(true)}
            onMouseLeave={() => setDisconnectOpen(false)}
          >
            <Button className={topbarButtonClass} onClick={() => { if (!wallet.isConnected) { openWalletModal(); } }}>
              <Shield className="mr-1.5 hidden sm:block h-4 w-4" />
              <span className="hidden sm:inline">
                {wallet.isConnected ? shortAddress : "Connect wallet"}
              </span>
              <span className="sm:hidden">
                {wallet.isConnected ? "Wallet" : "Connect"}
              </span>
            </Button>

            {wallet.isConnected && disconnectOpen && (
              <div className="absolute right-0 mt-2 w-36 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(46,49,57,0.98),rgba(16,18,22,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_30px_rgba(0,0,0,0.30)] z-50">
                 <button
                  className="w-full text-left text-xs px-3 py-2.5 rounded-xl text-stone-200 hover:bg-white/[0.05]"
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
        </div>
      </div>
      </div>

      {/* Wallet selection modal */}
      {walletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[90%] max-w-sm rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(50,54,61,0.98),rgba(16,18,22,0.99))] p-4 md:p-6 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.40),0_20px_44px_rgba(0,0,0,0.36)]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm md:text-base font-retro tracking-wide text-stone-100">Connect a wallet</h2>
              <button
                onClick={() => setWalletModalOpen(false)}
                className="text-xs text-stone-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-stone-400 mb-2">
              Select a BSC-compatible EVM wallet. You can switch between testnet and
              mainnet from your wallet settings.
            </p>

            <div className="space-y-2">
              {/* MetaMask / Rabby / browser wallet */}
              <button
                onClick={() => handleWalletSelect("metamask")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(63,68,76,0.92),rgba(20,22,26,0.98))] hover:border-amber-400/25 transition-all text-left"
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
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(63,68,76,0.92),rgba(20,22,26,0.98))] hover:border-amber-400/25 transition-all text-left"
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
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(63,68,76,0.92),rgba(20,22,26,0.98))] hover:border-amber-400/25 transition-all text-left"
              >
                <div>
                  <p className="text-xs md:text-sm font-medium">Other EVM wallet</p>
                  <p className="text-[11px] text-muted-foreground">
                    Any injected BSC-compatible wallet
                  </p>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-stone-400 mt-2">
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
