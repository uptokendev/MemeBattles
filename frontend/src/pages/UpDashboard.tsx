/**
 * UP Dashboard Page
 * Displays three categories of campaigns.
 *
 * IMPORTANT:
 * - Uses the same data source as the carousel: useLaunchpad().fetchCampaigns()
 * - In mock mode: returns populated mock campaigns
 * - In live mode: returns on-chain/live campaigns
 */

import { useEffect, useMemo, useState } from "react";
import { Sparkles, TrendingUp, Target, Globe, Users, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignMetrics, CampaignSummary } from "@/lib/launchpadClient";
import type { Token } from "@/types/token";

type Tab = "up" | "higher" | "moon";

const isAddress = (s?: string) => /^0x[a-fA-F0-9]{40}$/.test((s ?? "").trim());

const TokenCard = ({ token, className }: { token: Token; className?: string }) => {
  const navigate = useNavigate();

  return (
    <div
      className={`bg-card/40 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-border hover:border-accent/50 transition-all cursor-pointer ${
        className ?? ""
      }`}
      onClick={() => {
        const addr = (token.campaignAddress ?? "").trim();
        if (!addr || !isAddress(addr)) return;
        navigate(`/token/${addr.toLowerCase()}`);
      }}
    >
      <div className="flex items-start gap-3">
        <img
          src={token.image}
          alt={token.ticker}
          className="w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-border object-cover"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="font-retro text-foreground text-xs md:text-sm truncate">
                {token.ticker}
              </h3>
              <p className="font-retro text-muted-foreground text-xs truncate">
                {token.name}
              </p>
            </div>

            <div className="text-right shrink-0">
              <div className="flex items-center justify-end gap-1 text-xs font-retro text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{token.holders}</span>
              </div>
              <p className="text-xs font-retro text-accent mt-1">
                Vol {token.volume}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {token.hasWebsite && (
                <button
                  className="w-6 h-6 rounded-md border border-border bg-muted flex items-center justify-center hover:border-accent transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Globe className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              {token.hasTwitter && (
                <button
                  className="w-6 h-6 rounded-md border border-border bg-muted flex items-center justify-center hover:border-accent transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg
                    className="h-3 w-3 text-muted-foreground"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-xs font-retro text-accent">MC {token.marketCap}</p>
          </div>

          <p className="text-[10px] font-retro text-muted-foreground mt-2">
            {token.timeAgo}
          </p>
        </div>
      </div>
    </div>
  );
};

const formatTimeAgo = (createdAt?: number): string => {
  if (!createdAt) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - createdAt);
  if (diff < 60) return "now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
};

const toTokenFromSummary = (s: CampaignSummary, fallbackId: number): Token => {
  const c = s.campaign;
  const anyC = c as any;

  const campaignAddress = String(anyC.campaign ?? "").trim();
  const tokenAddress = String(anyC.token ?? "").trim();

  return {
    id: typeof c.id === "number" ? c.id : fallbackId,
    image: c.logoURI || "/placeholder.svg",
    ticker: c.symbol,
    name: c.name,

    // Address-first routing (TokenDetails expects campaign address)
    campaignAddress: isAddress(campaignAddress) ? campaignAddress : undefined,
    tokenAddress: isAddress(tokenAddress) ? tokenAddress : undefined,

    holders: s.stats.holders ?? anyC.holders ?? "—",
    volume: s.stats.volume ?? anyC.volume ?? "—",
    marketCap: s.stats.marketCap ?? anyC.marketCap ?? "—",
    timeAgo: anyC.timeAgo || formatTimeAgo(c.createdAt),
    hasWebsite: Boolean(c.website && c.website.length > 0),
    hasTwitter: Boolean(c.xAccount && c.xAccount.length > 0),
  };
};

const classifyTab = (m: CampaignMetrics | null): Tab => {
  // Live data currently doesn't have market-cap stages in the UI.
  // We classify by bonding progress (sold / graduationTarget) so the
  // page remains fully compatible once mock data is disabled.
  if (!m) return "up";

  try {
    if (m.graduationTarget <= 0n) return "up";
    const bps = (m.sold * 10_000n) / m.graduationTarget; // 0..10000

    if (bps < 3333n) return "up";
    if (bps < 6666n) return "higher";
    return "moon";
  } catch {
    return "up";
  }
};

const isGraduatedFromMetrics = (m: CampaignMetrics | null): boolean => {
  if (!m) return false;

  // Prefer explicit flags when available; otherwise fall back to sold >= target
  // so the UI works across older/newer deployments and in mock mode.
  const hasLaunchFlag = (m as any)?.launched !== undefined || (m as any)?.finalizedAt !== undefined;

  if (hasLaunchFlag) {
    const launched = Boolean((m as any)?.launched);
    const finalizedAt = (m as any)?.finalizedAt;

    try {
      const finalizedAtBig =
        typeof finalizedAt === "bigint"
          ? finalizedAt
          : BigInt(Number(finalizedAt ?? 0));
      return launched || finalizedAtBig > 0n;
    } catch {
      return launched;
    }
  }

  try {
    return m.graduationTarget > 0n && m.sold >= m.graduationTarget;
  } catch {
    return false;
  }
};

const UpDashboard = () => {
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();

  const [activeTab, setActiveTab] = useState<Tab>("up");
  const [loading, setLoading] = useState(true);

  const [upTokens, setUpTokens] = useState<Token[]>([]);
  const [higherTokens, setHigherTokens] = useState<Token[]>([]);
  const [moonTokens, setMoonTokens] = useState<Token[]>([]);
  const [graduatedTokens, setGraduatedTokens] = useState<Token[]>([]);

  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const campaigns = (await fetchCampaigns()) ?? [];
        const results = await Promise.allSettled(
          campaigns.map((c) => fetchCampaignSummary(c))
        );

        if (cancelled) return;

        const nextUp: Token[] = [];
        const nextHigher: Token[] = [];
        const nextMoon: Token[] = [];
        const nextGraduated: Token[] = [];

        campaigns.forEach((c, idx) => {
          const r = results[idx];
          const summary = r.status === "fulfilled" ? r.value : null;
          const token = summary
            ? toTokenFromSummary(summary, idx + 1)
            : {
                id: typeof c.id === "number" ? c.id : idx + 1,
                image: c.logoURI || "/placeholder.svg",
                ticker: c.symbol,
                name: c.name,

                // Address-first routing (TokenDetails expects campaign address)
                campaignAddress: isAddress(String((c as any).campaign ?? ""))
                  ? String((c as any).campaign).trim()
                  : undefined,
                tokenAddress: isAddress(String((c as any).token ?? ""))
                  ? String((c as any).token).trim()
                  : undefined,

                holders: "—",
                volume: "—",
                marketCap: "—",
                timeAgo: (c as any).timeAgo || formatTimeAgo(c.createdAt),
                hasWebsite: Boolean(c.website && c.website.length > 0),
                hasTwitter: Boolean(c.xAccount && c.xAccount.length > 0),
              };

          const metrics = summary?.metrics ?? null;
          if (isGraduatedFromMetrics(metrics)) {
            nextGraduated.push(token);
            return;
          }

          const tab = classifyTab(metrics);

          if (tab === "up") nextUp.push(token);
          else if (tab === "higher") nextHigher.push(token);
          else nextMoon.push(token);
        });

        setUpTokens(nextUp);
        setHigherTokens(nextHigher);
        setMoonTokens(nextMoon);
        setGraduatedTokens(nextGraduated);
      } catch (e) {
        console.error("[UpDashboard] Failed to load campaigns", e);
        if (!cancelled) {
          setUpTokens([]);
          setHigherTokens([]);
          setMoonTokens([]);
          setGraduatedTokens([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns, fetchCampaignSummary]);

  const sections = useMemo(() => {
    return {
      up: {
        icon: Sparkles,
        title: "up?",
        tokens: upTokens,
        subtitle: null as string | null,
      },
      higher: {
        icon: TrendingUp,
        title: "higher",
        tokens: higherTokens,
        subtitle: "Close to bonding",
      },
      moon: {
        icon: Target,
        title: "to the moon",
        tokens: moonTokens,
        subtitle: "Near graduation",
      },
    };
  }, [upTokens, higherTokens, moonTokens]);

  const renderSection = (type: Tab) => {
    const config = sections[type];
    const Icon = config.icon;

    return (
      <div className="bg-card/30 backdrop-blur-md rounded-2xl border border-border flex flex-col overflow-hidden h-full">
        <div className="flex items-center justify-between p-4 md:p-6 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-accent/20 p-2 md:p-3 rounded-xl">
              <Icon className="h-5 w-5 md:h-6 md:w-6 text-accent" />
            </div>
            <h2 className="text-xl md:text-2xl font-retro text-foreground">
              {config.title}
            </h2>
          </div>
          {config.subtitle && (
            <span className="text-xs md:text-sm font-retro text-muted-foreground">
              {config.subtitle}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 md:pb-6 space-y-3 scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
          {loading ? (
            <div className="text-center py-12">
              <p className="font-retro text-muted-foreground text-sm">
                Loading tokens...
              </p>
            </div>
          ) : config.tokens.length > 0 ? (
            config.tokens.map((token) => (
              <TokenCard key={token.id} token={token} />
            ))
          ) : (
            <div className="text-center py-12">
              <p className="font-retro text-muted-foreground text-sm">
                No tokens found
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGraduatedRow = () => {
    // Keep the row visible on all layouts, but only render the container
    // when we have something to show (or we are still loading).
    if (!loading && graduatedTokens.length === 0) return null;

    return (
      <div className="bg-card/30 backdrop-blur-md rounded-2xl border border-border overflow-hidden shrink-0">
        <div className="flex items-center justify-between p-4 md:p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-accent/20 p-2 md:p-3 rounded-xl">
              <Rocket className="h-5 w-5 md:h-6 md:w-6 text-accent" />
            </div>
            <h2 className="text-xl md:text-2xl font-retro text-foreground">graduated</h2>
          </div>
          <span className="text-xs md:text-sm font-retro text-muted-foreground">
            Trading on DEX
          </span>
        </div>

        <div className="px-4 md:px-6 pb-4 md:pb-6 overflow-x-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
          {loading ? (
            <div className="py-6">
              <p className="font-retro text-muted-foreground text-sm">Loading tokens...</p>
            </div>
          ) : (
            <div className="flex gap-3">
              {graduatedTokens.map((token) => (
                <TokenCard key={token.id} token={token} className="min-w-[280px]" />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 pt-28 lg:pt-28 pl-0 lg:pl-72">
      <div className={`h-full ${isMobile ? "pb-20" : ""} p-4 md:p-6 flex flex-col gap-4`}>
        {renderGraduatedRow()}

        <div
          className={`flex-1 ${
            isMobile
              ? "flex"
              : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          } gap-4`}
        >
          {isMobile ? (
            <div className="flex-1">{renderSection(activeTab)}</div>
          ) : (
            <>
              {renderSection("up")}
              {renderSection("higher")}
              <div className="md:col-span-2 lg:col-span-1">
                {renderSection("moon")}
              </div>
            </>
          )}
        </div>
      </div>

      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border p-2 flex justify-around items-center z-50">
          <button
            onClick={() => setActiveTab("up")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
              activeTab === "up"
                ? "bg-accent/20 text-accent"
                : "text-muted-foreground"
            }`}
          >
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-retro">up?</span>
          </button>

          <button
            onClick={() => setActiveTab("higher")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
              activeTab === "higher"
                ? "bg-accent/20 text-accent"
                : "text-muted-foreground"
            }`}
          >
            <TrendingUp className="h-5 w-5" />
            <span className="text-xs font-retro">higher</span>
          </button>

          <button
            onClick={() => setActiveTab("moon")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
              activeTab === "moon"
                ? "bg-accent/20 text-accent"
                : "text-muted-foreground"
            }`}
          >
            <Target className="h-5 w-5" />
            <span className="text-xs font-retro">to the moon</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UpDashboard;
