/**
 * Token Details Page
 * Displays comprehensive information about a specific token including
 * chart, trading interface, transactions, and holder distribution
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Copy, ExternalLink, Globe, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import twitterIcon from "@/assets/social/twitter.png";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics, CampaignSummary, CampaignActivity } from "@/lib/launchpadClient";
import { useDexScreenerChart } from "@/hooks/useDexScreenerChart";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useTokenStatsRealtime } from "@/hooks/useTokenStatsRealtime";
import { CurvePriceChart } from "@/components/token/CurvePriceChart";
import { TokenComments } from "@/components/token/TokenComments";
import { AthBar } from "@/components/token/AthBar";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { USE_MOCK_DATA } from "@/config/mockConfig";
import { getMockCurveEventsForSymbol } from "@/constants/mockCurveTrades";
import { getMockDexTradesForSymbol } from "@/constants/mockDexTrades";
import { getMockDexLiquidityBnbForSymbol } from "@/constants/mockDexTrades";
import { useWallet } from "@/hooks/useWallet";
import { useCurveTrades, type CurveTradePoint } from "@/hooks/useCurveTrades";
import { Contract, ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { fetchUserProfile, type UserProfile } from "@/lib/profileApi";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;
const TOKEN_DECIMALS = 18;
const SLIPPAGE_PCT = 5;
const MAX_UINT256 = (1n << 256n) - 1n;

// This is the UI table row shape (NOT the on-chain CurveTrade shape)
type TxRow = {
  id: string;
  time: string;
  type: "buy" | "sell";
  amount: string;
  bnb: string;
  price: string;
  mcap: string;
  maker: string;
  makerAddress: string;
  txHash: string;
};

function getExplorerBase(chainId?: number): string {
  const id = Number(chainId ?? 0);
  if (id === 56) return "https://bscscan.com";
  if (id === 97) return "https://testnet.bscscan.com";
  // Sensible default
  return "https://bscscan.com";
}

function shortenAddress(addr?: string | null): string {
  const a = String(addr ?? "").trim();
  if (!a) return "";
  if (a.length <= 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatTimeAgo(ts?: number | null): string {
  if (ts == null) return "—";
  const raw = Number(ts);
  if (!Number.isFinite(raw) || raw <= 0) return "—";

  // tolerate ms timestamps
  const seconds = raw > 1e11 ? Math.floor(raw / 1000) : Math.floor(raw);
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, nowSec - seconds);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

const TokenDetails = () => {
  // URL param: /token/:campaignAddress  (address-based)
  const { campaignAddress } = useParams<{ campaignAddress: string }>();

  const { toast } = useToast();
  const [tradeAmount, setTradeAmount] = useState("0");

  const [tradeInputDenom, setTradeInputDenom] = useState<"TOKEN" | "BNB">("TOKEN");
  const toggleTradeInputDenom = () => {
    setTradeAmount("0");
    setQuoteWei(null);
    setQuoteError(null);
    setTradeInputDenom((d) => (d === "TOKEN" ? "BNB" : "TOKEN"));
  };
  const [effectiveTokenWei, setEffectiveTokenWei] = useState<bigint>(0n);
  const [effectiveBnbWei, setEffectiveBnbWei] = useState<bigint>(0n);
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const handleTradeTabChange = (value: string) => {
    setTradeTab(value as "buy" | "sell");
  };
  const [selectedTimeframe, setSelectedTimeframe] = useState<
    "5m" | "1h" | "4h" | "24h"
  >("24h");

  const [displayDenom, setDisplayDenom] = useState<"USD" | "BNB">(() => {
    try {
      const saved = localStorage.getItem("launchit:displayDenom");
      if (saved === "USD" || saved === "BNB") return saved;

      // Backward-compat: older builds stored this under a market-cap specific key.
      const legacy = localStorage.getItem("launchit:mcDenom");
      if (legacy === "USD" || legacy === "BNB") return legacy;

      return "USD";
    } catch {
      return "USD";
    }
  });
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    try {
      localStorage.setItem("launchit:displayDenom", displayDenom);
    } catch {
      // ignore
    }
  }, [displayDenom]);

  // Launchpad hooks + state for the on-chain data
  const { fetchCampaigns, fetchCampaignSummary, fetchCampaignMetrics, fetchCampaignActivity, buyTokens, sellTokens } = useLaunchpad();
  const wallet = useWallet();
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [activity, setActivity] = useState<CampaignActivity | null>(null);
  const [activityTab, setActivityTab] = useState<"comments" | "trades">("comments");
  const [curveReserveWei, setCurveReserveWei] = useState<bigint | null>(null);

  // UI rows for the transactions table
  const [txs, setTxs] = useState<TxRow[]>([]);

  // Maker profiles for the Trades tab (best-effort; cached per address)
  const [makerProfiles, setMakerProfiles] = useState<Record<string, UserProfile | null>>({});

  // Creator profile (best-effort; used in the header)
  const [creatorProfile, setCreatorProfile] = useState<UserProfile | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trading (quote + balances)
  const [quoteWei, setQuoteWei] = useState<bigint | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [tradePending, setTradePending] = useState(false);
  const [approvePending, setApprovePending] = useState(false);
  const [bnbBalanceWei, setBnbBalanceWei] = useState<bigint | null>(null);
  const [tokenBalanceWei, setTokenBalanceWei] = useState<bigint | null>(null);

  // Fetch maker profiles for displayed trades (best-effort; do not block UI)
  useEffect(() => {
    const chainIdNum = Number(wallet.chainId ?? 97);
    if (!txs.length) return;

    const uniq = Array.from(
      new Set(
        txs
          .map((t) => (t.makerAddress ? String(t.makerAddress).toLowerCase() : ""))
          .filter(Boolean)
      )
    );

    const missing = uniq.filter((a) => makerProfiles[a] === undefined).slice(0, 30);
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      for (const addr of missing) {
        try {
          const p = await fetchUserProfile(chainIdNum, addr);
          if (cancelled) return;
          setMakerProfiles((prev) => ({ ...prev, [addr]: p }));
        } catch {
          if (cancelled) return;
          setMakerProfiles((prev) => ({ ...prev, [addr]: null }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [txs, wallet.chainId, makerProfiles]);

  // Fetch creator profile (best-effort; do not block UI)
  useEffect(() => {
    const creator = String(campaign?.creator ?? "").trim();
    if (!creator) {
      setCreatorProfile(null);
      return;
    }

    const chainIdNum = Number(wallet.chainId ?? 97);
    let cancelled = false;

    (async () => {
      try {
        const p = await fetchUserProfile(chainIdNum, creator);
        if (cancelled) return;
        setCreatorProfile(p);
      } catch {
        if (cancelled) return;
        setCreatorProfile(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [campaign?.creator, wallet.chainId]);

  // Load campaign + metrics based on :campaignAddress (preferred).
  // Backward-compatible fallback: if param is not a 0x address, treat it as symbol.
  useEffect(() => {
    const load = async () => {
      if (!campaignAddress) return;

      try {
        setLoading(true);
        setError(null);

        const campaigns = await fetchCampaigns();

        if (!campaigns || campaigns.length === 0) {
          setError("No token data");
          setCampaign(null);
          setMetrics(null);
          setSummary(null);
          return;
        }

        const param = campaignAddress.trim();
        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(param);

        const match = isAddress
          ? campaigns.find((c) => (c.campaign ?? "").toLowerCase() === param.toLowerCase())
          : campaigns.find((c) => (c.symbol ?? "").toLowerCase() === param.toLowerCase());

        if (!match) {
          setError("Token not found");
          setCampaign(null);
          setMetrics(null);
          setSummary(null);
          return;
        }

        setCampaign(match);

        // Unified token stats + metrics (same source as carousel / UP Dashboard)
        const s = await fetchCampaignSummary(match);
        setSummary(s);
        setMetrics(s.metrics ?? null);
      } catch (err) {
        console.error(err);
        setError("Failed to load token data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [campaignAddress, fetchCampaigns, fetchCampaignSummary]);

  const formatPriceFromWei = (wei?: bigint | null): string => {
    if (wei == null) return "—";
    try {
      const raw = ethers.formatUnits(wei, 18);
      const n = Number(raw);
      if (!Number.isFinite(n)) return `${raw} BNB`;
      const pretty = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);
      return `${pretty} BNB`;
    } catch {
      return "—";
    }
  };

  const formatBnbFromWei = (wei?: bigint | null): string => {
    if (wei == null) return "—";
    try {
      const raw = ethers.formatEther(wei);
      const n = Number(raw);
      if (!Number.isFinite(n)) return `${raw} BNB`;
      const pretty = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);
      return `${pretty} BNB`;
    } catch {
      return "—";
    }
  };

  const formatTokenFromWei = (wei?: bigint | null): string => {
    if (wei == null) return "—";
    try {
      const raw = ethers.formatUnits(wei, TOKEN_DECIMALS);
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      const pretty = n >= 1 ? n.toFixed(4) : n >= 0.01 ? n.toFixed(6) : n.toFixed(8);
      return pretty;
    } catch {
      return "—";
    }
  };
  const parseBnbLabel = (input?: string | null): number | null => {
    if (!input) return null;
    const s = String(input).trim();
    if (!s || s === "—") return null;

    // Accept forms like:
    //  - "0.1234 BNB"
    //  - "1.23k BNB"
    //  - "1.23k"
    //  - "0.000123"
    
    // IMPORTANT: avoid treating the leading "B" in "BNB" as a suffix.

    const token = s.split(/\s+/)[0] ?? "";

    const m = token.match(/^(-?\d+(?:\.\d+)?)([kKmMbBtT])?$/);
    if (!m) return null;
    const num = Number(m[1]);
    if (!Number.isFinite(num)) return null;

    const suf = (m[2] ?? "").toLowerCase();
    const mult = suf === "k" ? 1e3 : suf === "m" ? 1e6 : suf === "b" ? 1e9 : suf === "t" ? 1e12 : 1;
    return num * mult;
  };

  const formatCompactUsd = (usd: number): string => {
    if (!Number.isFinite(usd)) return "—";
    const abs = Math.abs(usd);

    const fmt = (v: number, suffix: string) => {
      const decimals = v >= 100 ? 0 : v >= 10 ? 1 : 2;
      return `$${v.toFixed(decimals)}${suffix}`;
    };

    if (abs >= 1e12) return fmt(usd / 1e12, "T");
    if (abs >= 1e9) return fmt(usd / 1e9, "B");
    if (abs >= 1e6) return fmt(usd / 1e6, "M");
    if (abs >= 1e3) return fmt(usd / 1e3, "K");

    // Small values: show up to 2 decimals
    const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
    return `$${usd.toFixed(decimals)}`;
  };



  const parseTokenAmountWei = (value: string): bigint => {
    const v = (value ?? "").trim();
    if (!v || v === "." || v === "-") return 0n;
    // Only allow digits + a single decimal separator
    const cleaned = v.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const normalized = parts.length <= 2 ? cleaned : parts[0] + "." + parts.slice(1).join("");
    try {
      return ethers.parseUnits(normalized || "0", TOKEN_DECIMALS);
    } catch {
      return 0n;
    }
  };


  const parseBnbAmountWei = (value: string): bigint => {
    const v = (value ?? "").trim();
    if (!v || v === "." || v === "-") return 0n;
    const cleaned = v.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const normalized = parts.length <= 2 ? cleaned : parts[0] + "." + parts.slice(1).join("");
    try {
      return ethers.parseEther(normalized || "0");
    } catch {
      return 0n;
    }
  };

  const formatPriceBnb = (p?: number | null): string => {
    if (p == null || !Number.isFinite(p)) return "—";
    const pretty =
      p >= 1 ? p.toFixed(2) : p >= 0.01 ? p.toFixed(6) : p.toFixed(8);
    return `${pretty} BNB`;
  };

  // Format a BNB amount (number) consistently across the UI.
  const formatBnb = (n?: number | null): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    const pretty = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);
    return `${pretty} BNB`;
  };

  const shorten = (addr?: string): string => {
    if (!addr) return "—";
    return addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;
  };

  const formatCompact = (n: number): string => {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}t`;
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}m`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}k`;
    if (abs >= 1) return n.toFixed(2);
    if (abs >= 0.01) return n.toFixed(4);
    if (abs >= 0.0001) return n.toFixed(6);
    return n.toFixed(8);
  };

  const formatAgo = (timestampSecs?: number): string => {
    if (!timestampSecs) return "";
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - timestampSecs);
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

  // Read curve trades for transactions + analytics (live mode)
  // Hook returns CurveTrade[] (your "@/types/token" Transaction type)
  const { points: liveCurvePoints, loading: liveCurveLoading, error: liveCurveError } = useCurveTrades(campaign?.campaign);
const liveCurvePointsSafe: CurveTradePoint[] = Array.isArray(liveCurvePoints) ? liveCurvePoints : [];

  // Realtime stats from Railway (price/marketcap/24h vol), patched via Ably.
  const { stats: rtStats } = useTokenStatsRealtime(
    campaign?.campaign ?? campaignAddress,
    wallet.chainId,
    !USE_MOCK_DATA
  );
const toSeconds = (ts: number): number => {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  // If it looks like milliseconds, convert to seconds.
  return ts > 1e11 ? Math.floor(ts / 1000) : Math.floor(ts);
};
  type TimeframeKey = "5m" | "1h" | "4h" | "24h";
  const timeframeTiles = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const windows: Record<TimeframeKey, number> = {
      "5m": 5 * 60,
      "1h": 60 * 60,
      "4h": 4 * 60 * 60,
      "24h": 24 * 60 * 60,
    };

    // End price: prefer realtime last trade price, else on-chain price, else latest trade price
    const endPrice =
      (rtStats?.lastPriceBnb != null ? Number(rtStats.lastPriceBnb) : undefined) ??
      (metrics?.currentPrice ? Number(ethers.formatUnits(metrics.currentPrice, 18)) : undefined);

    // Normalize mock timestamps so they sit “around now” for realistic windows.
    const mockCurve = getMockCurveEventsForSymbol(campaign?.symbol);
    const mockCurvePoints = (() => {
      if (!mockCurve.length) return [] as Array<{ timestamp: number; pricePerToken: number; nativeWei?: bigint }>;
      const lastTs = mockCurve[mockCurve.length - 1].timestamp;
      const shift = now - lastTs;
      const perTrade = 50_000_000_000_000_000n; // 0.05 BNB per point (demo)
      return mockCurve.map((e) => ({
        timestamp: toSeconds(e.timestamp + shift),
        pricePerToken: e.pricePerToken,
        nativeWei: perTrade,
      }));
    })();

    // Mock DEX trades for tokens that are already graduated
    const mockDex = getMockDexTradesForSymbol(campaign?.symbol);
    const mockDexPoints = (() => {
      if (!mockDex.length) return [] as Array<{ timestamp: number; pricePerToken: number; nativeWei?: bigint }>;
      const lastTs = mockDex[mockDex.length - 1].timestamp;
      const shift = now - lastTs;
      return mockDex.map((t) => ({
        timestamp: t.timestamp + shift,
        pricePerToken: t.pricePerToken,
        nativeWei: t.nativeWei,
      }));
    })();

    const isCurveTest = (campaign?.symbol ?? "").toUpperCase() === "MOCK2";
    const mockGraduated =
      !isCurveTest &&
      Boolean(metrics && metrics.graduationTarget > 0n && metrics.sold >= metrics.graduationTarget);

    // IMPORTANT:
    // - In live mode, useCurveTrades already provides pricePerToken as a NUMBER (BNB per token)
    // - Do NOT ethers.formatEther(pricePerToken) here.
    const points: Array<{ timestamp: number; pricePerToken: number; nativeWei?: bigint }> =
      USE_MOCK_DATA
        ? (mockGraduated ? mockDexPoints : mockCurvePoints)
        : liveCurvePointsSafe.map((p: any) => ({
            timestamp: Number(p.timestamp ?? 0),
            pricePerToken: typeof p.pricePerToken === "number" ? p.pricePerToken : Number(p.pricePerToken ?? 0),
            nativeWei: p.nativeWei,
          }));

    if (!points.length && endPrice == null) {
      return {
        "5m": { change: null as number | null, volume: "—" },
        "1h": { change: null as number | null, volume: "—" },
        "4h": { change: null as number | null, volume: "—" },
        "24h": { change: null as number | null, volume: "—" },
      };
    }

    const tsOf = (t: number) => (t > 1e11 ? Math.floor(t / 1000) : t); // tolerate ms timestamps
    const sorted = [...points].sort((a, b) => tsOf(a.timestamp) - tsOf(b.timestamp));
    const latestTradePrice = sorted[sorted.length - 1]?.pricePerToken;
    const end = endPrice ?? latestTradePrice ?? 0;

    const out: Record<TimeframeKey, { change: number | null; volume: string }> = {
      "5m": { change: null, volume: "—" },
      "1h": { change: null, volume: "—" },
      "4h": { change: null, volume: "—" },
      "24h": { change: null, volume: "—" },
    };

    for (const k of Object.keys(windows) as TimeframeKey[]) {
      const startTs = now - windows[k];

      // Start price: last trade at/before the window start, else first trade in the window.
      const before = [...sorted].reverse().find((p) => tsOf(p.timestamp) <= startTs);
      const within = sorted.find((p) => tsOf(p.timestamp) >= startTs);
      const startPrice = (before ?? within)?.pricePerToken;

      const volumeWei = sorted
        .filter((p) => tsOf(p.timestamp) >= startTs)
        .reduce((acc, p) => acc + (p.nativeWei ?? 0n), 0n);

      const start = startPrice ?? end;
      if (start > 0 && end > 0) {
        const pct = ((end - start) / start) * 100;
        out[k].change = Number.isFinite(pct) ? Number(pct.toFixed(2)) : null;
      } else {
        out[k].change = null;
      }

      out[k].volume = points.length ? formatBnbFromWei(volumeWei) : "—";
    }

    return out;
  }, [USE_MOCK_DATA, campaign?.symbol, liveCurvePointsSafe, metrics]);

  // Token view-model used throughout the page (mock + live)
  const tokenData = useMemo(() => {
    const ticker = campaign?.symbol ?? "";
    const name = campaign?.name ?? "Token";
    const stats = summary?.stats;

    const rtMarketCap = rtStats?.marketcapBnb;
    const rtPrice = rtStats?.lastPriceBnb;

    return {
      image: campaign?.logoURI || "/placeholder.svg",
      ticker,
      name,
      hasWebsite: Boolean(campaign?.website && campaign.website.length > 0),
      hasTwitter: Boolean(campaign?.xAccount && campaign.xAccount.length > 0),

      // Unified headline stats
      marketCap:
        rtMarketCap != null && Number.isFinite(rtMarketCap)
          ? `${formatCompact(rtMarketCap)} BNB`
          : stats?.marketCap ?? "—",
      volume: stats?.volume ?? "—",
      holders: stats?.holders ?? "—",
      price:
        rtPrice != null && Number.isFinite(rtPrice)
          ? formatPriceBnb(rtPrice)
          : formatPriceFromWei(metrics?.currentPrice ?? null),
      liquidity: formatBnbFromWei(curveReserveWei),

      // Timeframe analytics (BNB volume + price change)
      metrics: timeframeTiles,
    };
  }, [campaign, curveReserveWei, metrics, summary, timeframeTiles, rtStats]);
  // Keep USD reference price available for UI conversions and ATH tracking.
  // (Cached + throttled inside the hook.)
  const { price: bnbUsdPrice, loading: bnbUsdLoading } = useBnbUsdPrice(true);

// Normalize in case the hook returns a scaled value (e.g., 1e18-based).
const bnbUsd = useMemo(() => {
  if (bnbUsdPrice == null) return null;
  const n = Number(bnbUsdPrice);
  if (!Number.isFinite(n) || n <= 0) return null;

  // BNB price in USD should never be anywhere near 100k+. If it is, it's almost certainly scaled.
  if (n > 100_000) return n / 1e18;

  return n;
}, [bnbUsdPrice]);

  const marketCapDisplay = useMemo(() => {
    const bnbLabel = tokenData.marketCap;

    if (displayDenom === "BNB") return bnbLabel;

    const mcBnb = parseBnbLabel(bnbLabel);
    if (mcBnb == null) return "—";

    if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";

    return formatCompactUsd(mcBnb * bnbUsdPrice);
  }, [displayDenom, tokenData.marketCap, bnbUsdPrice, bnbUsdLoading]);

  // Always-USD market cap label for ATH tracking (independent of the denomination toggle).
  const marketCapUsdLabel = useMemo(() => {
    const mcBnb = parseBnbLabel(tokenData.marketCap);
    if (mcBnb == null) return null;
    if (!bnbUsdPrice) return null;
    const usd = mcBnb * bnbUsdPrice;
    return Number.isFinite(usd) && usd > 0 ? formatCompactUsd(usd) : null;
  }, [tokenData.marketCap, bnbUsdPrice]);

  const priceDisplay = useMemo(() => {
    const bnbLabel = tokenData.price;

    if (displayDenom === "BNB") return bnbLabel;

    const priceBnb = parseBnbLabel(bnbLabel);
    if (priceBnb == null) return "—";

    if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";

    return formatCompactUsd(priceBnb * bnbUsdPrice);
  }, [displayDenom, tokenData.price, bnbUsdPrice, bnbUsdLoading]);

  const volumeDisplay = useMemo(() => {
    const bnbLabel = tokenData.metrics[selectedTimeframe]?.volume ?? "—";

    if (displayDenom === "BNB") return bnbLabel;

    const volBnb = parseBnbLabel(bnbLabel);
    if (volBnb == null) return "—";

    if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";

    return formatCompactUsd(volBnb * bnbUsdPrice);
  }, [displayDenom, tokenData.metrics, selectedTimeframe, bnbUsdPrice, bnbUsdLoading]);

  const formatBnbOrUsd = useMemo(() => {
    return (bnb: number | null | undefined): string => {
      if (bnb == null || !Number.isFinite(bnb)) return "—";
      if (displayDenom === "BNB") return `${formatCompact(bnb)} BNB`;
      if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";
      return formatCompactUsd(bnb * bnbUsdPrice);
    };
  }, [displayDenom, bnbUsdPrice, bnbUsdLoading]);

  const flywheel = useMemo(() => {
    const buyVolBnb = activity ? Number(ethers.formatEther(activity.buyVolumeWei)) : null;
    const sellVolBnb = activity ? Number(ethers.formatEther(activity.sellVolumeWei)) : null;
    const netFlowBnb = buyVolBnb != null && sellVolBnb != null ? buyVolBnb - sellVolBnb : null;

    const feeBps = metrics ? Number(metrics.protocolFeeBps) : 0;
    const feesBnb = buyVolBnb != null && sellVolBnb != null ? (buyVolBnb + sellVolBnb) * (feeBps / 10000) : null;

    return {
      buyVolume: formatBnbOrUsd(buyVolBnb),
      sellVolume: formatBnbOrUsd(sellVolBnb),
      netFlow: formatBnbOrUsd(netFlowBnb),
      feesEstimated: formatBnbOrUsd(feesBnb),
      buyers: activity ? String(activity.buyers) : "—",
      feeRate: metrics ? `${(Number(metrics.protocolFeeBps) / 100).toFixed(2)}%` : "—",
      lpRate: metrics ? `${(Number(metrics.liquidityBps) / 100).toFixed(2)}%` : "—",
    };
  }, [activity, metrics, formatBnbOrUsd]);

  const holderDistribution = useMemo(() => {
    const shortAddr = (a: string) =>
      a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

    // Estimated balances derived from bonding curve trades only (no transfers).
    // NOTE: This is a best-effort view and does not include transfers.
    const balances = new Map<string, bigint>();

    for (const p of liveCurvePointsSafe) {
      const addr = (p.from || "").toLowerCase();
      if (!addr) continue;

      const prev = balances.get(addr) ?? 0n;
      const delta = p.tokensWei ?? 0n; // tokensWei
      const isBuy = (p.type ?? "buy") === "buy"; // type
      balances.set(addr, isBuy ? prev + delta : prev - delta);
    }

    const holders = [...balances.entries()]
      .filter(([, bal]) => bal > 0n)
      .map(([address, bal]) => ({ address, bal }))
      .sort((a, b) => (a.bal === b.bal ? 0 : a.bal > b.bal ? -1 : 1));

    const holdersBal = holders.reduce((acc, x) => acc + x.bal, 0n);

    // Liquidity pool allocation (token wei) from on-chain metrics (if present).
    // This is the amount intended for the LP at graduation.
    const lpBal = metrics?.liquiditySupply ?? 0n;

    const totalBal = holdersBal + lpBal;

    const pct = (bal: bigint) => (totalBal > 0n ? Number((bal * 10000n) / totalBal) / 100 : 0);

    const topUsers = holders.slice(0, 6).map((h) => ({
      address: h.address,
      label: shortAddr(h.address),
      pct: pct(h.bal),
      isLp: false as const,
    }));

    const othersBal = holders.slice(6).reduce((acc, x) => acc + x.bal, 0n);

    const top = [
      ...(lpBal > 0n
        ? [
            {
              address: "liquidity-pool",
              label: "Liquidity pool",
              pct: pct(lpBal),
              isLp: true as const,
            },
          ]
        : []),
      ...topUsers,
    ];

    return {
      top,
      othersPct: pct(othersBal),
      totalHolders: holders.length,
      hasLp: lpBal > 0n,
    };
  }, [liveCurvePointsSafe, metrics?.liquiditySupply]);


  // Reserve / "liquidity" shown on the page: BNB held by the campaign contract (pre-graduation)
  useEffect(() => {
    let cancelled = false;

    const loadReserve = async () => {
      try {
        if (USE_MOCK_DATA) {
          setCurveReserveWei(null);
          return;
        }
        if (!wallet.provider || !campaign?.campaign) {
          setCurveReserveWei(null);
          return;
        }
        const bal = await wallet.provider.getBalance(campaign.campaign);
        if (!cancelled) setCurveReserveWei(bal);
      } catch (e) {
        console.warn("[TokenDetails] Failed to load campaign reserve", e);
        if (!cancelled) setCurveReserveWei(null);
      }
    };

    loadReserve();
    return () => {
      cancelled = true;
    };
  }, [wallet.provider, campaign?.campaign]);

  // Campaign activity counters (buy/sell volume, buyers). Used for Flywheel and related panels.
  useEffect(() => {
    let cancelled = false;

    const loadActivity = async () => {
      try {
        if (USE_MOCK_DATA) {
          setActivity(null);
          return;
        }
        if (!campaign?.campaign) {
          setActivity(null);
          return;
        }
        const a = await fetchCampaignActivity(campaign.campaign);
        if (!cancelled) setActivity(a);
      } catch (e) {
        console.warn("[TokenDetails] Failed to load campaign activity", e);
        if (!cancelled) setActivity(null);
      }
    };

    loadActivity();
    const t = setInterval(loadActivity, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [campaign?.campaign, fetchCampaignActivity]);

  // Wallet balances (for the trading panel)
  useEffect(() => {
    let cancelled = false;

    const loadBalances = async () => {
      try {
        if (!wallet.provider || !wallet.account) {
          setBnbBalanceWei(null);
          setTokenBalanceWei(null);
          return;
        }

        const [bnbBal, tokenBal] = await Promise.all([
          wallet.provider.getBalance(wallet.account),
          (async () => {
            try {
              if (!campaign?.token) return 0n;
              const t = new Contract(campaign.token, TOKEN_ABI, wallet.provider) as any;
              return (await t.balanceOf(wallet.account)) as bigint;
            } catch {
              return 0n;
            }
          })(),
        ]);

        if (!cancelled) {
          setBnbBalanceWei(bnbBal);
          setTokenBalanceWei(tokenBal);
        }
      } catch (e) {
        console.warn("[TokenDetails] Failed to load balances", e);
        if (!cancelled) {
          setBnbBalanceWei(null);
          setTokenBalanceWei(null);
        }
      }
    };

    // In MOCK mode the trading panel can still show balances if the wallet is connected.
    loadBalances();

    return () => {
      cancelled = true;
    };
  }, [wallet.provider, wallet.account, campaign?.token]);

  // Build transactions table rows.
  useEffect(() => {
    if (!campaign) {
      setTxs([]);
      return;
    }

    // MOCK MODE
    if (USE_MOCK_DATA) {
      const sym = campaign?.symbol ?? "";
      const isCurveTest = sym.toUpperCase() === "MOCK2";
      const graduated =
        !isCurveTest &&
        Boolean(metrics && metrics.graduationTarget > 0n && metrics.sold >= metrics.graduationTarget);

      const nowTs = Math.floor(Date.now() / 1000);
      const addrs = [
        "0x3f2a0bD1B17B2D2b8b1B2b9E3c2f58b9c2aE1111",
        "0x9f1bA1dE2c3D4e5F6a7B8c9D0e1F2a3B4c5D2222",
        "0x1111222233334444555566667777888899990000",
        "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      ];

      const pseudoTx = (prefix: string, i: number) => {
        let h = 2166136261;
        const s = `${prefix}-${i}`;
        for (let k = 0; k < s.length; k++) {
          h ^= s.charCodeAt(k);
          h = Math.imul(h, 16777619);
        }
        const base = (h >>> 0).toString(16).padStart(8, "0");
        return (`0x${base.repeat(8)}`).slice(0, 66);
      };

      const mcap = tokenData.marketCap ?? "—";

      // MOCK: Graduated -> mock DEX trades
      if (graduated) {
        const dex = getMockDexTradesForSymbol(sym);
        if (!dex.length) {
          setTxs([]);
          return;
        }

        const lastTs = dex[dex.length - 1].timestamp;
        const shift = nowTs - lastTs;

        const raw = [...dex].map((t, i) => ({
          timestamp: t.timestamp + shift,
          side: t.side as "buy" | "sell",
          tokensWei: t.tokensWei,
          nativeWei: t.nativeWei,
          pricePerToken: t.pricePerToken, // number
          trader: t.trader || addrs[i % addrs.length],
          txHash: t.txHash || pseudoTx(`dex-${sym}`, i),
        }));

        const next: TxRow[] = raw
          .slice(-50)
          .reverse()
          .map((p) => {
            const tokenAmount = Number(ethers.formatUnits(p.tokensWei ?? 0n, TOKEN_DECIMALS));
            const bnb = Number(ethers.formatEther(p.nativeWei ?? 0n));

            const bnbStr = Number.isFinite(bnb) ? `${bnb.toFixed(4)} BNB` : "—";
            const priceStr = formatPriceBnb(typeof p.pricePerToken === "number" ? p.pricePerToken : Number(p.pricePerToken));

            const txHash = p.txHash || pseudoTx(`dex-${sym}`, 0);

return {
  id: txHash,
  time: formatAgo(p.timestamp),
  type: p.side,
  amount: formatCompact(tokenAmount),
  bnb: bnbStr,
  price: priceStr,
  mcap,
  maker: shorten(p.trader),
  makerAddress: String(p.trader ?? ""),
  txHash,
};
          });

        setTxs(next);
        return;
      }

      // MOCK: Pre-LP -> derive mock curve txs from mock curve events
      const curve = getMockCurveEventsForSymbol(sym);
      if (!curve.length) {
        setTxs([]);
        return;
      }

      const lastTs = curve[curve.length - 1].timestamp;
      const shift = nowTs - lastTs;

      const perTradeBnb = 0.05;
      const perTradeWei = 50_000_000_000_000_000n; // 0.05 BNB

      const raw = [...curve].map((e, i) => {
        const ts = e.timestamp + shift;
        const side: "buy" | "sell" = i % 4 === 0 ? "sell" : "buy";
        const tokens = e.pricePerToken > 0 ? perTradeBnb / e.pricePerToken : 0;
        const tokensWei = BigInt(Math.floor(tokens * 1e18));
        const trader = addrs[i % addrs.length];
        const txHash = pseudoTx(`curve-${sym}`, i);
        return {
          timestamp: ts,
          side,
          tokensWei,
          nativeWei: perTradeWei,
          pricePerToken: e.pricePerToken, // number
          trader,
          txHash,
        };
      });

      const next: TxRow[] = raw
        .slice(-50)
        .reverse()
        .map((p) => {
          const tokenAmount = Number(ethers.formatUnits(p.tokensWei, TOKEN_DECIMALS));
          const bnb = Number(ethers.formatEther(p.nativeWei));
          const bnbStr = Number.isFinite(bnb) ? `${bnb.toFixed(4)} BNB` : "—";
          const priceStr = formatPriceBnb(p.pricePerToken);

          const txHash = p.txHash || pseudoTx(`curve-${sym}`, 0);

return {
  id: txHash,
  time: formatAgo(p.timestamp),
  type: p.side,
  amount: formatCompact(tokenAmount),
  bnb: bnbStr,
  price: priceStr,
  mcap,
  maker: shorten(p.trader),
  makerAddress: String(p.trader ?? ""),
  txHash,
};
        });

      setTxs(next);
      return;
    }

    // LIVE MODE: useCurveTrades() points are CurveTrade objects (type/from/tokensWei/nativeWei/pricePerToken/timestamp/txHash)
    const mcap = tokenData.marketCap ?? "—";

    const next: TxRow[] = [...liveCurvePointsSafe]
  .slice(-50)
  .reverse()
  .map((p: any, idx: number) => {
    const tokenAmount = Number(ethers.formatUnits(p.tokensWei ?? 0n, TOKEN_DECIMALS));
    const bnb = Number(ethers.formatEther(p.nativeWei ?? 0n));
    const bnbStr = Number.isFinite(bnb) ? `${bnb.toFixed(4)} BNB` : "—";

    const priceNum = typeof p.pricePerToken === "number" ? p.pricePerToken : Number(p.pricePerToken ?? 0);
    const priceStr = formatPriceBnb(priceNum);

    const txHash = String(p.txHash ?? "");
    const ts = Number(p.timestamp ?? 0);
    const id = txHash || `${ts}-${idx}`;

    return {
      id,
      time: formatAgo(ts),
      type: (p.type ?? "buy") as "buy" | "sell",
      amount: formatCompact(tokenAmount),
      bnb: bnbStr,
      price: priceStr,
      mcap,
      maker: shorten(p.from),
      makerAddress: String(p.from ?? ""),
      txHash,
    };
  });

setTxs(next);
  }, [USE_MOCK_DATA, campaign, liveCurvePointsSafe, tokenData.marketCap, metrics]);

  // 🔹 Dexscreener chart-only URL (mock or live) based on the token contract
  // In mock mode we still want to be able to test the internal bonding-curve chart.
  // For the special curve-test token (MOCK2) we force DexScreener OFF so the CurvePriceChart renders.
  const isCurveTestToken =
    (campaign?.symbol ?? tokenData.ticker ?? "").toUpperCase() === "MOCK2";

  // DexScreener gating: only show external DEX chart after graduation / finalize.
  // Prefer explicit flags when available; fall back to sold >= graduationTarget for older deployments.
  const hasLaunchFlag = (metrics as any)?.launched !== undefined || (metrics as any)?.finalizedAt !== undefined;
  const isGraduated = hasLaunchFlag
    ? Boolean((metrics as any)?.launched) || (typeof (metrics as any)?.finalizedAt === "bigint" ? (metrics as any).finalizedAt > 0n : Number((metrics as any)?.finalizedAt ?? 0) > 0)
    : Boolean(metrics && metrics.graduationTarget > 0n && metrics.sold >= metrics.graduationTarget);

  const dexTokenAddress = (!isCurveTestToken && isGraduated) ? (campaign?.token ?? "") : "";

  const { url: chartUrl, baseUrl: dexBaseUrl, liquidityBnb: dexLiquidityBnb } =
    useDexScreenerChart(dexTokenAddress);
  const isDexStage = !isCurveTestToken && isGraduated;

  const curveProgress = useMemo(() => {
    // IMPORTANT:
    // - metrics.sold is TOKEN wei sold on the bonding curve.
    // - metrics.curveSupply is TOKEN wei available to sell on the curve.
    // - metrics.graduationTarget is BNB wei required (reserve) to unlock DEX stage.
    // The contract graduates when either:
    //   sold >= curveSupply   OR   reserve >= graduationTarget

    const sold = metrics?.sold ?? 0n;
    const curveSupply = metrics?.curveSupply ?? 0n;
    const targetWei = metrics?.graduationTarget ?? 0n;
    const reserveWei = curveReserveWei ?? 0n;

    const soldPct =
      curveSupply > 0n ? Number(((sold * 10000n) / curveSupply)) / 100 : 0;

    const raisedPct =
      targetWei > 0n ? Number(((reserveWei * 10000n) / targetWei)) / 100 : 0;

    const reachedSold = curveSupply > 0n && sold >= curveSupply;
    const reachedRaised = targetWei > 0n && reserveWei >= targetWei;

    // When we are in DEX stage, always show 100%.
    if (isDexStage) {
      return {
        pct: 100,
        matured: true,
        soldWei: sold,
        curveSupplyWei: curveSupply,
        reserveWei,
        targetWei,
        soldPct: 100,
        raisedPct: 100,
      };
    }

    // Show whichever progress is “more complete”, because graduation triggers on either.
    const pct = Math.max(
      0,
      Math.min(100, Math.max(soldPct, raisedPct))
    );

    return {
      pct,
      matured: reachedSold || reachedRaised,
      soldWei: sold,
      curveSupplyWei: curveSupply,
      reserveWei,
      targetWei,
      soldPct: Math.max(0, Math.min(100, soldPct)),
      raisedPct: Math.max(0, Math.min(100, raisedPct)),
    };
  }, [isDexStage, metrics?.sold, metrics?.curveSupply, metrics?.graduationTarget, curveReserveWei]);

    const remainingCurveWei = useMemo(() => {
    // Remaining BNB needed to reach the graduation target (reserve-based trigger).
    // If already in DEX stage, remaining is 0.
    if (isDexStage) return 0n;

    const targetWei = curveProgress.targetWei ?? 0n;
    const reserveWei = curveProgress.reserveWei ?? 0n;
    return targetWei > reserveWei ? targetWei - reserveWei : 0n;
  }, [isDexStage, curveProgress.targetWei, curveProgress.reserveWei]);

  const remainingCurveLabel = useMemo(() => {
    const bnbLabel = formatBnbFromWei(remainingCurveWei);

    let remainingBnbNum: number | null = null;
    try {
      const n = Number(ethers.formatEther(remainingCurveWei));
      remainingBnbNum = Number.isFinite(n) ? n : null;
    } catch {
      remainingBnbNum = null;
    }

    const usdLabel =
      remainingBnbNum != null && bnbUsdPrice
        ? formatCompactUsd(remainingBnbNum * bnbUsdPrice)
        : bnbUsdLoading
        ? "…"
        : "—";

    // Primary follows the denomination toggle; secondary shows the other denomination.
    if (displayDenom === "USD") return { primary: usdLabel, secondary: bnbLabel };
    return { primary: bnbLabel, secondary: usdLabel };
  }, [remainingCurveWei, displayDenom, bnbUsdPrice, bnbUsdLoading]);

  const liquidityLabel = isDexStage ? "Liquidity" : "Reserve";
  const liquidityValue = (() => {
    if (!isDexStage) return tokenData.liquidity;

    // MOCK: use per-symbol mock liquidity to mimic a real DEX pool.
    if (USE_MOCK_DATA) {
      const liq = getMockDexLiquidityBnbForSymbol(campaign?.symbol);
      return formatBnb(liq ?? null);
    }

    // LIVE: best-effort liquidity (BNB-equivalent) from DexScreener.
    return formatBnb(dexLiquidityBnb ?? null);
  })()

  const liquidityDisplay = useMemo(() => {
    const bnbLabel = liquidityValue;

    if (displayDenom === "BNB") return bnbLabel;

    const liqBnb = parseBnbLabel(bnbLabel);
    if (liqBnb == null) return "—";

    if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";

    return formatCompactUsd(liqBnb * bnbUsdPrice);
  }, [displayDenom, liquidityValue, bnbUsdPrice, bnbUsdLoading]);
;

  const chartTitle = isDexStage ? "DEX chart" : "";
  const stagePill = isDexStage ? "Graduated" : "Bonding";

  // Quote (buy: BNB cost; sell: BNB payout) for the entered token amount
  useEffect(() => {
    let cancelled = false;

    const loadQuote = async () => {
      try {
        setQuoteError(null);

        if (isDexStage) {
          setQuoteWei(null);
          return;
        }
        if (!campaign?.campaign) {
          setQuoteWei(null);
          return;
        }

        let amountWei = 0n;
        let inputBnbWei = 0n;
        if (tradeInputDenom === "BNB") {
          inputBnbWei = parseBnbAmountWei(tradeAmount);
          setEffectiveBnbWei(inputBnbWei);
          if (inputBnbWei <= 0n) {
            setEffectiveTokenWei(0n);
            setQuoteWei(null);
            return;
          }
        } else {
          amountWei = parseTokenAmountWei(tradeAmount);
          setEffectiveTokenWei(amountWei);
          if (amountWei <= 0n) {
            setQuoteWei(null);
            return;
          }
        }

        setQuoteLoading(true);

        if (USE_MOCK_DATA) {
          const priceWei = metrics?.currentPrice ?? 0n;
          if (tradeInputDenom === "BNB") {
            // Approximate inversion using current price.
            if (priceWei > 0n) {
              const estTokens = (inputBnbWei * 10n ** 18n) / priceWei;
              amountWei = tradeTab === "buy" ? estTokens : (estTokens * 100n) / 95n;
            } else {
              amountWei = 0n;
            }
            if (!cancelled) {
              setEffectiveTokenWei(amountWei);
              setQuoteWei(inputBnbWei);
            }
            return;
          }
          const gross = (amountWei * priceWei) / 10n ** 18n;
          const q = tradeTab === "buy" ? gross : (gross * 95n) / 100n;
          if (!cancelled) setQuoteWei(q);
          return;
        }

        if (!wallet.provider) {
          if (!cancelled) {
            setQuoteWei(null);
            setQuoteError("Wallet provider not available");
          }
          return;
        }

        const c = new Contract(campaign.campaign, CAMPAIGN_ABI, wallet.provider) as any;
        if (tradeInputDenom === "BNB") {
          // Invert the quote function so the user can input BNB.
          const targetWei = inputBnbWei;
          const priceWei = metrics?.currentPrice ?? 0n;
          let hi: bigint;
          if (tradeTab === "sell" && tokenBalanceWei != null && tokenBalanceWei > 0n) {
            hi = tokenBalanceWei;
          } else if (priceWei > 0n) {
            const est = (targetWei * 10n ** 18n) / priceWei;
            hi = est > 0n ? est * 2n : 10n ** 18n;
          } else {
            hi = 10n ** 24n;
          }
          let lo = 0n;
          // 28 iterations ~= good precision without too many RPC calls.
          for (let i = 0; i < 28; i++) {
            const mid = (lo + hi) / 2n;
            if (mid <= 0n) {
              lo = 0n;
              continue;
            }
            const q: bigint = tradeTab === "buy"
              ? await c.quoteBuyExactTokens(mid)
              : await c.quoteSellExactTokens(mid);
            if (tradeTab === "buy") {
              // Max tokens such that cost <= target
              if (q <= targetWei) lo = mid; else hi = mid;
            } else {
              // Min tokens such that payout >= target
              if (q >= targetWei) hi = mid; else lo = mid;
            }
          }
          const solved = tradeTab === "buy" ? lo : hi;
          if (!cancelled) {
            setEffectiveTokenWei(solved);
            setQuoteWei(targetWei);
          }
        } else {
          const q: bigint = tradeTab === "buy"
            ? await c.quoteBuyExactTokens(amountWei)
            : await c.quoteSellExactTokens(amountWei);
          if (!cancelled) setQuoteWei(q);
        }
      } catch (e: any) {
        console.warn("[TokenDetails] Quote failed", e);
        if (!cancelled) {
          setQuoteWei(null);
          setQuoteError(e?.message ?? "Failed to fetch quote");
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    const t = setTimeout(loadQuote, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [wallet.provider, campaign?.campaign, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage]);

  const handlePlaceTrade = async () => {
    if (!campaign?.campaign) return;

    if (isDexStage) {
      toast({
        title: "Token is graduated",
        description: "This token is trading on DEX now. Use DexScreener / PancakeSwap.",
      });
      if (dexBaseUrl) window.open(dexBaseUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const amountWei = tradeInputDenom === "BNB" ? effectiveTokenWei : parseTokenAmountWei(tradeAmount);
  const inputBnbWei = tradeInputDenom === "BNB" ? effectiveBnbWei : 0n;
    if (amountWei <= 0n) {
      toast({
        title: "Invalid amount",
        description: tradeInputDenom === "BNB" ? "Enter a BNB amount greater than 0." : `Enter a ${tokenData.ticker} amount greater than 0.`,
        variant: "destructive",
      });
      return;
    }

    try {
      // Balance sanity checks (best-effort)
      if (!isDexStage && tradeTab === "sell" && tokenBalanceWei != null && amountWei > tokenBalanceWei) {
        toast({
          title: "Insufficient token balance",
          description: `You do not have enough ${tokenData.ticker} to sell that amount.`,
          variant: "destructive",
        });
        return;
      }

      if (!isDexStage && tradeTab === "buy" && bnbBalanceWei != null) {
        const baseCostWei = tradeInputDenom === "BNB" ? inputBnbWei : (quoteWei ?? 0n);
        if (baseCostWei > 0n) {
          const maxCostWei = (baseCostWei * BigInt(100 + SLIPPAGE_PCT)) / 100n;
          if (maxCostWei > bnbBalanceWei) {
          toast({
            title: "Insufficient BNB",
            description: `You need ~${formatBnbFromWei(maxCostWei)} to place this buy.`,
            variant: "destructive",
          });
          return;
        }
          }
      }

      // Ensure wallet is connected for writes (live mode)
      if (!USE_MOCK_DATA) {
        if (!wallet.signer || !wallet.account) {
          toast({
            title: "Connect wallet",
            description: "Please connect your wallet to trade.",
          });
          await wallet.connect();
        }
        if (!wallet.signer || !wallet.account) throw new Error("Wallet not connected");
      }

      setTradePending(true);

      if (tradeTab === "buy") {
        let costWei = tradeInputDenom === "BNB" ? inputBnbWei : quoteWei;
        if (costWei == null || costWei === 0n) {
          if (USE_MOCK_DATA) {
            const priceWei = metrics?.currentPrice ?? 0n;
            costWei = (amountWei * priceWei) / 10n ** 18n;
          } else {
            const c = new Contract(campaign.campaign, CAMPAIGN_ABI, wallet.provider ?? wallet.signer) as any;
            costWei = await c.quoteBuyExactTokens(amountWei);
          }
        }

        const maxCostWei = (costWei * BigInt(100 + SLIPPAGE_PCT)) / 100n;

        toast({
          title: "Submitting buy",
          description: `Buying ${ethers.formatUnits(amountWei, TOKEN_DECIMALS)} ${tokenData.ticker} (max ${formatBnbFromWei(maxCostWei)}).`,
        });

        const receipt: any = await buyTokens(campaign.campaign, amountWei, maxCostWei);

        toast({
          title: "Buy confirmed",
          description: receipt?.transactionHash ? `Tx: ${receipt.transactionHash.slice(0, 10)}...` : "Transaction confirmed.",
        });
      } else {
        let payoutWei = tradeInputDenom === "BNB" ? inputBnbWei : quoteWei;
        if (payoutWei == null || payoutWei === 0n) {
          if (USE_MOCK_DATA) {
            const priceWei = metrics?.currentPrice ?? 0n;
            const gross = (amountWei * priceWei) / 10n ** 18n;
            payoutWei = (gross * 95n) / 100n;
          } else {
            const c = new Contract(campaign.campaign, CAMPAIGN_ABI, wallet.provider ?? wallet.signer) as any;
            payoutWei = await c.quoteSellExactTokens(amountWei);
          }
        }

        const minPayoutWei = (payoutWei * BigInt(100 - SLIPPAGE_PCT)) / 100n;

        if (!USE_MOCK_DATA && campaign?.token) {
          const token = new Contract(campaign.token, TOKEN_ABI, wallet.signer) as any;
          const allowance: bigint = await token.allowance(wallet.account, campaign.campaign);
          if (allowance < amountWei) {
            setApprovePending(true);
            toast({
              title: "Approval required",
              description: `Approving ${tokenData.ticker} for selling...`,
            });
            const tx = await token.approve(campaign.campaign, MAX_UINT256);
            await tx.wait();
            setApprovePending(false);
          }
        }

        toast({
          title: "Submitting sell",
          description: `Selling ${ethers.formatUnits(amountWei, TOKEN_DECIMALS)} ${tokenData.ticker} (min ${formatBnbFromWei(minPayoutWei)}).`,
        });

        const receipt: any = await sellTokens(campaign.campaign, amountWei, minPayoutWei);

        toast({
          title: "Sell confirmed",
          description: receipt?.transactionHash ? `Tx: ${receipt.transactionHash.slice(0, 10)}...` : "Transaction confirmed.",
        });
      }

      // Refresh headline stats + balances
      try {
        const s = await fetchCampaignSummary(campaign);
        setSummary(s);
        setMetrics(s.metrics ?? null);
      } catch {
        // ignore
      }

      try {
        if (!USE_MOCK_DATA && wallet.provider && campaign?.campaign) {
          const bal = await wallet.provider.getBalance(campaign.campaign);
          setCurveReserveWei(bal);
        }
      } catch {
        // ignore
      }

      try {
        if (wallet.provider && wallet.account && campaign?.token) {
          const [bnbBal, tokenBal] = await Promise.all([
            wallet.provider.getBalance(wallet.account),
            (async () => {
              try {
                const t = new Contract(campaign.token, TOKEN_ABI, wallet.provider) as any;
                return (await t.balanceOf(wallet.account)) as bigint;
              } catch {
                return 0n;
              }
            })(),
          ]);
          setBnbBalanceWei(bnbBal);
          setTokenBalanceWei(tokenBal);
        }
      } catch {
        // ignore
      }

      setTradeAmount("0");
    } catch (e: any) {
      console.error("[TokenDetails] Trade failed", e);
      toast({
        title: "Trade failed",
        description: e?.reason || e?.message || "Transaction failed.",
        variant: "destructive",
      });
    } finally {
      setApprovePending(false);
      setTradePending(false);
    }
  };

  const copyAddress = () => {
    const address = campaign?.token ?? "";
    if (!address) return;

    navigator.clipboard.writeText(address);
    toast({
      title: "Copied!",
      description: "Contract address copied to clipboard",
    });
  };

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center px-4">
        <Card className="p-4 md:p-6 bg-card/40 border border-border/40 max-w-md w-full text-center">
          <h2 className="text-sm md:text-base font-semibold mb-2">{error}</h2>
          <p className="text-xs md:text-sm text-muted-foreground">
            {error === "No token data"
              ? "There are no campaigns available yet."
              : "Please go back to the main page and select another token."}
          </p>
        </Card>
      </div>
    );
  }

  if (loading && !campaign) {
    return (
      <div className="h-full w-full flex items-center justify-center px-4">
        <Card className="p-4 md:p-6 bg-card/40 border border-border/40 max-w-md w-full text-center">
          <p className="text-xs md:text-sm text-muted-foreground">
            Loading token data...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto lg:overflow-hidden flex flex-col px-3 md:px-6 pt-3 md:pt-6 gap-3 md:gap-4">
      {/* Main Content - Single Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4 lg:flex-1 lg:min-h-0">
        {/* Left Column - Header, Chart & Transactions (3/4 width) */}
        <div className="lg:col-span-3 lg:min-h-0">
          <div className="flex flex-col gap-3 md:gap-4 lg:h-full lg:min-h-0 lg:overflow-y-auto pr-1">
          {/* Top Header Bar */}
          <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-3 md:p-6 flex-shrink-0">
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              {/* Token Image & Info */}
              <div className="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
                <img
                  src={tokenData.image}
                  alt={tokenData.ticker}
                  className="w-12 h-12 md:w-16 md:h-16 rounded-full flex-shrink-0"
                />

                <div className="flex flex-col gap-1.5 md:gap-2.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 md:gap-3">
                    <h1 className="text-sm md:text-lg font-retro text-foreground truncate">
                      {tokenData.name}
                    </h1>
                    <span className="text-xs md:text-sm text-muted-foreground font-mono">
                      {tokenData.ticker}
                    </span>
                    <Copy
                      className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex-shrink-0"
                      onClick={copyAddress}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2.5">
                    {tokenData.hasWebsite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 md:h-7 md:w-7 p-0 hover:bg-muted/50"
                        onClick={() => {
                          const url = campaign?.website;
                          if (url) window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <Globe className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      </Button>
                    )}
                    {tokenData.hasTwitter && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 md:h-7 md:w-7 p-0 hover:bg-muted/50"
                        onClick={() => {
                          const handle = campaign?.xAccount;
                          if (!handle) return;
                          const url = handle.startsWith("http")
                            ? handle
                            : `https://x.com/${handle.replace(/^@/, "")}`;
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <img
                          src={twitterIcon}
                          alt="Twitter"
                          className="h-3 w-3 md:h-3.5 md:w-3.5"
                        />
                      </Button>
                    )}
                    {(() => {
                      const creator = String(campaign?.creator ?? "").trim();
                      if (!creator) return null;

                      const display =
                        (creatorProfile?.displayName
                          ? String(creatorProfile.displayName).trim()
                          : "") || shortenAddress(creator);

                      const createdLabel = campaign?.createdAt
                        ? formatTimeAgo(campaign.createdAt)
                        : campaign?.timeAgo
                        ? `${campaign.timeAgo}${String(campaign.timeAgo).includes("ago") ? "" : " ago"}`
                        : "—";

                      const initial = display ? display.slice(0, 1).toUpperCase() : "C";

                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/profile?address=${creator}`}
                            className="flex items-center gap-2 hover:opacity-90 transition-opacity max-w-[240px]"
                          >
                            <Avatar className="h-6 w-6 md:h-7 md:w-7">
                              <AvatarImage
                                src={creatorProfile?.avatarUrl || undefined}
                                alt={display}
                              />
                              <AvatarFallback className="text-[10px] md:text-xs">
                                {initial}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-[10px] md:text-xs text-foreground/90 truncate">
                              {display}
                            </span>
                          </Link>
                          <span className="text-[10px] md:text-xs text-muted-foreground">
                            •
                          </span>
                          <span className="text-[10px] md:text-xs text-muted-foreground">
                            {createdLabel}
                          </span>

                          {/* Upvote CTA */}
                          {campaignAddress ? (
                            <UpvoteDialog
                              campaignAddress={campaignAddress}
                              buttonVariant="secondary"
                              buttonSize="sm"
                              className="h-6 md:h-7 px-2 md:px-3 text-[10px] md:text-xs"
                            />
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Vertical Separator - Desktop only */}
              <div className="hidden md:block h-14 w-px bg-border/50 flex-shrink-0" />

              {/* Market Cap */}
              <div className="flex items-center justify-between md:flex-col md:gap-1.5 md:flex-1 md:min-w-0">
                <p className="text-xs text-muted-foreground">Market cap</p>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5">
                    <Button
                      size="sm"
                      variant={displayDenom === "USD" ? "secondary" : "ghost"}
                      className="h-4 px-2"
                      onClick={() => setDisplayDenom("USD")}
                    >
                      USD
                    </Button>
                    <Button
                      size="sm"
                      variant={displayDenom === "BNB" ? "secondary" : "ghost"}
                      className="h-4 px-2"
                      onClick={() => setDisplayDenom("BNB")}
                    >
                      BNB
                    </Button>
                  </div>

                                    <h3 className="text-base md:text-xl font-retro text-foreground">
                    {marketCapDisplay}
                  </h3>
                </div>
              </div>

              {/* Mobile: Expandable Metrics Section */}
              {isMobile && (
                <div className="w-full">
                  <button
                    onClick={() => setMetricsExpanded(!metricsExpanded)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg"
                  >
                    <span className="text-xs text-muted-foreground">More metrics</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        metricsExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {metricsExpanded && (
                    <div className="mt-2 space-y-3 p-3 bg-muted/20 rounded-lg">
                      {/* Time-based percentage changes */}
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(tokenData.metrics).map(([key, data]) => (
                          <div
                            key={key}
                            onClick={() =>
                              setSelectedTimeframe(key as "5m" | "1h" | "4h" | "24h")
                            }
                            className={`cursor-pointer transition-all text-xs p-2 rounded-md ${
                              selectedTimeframe === key
                                ? "bg-accent/20"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <span className="text-muted-foreground">{key}</span>
                            {(() => {
                              const ch = (data as any).change as number | null;
                              return (
                                <span
                                  className={`ml-2 font-mono ${
                                    ch == null
                                      ? "text-muted-foreground"
                                      : ch > 0
                                      ? "text-green-500"
                                      : ch < 0
                                      ? "text-red-500"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {ch == null ? "—" : `${ch > 0 ? "▲" : ch < 0 ? "▼" : "•"} ${Math.abs(ch).toFixed(2)}%`}
                                </span>
                              );
                            })()}
                          </div>
                        ))}
                      </div>

                      {/* Additional metrics */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
                        <div className="text-xs">
                          <span className="text-muted-foreground block">Price</span>
                          <span className="font-mono text-foreground">{priceDisplay}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">{liquidityLabel}</span>
                          <span className="font-mono text-foreground">{liquidityDisplay}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">Volume</span>
                          <span className="font-mono text-foreground">
                            {volumeDisplay}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">Holders</span>
                          <span className="font-mono text-foreground">{tokenData.holders}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Desktop: Vertical Separator */}
              <div className="hidden lg:block h-14 w-px bg-border/50 flex-shrink-0" />

              {/* Desktop: Time-based Metrics & Additional Metrics */}
              <div className="hidden lg:flex flex-col gap-4 flex-[2] min-w-0">
                {/* Top Row - Time-based percentage changes (clickable) */}
                <div className="flex items-center justify-between gap-4">
                  {Object.entries(tokenData.metrics).map(([key, data]) => (
                    <div
                      key={key}
                      onClick={() => setSelectedTimeframe(key as "5m" | "1h" | "4h" | "24h")}
                      className={`cursor-pointer transition-all text-xs ${
                        selectedTimeframe === key
                          ? "opacity-100"
                          : "opacity-50 hover:opacity-75"
                      }`}
                    >
                      <span className="text-muted-foreground">{key}</span>
                      {(() => {
                        const ch = (data as any).change as number | null;
                        return (
                          <span
                            className={`ml-2 font-mono ${
                              ch == null
                                ? "text-muted-foreground"
                                : ch < 0
                                ? "text-red-500"
                                : "text-green-500"
                            }`}
                          >
                            {ch == null ? "—" : `${ch > 0 ? "▲" : ch < 0 ? "▼" : "•"} ${Math.abs(ch).toFixed(2)}%`}
                          </span>
                        );
                      })()}
                    </div>
                  ))}
                </div>

                {/* Bottom Row - Price, Liq, Volume, Holders */}
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Price</span>
                    <span className="ml-2 font-mono text-foreground">{priceDisplay}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">{liquidityLabel}</span>
                    <span className="ml-2 font-mono text-foreground">{liquidityDisplay}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="ml-2 font-mono text-foreground">
                      {volumeDisplay}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Holders</span>
                    <span className="ml-2 font-mono text-foreground">{tokenData.holders}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Chart */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-0 overflow-hidden flex flex-col min-h-[360px] h-[360px] md:min-h-[420px] md:h-[420px] lg:min-h-[320px] lg:h-auto"
style={!isMobile ? { flex: "2" } : undefined}
          >
            <div className="flex flex-col gap-2 px-4 py-2 border-b border-border/40 bg-card/20 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground">{chartTitle}</span>
                <span
  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
    isDexStage
      ? "bg-emerald-500/25 text-emerald-200 border-emerald-500/40"
      : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
  }`}
>
                  {stagePill}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto md:justify-end">
                {!isDexStage && (
                  <AthBar
                    currentLabel={marketCapUsdLabel ?? undefined}
                    storageKey={`launchit:ath:${campaign?.campaign ?? campaignAddress ?? tokenData.ticker}`}
                    className="w-full md:w-auto md:max-w-[320px]"
                  />
                )}

                {isDexStage && dexBaseUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => window.open(dexBaseUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    DexScreener
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              {isDexStage ? (
                chartUrl ? (
                  <iframe
                    src={chartUrl}
                    title={`${tokenData.ticker} chart`}
                    className="w-full h-full min-h-[260px] border-0"
                    allow="clipboard-write; clipboard-read; encrypted-media;"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full min-h-[260px] text-xs text-muted-foreground p-4">
                    DexScreener data is not available yet.
                  </div>
                )
              ) : (
                <div className="w-full h-full min-h-[260px]">
                <CurvePriceChart
                  campaignAddress={campaign?.campaign}
                  mockMode={USE_MOCK_DATA}
                  mockEvents={USE_MOCK_DATA ? getMockCurveEventsForSymbol(campaign?.symbol) : []}
                  curvePointsOverride={!USE_MOCK_DATA ? liveCurvePoints : undefined}
                  loadingOverride={!USE_MOCK_DATA ? liveCurveLoading : undefined}
                  errorOverride={!USE_MOCK_DATA ? liveCurveError : undefined}
                />
                </div>
              )}
            </div>
          </Card>

          {/* Activity: Comments / Trades */}
        <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
          <Tabs
            value={activityTab}
            onValueChange={(v) => setActivityTab(v as any)}
            className="h-full flex flex-col min-h-0"
          >
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="trades">Trades</TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="flex-1 min-h-0 overflow-y-auto">
              {campaign?.campaign ? (
                <TokenComments
                  chainId={Number(wallet.chainId ?? 97)}
                  campaignAddress={campaign.campaign}
                  tokenAddress={campaign.token}
                />
              ) : (
                <div className="text-sm text-muted-foreground">Loading comments…</div>
              )}
            </TabsContent>

            <TabsContent value="trades" className="flex-1 min-h-0 overflow-y-auto">
              <div className="overflow-auto h-full">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card/60 backdrop-blur border-b border-border">
                    <tr>
                      <th className="text-left py-3 px-3 font-medium text-muted-foreground">Account</th>
                      <th className="text-left py-3 px-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left py-3 px-3 font-medium text-muted-foreground">Time</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Txn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => {
                      const addr = (tx.makerAddress || "").toLowerCase();
                      const prof = addr ? makerProfiles[addr] : null;
                      const avatar = prof?.avatarUrl || "/placeholder.svg";
                      const label = (prof?.displayName && prof.displayName.trim().length)
                        ? prof.displayName.trim()
                        : tx.maker;

                      const explorer = getExplorerBase(wallet.chainId);
                      const txLabel = tx.txHash ? `${tx.txHash.slice(0, 6)}…${tx.txHash.slice(-4)}` : "—";
                      const txUrl = tx.txHash ? `${explorer}/tx/${tx.txHash}` : "";

                      return (
                        <tr key={tx.id} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="py-3 px-3">
                            {tx.makerAddress ? (
                              <Link
                                to={`/profile?address=${tx.makerAddress}`}
                                className="flex items-center gap-2 min-w-0"
                              >
                                <img
                                  src={avatar}
                                  alt={label}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = "/placeholder.svg";
                                  }}
                                  className="h-7 w-7 rounded-full ring-1 ring-border/30 flex-shrink-0"
                                />
                                <span className="font-mono text-foreground truncate max-w-[140px]">
                                  {label}
                                </span>
                              </Link>
                            ) : (
                              <span className="font-mono text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`font-medium ${tx.type === "buy" ? "text-emerald-400" : "text-red-400"}`}
                            >
                              {tx.type === "buy" ? "Buy" : "Sell"}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono text-foreground">{tx.bnb}</td>

                          <td className="py-3 px-3 font-mono">
                            <span className={tx.type === "buy" ? "text-emerald-300" : "text-red-300"}>
                              {tx.amount}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">{tx.time}</td>

                          <td className="py-3 px-3 text-right">
                            {txUrl ? (
                              <a
                                href={txUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                              >
                                {txLabel}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {txs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                          No trades yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
        </div>
        </div>

        {/* Right Column - Trading Panel & Stats (1/3 width) */}
        <div className="lg:col-span-1 min-h-0">
          <div className="flex flex-col gap-4 lg:h-full min-h-0 lg:overflow-y-auto pr-1">
          {/* Trading Panel - 2/5 height */}
          <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
            <Tabs value={tradeTab} onValueChange={handleTradeTabChange}>
              <TabsList className="grid w-full grid-cols-2 mb-3">
                <TabsTrigger value="buy" className="text-sm">Buy</TabsTrigger>
                <TabsTrigger value="sell" className="text-sm">Sell</TabsTrigger>
              </TabsList>

              <TabsContent value="buy" className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:bg-emerald-500/15 text-emerald-200 border-emerald-500/30" onClick={toggleTradeInputDenom}>{tradeInputDenom === "BNB" ? `Switch to ${tokenData.ticker}` : "Switch to BNB"}</Button></div>
                    <span className="text-xs text-muted-foreground">Slippage: {SLIPPAGE_PCT}%</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-20 font-mono text-base focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="0"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <span className="text-xs font-mono text-muted-foreground">{tradeInputDenom === "BNB" ? "BNB" : tokenData.ticker}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">Wallet: {formatBnbFromWei(bnbBalanceWei)}</span>
                    <span className="text-xs text-muted-foreground">
                      Cost: {tradeInputDenom === "BNB" ? formatBnbFromWei(effectiveBnbWei) : (quoteLoading ? "…" : quoteWei != null ? formatBnbFromWei(quoteWei) : "—")}
                    </span>
                  </div>
                  {tradeInputDenom === "BNB" && effectiveTokenWei > 0n ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Est. receive: {formatTokenFromWei(effectiveTokenWei)} {tokenData.ticker}</p>
                  ) : null}
                  {quoteError ? (
                    <p className="mt-2 text-center text-xs text-destructive">{quoteError}</p>
                  ) : null}
                </div>

                <div className="text-center text-xs text-muted-foreground">
                  {isDexStage ? (
                    <p>Token is graduated. Trade on DEX.</p>
                  ) : quoteWei != null ? (
                    <p>
                      You will pay ~{formatBnbFromWei(quoteWei)} (max {formatBnbFromWei((quoteWei * BigInt(100 + SLIPPAGE_PCT)) / 100n)})
                    </p>
                  ) : (
                    <p>Enter an amount to see the buy quote.</p>
                  )}
                </div>

                <Button
                  onClick={handlePlaceTrade}
                  disabled={tradePending || approvePending || (!isDexStage && (tradeInputDenom === "BNB" ? effectiveBnbWei <= 0n : parseTokenAmountWei(tradeAmount) <= 0n))}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-retro py-5"
                >
                  {tradePending ? "Processing..." : isDexStage ? "Trade on DEX" : "Place Trade"}
                </Button>
              </TabsContent>

              <TabsContent value="sell" className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Amount ({tradeInputDenom === "BNB" ? "BNB" : tokenData.ticker})</span><Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground" onClick={toggleTradeInputDenom}>{tradeInputDenom === "BNB" ? `Switch to ${tokenData.ticker}` : "Switch to BNB"}</Button></div>
                    <span className="text-xs text-muted-foreground">Slippage: {SLIPPAGE_PCT}%</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-20 font-mono text-base focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="0"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <span className="text-xs font-mono text-muted-foreground">{tradeInputDenom === "BNB" ? "BNB" : tokenData.ticker}</span>
                    </div>
                  </div>

                  <div className="flex gap-1 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => {
                        if (tokenBalanceWei == null) return;
                        const amt = (tokenBalanceWei * 25n) / 100n;
                        setTradeAmount(ethers.formatUnits(amt, TOKEN_DECIMALS));
                      }}
                    >
                      25%
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => {
                        if (tokenBalanceWei == null) return;
                        const amt = (tokenBalanceWei * 50n) / 100n;
                        setTradeAmount(ethers.formatUnits(amt, TOKEN_DECIMALS));
                      }}
                    >
                      50%
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => {
                        if (tokenBalanceWei == null) return;
                        setTradeAmount(ethers.formatUnits(tokenBalanceWei, TOKEN_DECIMALS));
                      }}
                    >
                      100%
                    </Button>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      Balance: {formatTokenFromWei(tokenBalanceWei)} {tokenData.ticker}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Payout: {tradeInputDenom === "BNB" ? formatBnbFromWei(effectiveBnbWei) : (quoteLoading ? "…" : quoteWei != null ? formatBnbFromWei(quoteWei) : "—")}
                    </span>
                  </div>
                  {tradeInputDenom === "BNB" && effectiveTokenWei > 0n ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Est. sell: {formatTokenFromWei(effectiveTokenWei)} {tokenData.ticker}</p>
                  ) : null}

                  {approvePending ? (
                    <p className="mt-2 text-center text-xs text-muted-foreground">Approval in progress...</p>
                  ) : null}
                  {quoteError ? (
                    <p className="mt-2 text-center text-xs text-destructive">{quoteError}</p>
                  ) : null}
                </div>

                <div className="text-center text-xs text-muted-foreground">
                  {isDexStage ? (
                    <p>Token is graduated. Trade on DEX.</p>
                  ) : quoteWei != null ? (
                    <p>
                      You will receive ~{formatBnbFromWei(quoteWei)} (min {formatBnbFromWei((quoteWei * BigInt(100 - SLIPPAGE_PCT)) / 100n)})
                    </p>
                  ) : (
                    <p>Enter an amount to see the sell quote.</p>
                  )}
                </div>

                <Button
                  onClick={handlePlaceTrade}
                  disabled={tradePending || approvePending || (!isDexStage && (tradeInputDenom === "BNB" ? effectiveBnbWei <= 0n : parseTokenAmountWei(tradeAmount) <= 0n))}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-retro py-5"
                >
                  {tradePending ? "Processing..." : isDexStage ? "Trade on DEX" : "Place Trade"}
                </Button>
              </TabsContent>
            </Tabs>
          </Card>

          <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
  <div className="flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">Bonding Curve Progress</h3>
      <span className="text-xs text-muted-foreground">
        {curveProgress.matured ? "Matured" : `${curveProgress.pct.toFixed(2)}%`}
      </span>
    </div>

    <div className="h-2 w-full rounded-full bg-muted/30 border border-border/40 overflow-hidden">
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.65),rgba(255,255,255,0.25),rgba(255,255,255,0.65))] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.25),rgba(255,255,255,0.08),rgba(255,255,255,0.25))]"
        style={{ width: `${Math.max(0, Math.min(100, curveProgress.pct))}%`, minWidth: curveProgress.pct > 0 ? "1px" : undefined }}
      />
    </div>

    <div className="text-xs text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>{formatBnbFromWei(curveProgress.reserveWei ?? undefined)} in bonding curve</span>
        <span className="text-right">
          <span className="text-muted-foreground">Remaining:</span>{" "}
          {remainingCurveLabel.primary}
        </span>
      </div>
    </div>
  </div>
</Card>

          {/* Flywheel Statistics - 2/5 height */}
          <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="text-sm font-retro text-foreground">Flywheel</h3>
              <span className="text-xs text-muted-foreground">All-time</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Buy volume</p>
                <p className="text-lg font-retro text-foreground">{flywheel.buyVolume}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Sell volume</p>
                <p className="text-lg font-retro text-foreground">{flywheel.sellVolume}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Net flow</p>
                <p className="text-lg font-retro text-foreground">{flywheel.netFlow}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Protocol fees (est.)</p>
                <p className="text-lg font-retro text-foreground">{flywheel.feesEstimated}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Buyers</p>
                <p className="text-lg font-retro text-foreground">{flywheel.buyers}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Protocol fee rate</p>
                <p className="text-lg font-retro text-foreground">{flywheel.feeRate}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              Volumes and buyer count come from on-chain counters when available. Fees are estimated from protocol fee basis points.
            </p>
          </Card>

          {/* Holder Distribution - 1/5 height */}
          <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="text-sm font-retro text-foreground">Holder Distribution</h3>
              <span className="text-xs text-muted-foreground">
                {holderDistribution.totalHolders} holders
              </span>
            </div>

            {holderDistribution.top.length ? (
              <div className="space-y-3 overflow-auto flex-1 min-h-0 pr-1">
                {holderDistribution.top.map((h, idx) => {
                  const rank = h.isLp ? null : holderDistribution.hasLp ? idx : idx + 1;

                  return (
                    <div key={h.address} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono min-w-0">
                          {rank != null ? `${rank}. ` : ""}

                          {h.isLp ? (
                            <span className="text-foreground">{h.label}</span>
                          ) : (
                            <Link
                              to={`/profile?address=${h.address}`}
                              className="text-foreground hover:underline underline-offset-4"
                            >
                              {h.label}
                            </Link>
                          )}
                        </span>
                        <span className="font-mono text-muted-foreground">{h.pct.toFixed(2)}%</span>
                      </div>
                      <Progress value={h.pct} className="h-1.5" />
                    </div>
                  );
                })}
                {holderDistribution.othersPct > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono">Others</span>
                      <span className="font-mono text-muted-foreground">{holderDistribution.othersPct.toFixed(2)}%</span>
                    </div>
                    <Progress value={holderDistribution.othersPct} className="h-1.5" />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No holder data yet.</div>
            )}

            <p className="text-[11px] text-muted-foreground mt-3 flex-shrink-0">
              Estimated from bonding-curve trades (excludes transfers).
            </p>
          </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenDetails;