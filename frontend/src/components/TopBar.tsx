/**
 * Top Bar Component
 * Responsive header with search, actions, and ticker feed
 */

import { useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { GlowingButton } from "./ui/glowing-button";
import { SearchBar } from "./ui/search-bar";
import { GlassButton } from "./ui/glass-button";
import { useNavigate } from "react-router-dom";
import { useWallet, WalletType } from "@/hooks/useWallet";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import { useTokenSearch } from "@/hooks/useTokenSearch";
import { ethers } from "ethers";

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

export const TopBar = ({ mobileMenuOpen, setMobileMenuOpen }: TopBarProps) => {
  const navigate = useNavigate();
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [allCampaigns, setAllCampaigns] = useState<CampaignInfo[]>([]);

  const { fetchCampaigns, fetchCampaignMetrics } = useLaunchpad();

  // Ticker feed state (mock OR live depending on your switch inside useLaunchpad)
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

  const openWalletModal = () => {
    // You can decide: allow switching wallet even when connected or not
    setWalletModalOpen(true);
  };

  const handleWalletSelect = async (type: WalletType) => {
    try {
      await wallet.connect(type);
      setWalletModalOpen(false);
    } catch (e) {
      console.error(e);
      // Optional: add toast here if you want feedback
    }
  };

  // Load campaigns for ticker (mock/live handled by your launchpadClient)
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
    const formatPrice = (m: CampaignMetrics | null | undefined) => {
      if (!m) return "Live";
      try {
        // Assumes currentPrice is 18-decimals BNB price in your metrics
        const raw = ethers.formatUnits((m as any).currentPrice ?? 0n, 18);
        const n = Number(raw);
        if (!Number.isFinite(n)) return `Price ${raw} BNB`;

        const pretty =
          n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);

        return `Price ${pretty} BNB`;
      } catch {
        return "Live";
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
          subtitle: formatPrice(metrics),
          hot: sold > 0n,
          route: `/token/${c.campaign.toLowerCase()}`,
        };
      });
  }, [tickerCampaigns, tickerMetricsByCampaign]);

  // Ensure the scrolling band is always long enough, even if we only have a few campaigns.
  const tickerBaseLoop: TickerItem[] = useMemo(() => {
    if (!tickerItems || tickerItems.length === 0) return [];

    const MIN_ITEMS = 18; // tweak if you want more density on desktop
    const target = Math.max(MIN_ITEMS, tickerItems.length);

    const out: TickerItem[] = [];
    while (out.length < target) out.push(...tickerItems);

    return out.slice(0, target);
  }, [tickerItems]);

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-transparent border-b border-border/30">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 lg:pl-72">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        {/* Search */}
        <div className="flex-none w-32 sm:flex-1 sm:max-w-xs md:max-w-md mx-2 md:mx-0">
          <SearchBar
            placeholder="Search tokens..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            results={searchResults}
            loading={searchLoading}
            error={searchError}
            onSelectResult={(r) => {
              setSearchQuery("");
              navigate(`/token/${r.campaignAddress.toLowerCase()}`);
            }}
          />
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Launch token button (unchanged) */}
          <GlowingButton
            glowColor="#ec4899"
            onClick={() => navigate("/create")}
            className="text-xs md:text-sm px-3 md:px-4 py-2"
          >
            <span className="hidden sm:inline">Launch token</span>
            <span className="sm:hidden">Launch</span>
          </GlowingButton>

          {/* Connect wallet button with SAME style, but now opens modal */}
          <div
            className="relative"
            onMouseEnter={() => wallet.isConnected && setDisconnectOpen(true)}
            onMouseLeave={() => setDisconnectOpen(false)}
          >
            <GlowingButton
              glowColor="#a3e635"
              className="text-xs md:text-sm px-3 md:px-4 py-2"
              onClick={() => {
                // Only open modal if NOT connected
                if (!wallet.isConnected) {
                  openWalletModal();
                }
              }}
            >
              <span className="hidden sm:inline">
                {wallet.isConnected ? shortAddress : "Connect wallet"}
              </span>
              <span className="sm:hidden">
                {wallet.isConnected ? "Wallet" : "Connect"}
              </span>
            </GlowingButton>

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
      </div>

      {/* Ticker row (now campaigns; mock/live depends on useLaunchpad switch) */}
      <div className="overflow-hidden py-3 bg-transparent">
        <div className="flex w-max gap-3 animate-[scroll_60s_linear_infinite] hover:[animation-play-state:paused] px-4">
          {tickerLoading && tickerItems.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <GlassButton
                key={`loading-${i}`}
                size="sm"
                contentClassName="flex items-center gap-2 whitespace-nowrap"
                onClick={() => navigate("/create")}
              >
                <div className="w-4 h-4 rounded-full bg-muted" />
                <span className="font-semibold text-xs">Loading campaigns…</span>
              </GlassButton>
            ))
          ) : tickerItems.length === 0 ? (
            <GlassButton
              size="sm"
              contentClassName="flex items-center gap-2 whitespace-nowrap"
              onClick={() => navigate("/create")}
            >
              <div className="w-4 h-4 rounded-full bg-muted" />
              <span className="font-semibold text-xs">No campaigns yet</span>
              <span className="text-xs text-muted-foreground">Launch one</span>
            </GlassButton>
          ) : (
            [...tickerBaseLoop, ...tickerBaseLoop].map((item, i) => (
              <GlassButton
                key={`${item.key}-${i}`}
                size="sm"
                contentClassName="flex items-center gap-2 whitespace-nowrap"
                onClick={() => navigate(item.route)}
              >
                {item.logoURI ? (
                  <img
                    src={item.logoURI}
                    alt={item.symbol}
                    className="w-4 h-4 rounded-full object-cover"
                    onError={(e) => {
                      // fallback to placeholder if image fails
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-muted" />
                )}

                <span className="font-semibold text-xs">{item.symbol}</span>

                <span className={item.hot ? "text-success" : "text-muted-foreground"}>
                  {item.hot ? "🔥" : "•"}
                </span>

                <span className="text-xs text-muted-foreground">{item.subtitle}</span>
              </GlassButton>
            ))
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
