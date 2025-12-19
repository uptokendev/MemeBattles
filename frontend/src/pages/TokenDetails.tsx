/**
 * Token Details Page
 * Displays comprehensive information about a specific token including
 * chart, trading interface, transactions, and holder distribution
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Copy, ExternalLink, Globe, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { Transaction } from "@/types/token";
import twitterIcon from "@/assets/social/twitter.png";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics, CampaignSummary } from "@/lib/launchpadClient";
import { useDexScreenerChart } from "@/hooks/useDexScreenerChart";
import { TokenCandlestickChart } from "@/components/token/TokenCandlestickChart";
import { USE_MOCK_DATA } from "@/config/mockConfig";
import { getMockCurveEventsForSymbol } from "@/constants/mockCurveTrades";
import { getMockDexTradesForSymbol } from "@/constants/mockDexTrades";
import { getMockDexLiquidityBnbForSymbol } from "@/constants/mockDexTrades";
import { useWallet } from "@/hooks/useWallet";
import { useCurveTrades } from "@/hooks/useCurveTrades";
import { Contract, ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { AthBar } from "@/components/token/AthBar";


const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;
const TOKEN_DECIMALS = 18;
const SLIPPAGE_PCT = 5;
const MAX_UINT256 = (1n << 256n) - 1n;

const TokenDetails = () => {
  // URL param: /token/:campaignAddress  (address-based)
const { campaignAddress } = useParams<{ campaignAddress: string }>();

  const { toast } = useToast();
  const [tradeAmount, setTradeAmount] = useState("0");
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const handleTradeTabChange = (value: string) => {
    setTradeTab(value as "buy" | "sell");
  };
  const [selectedTimeframe, setSelectedTimeframe] = useState<
    "5m" | "1h" | "4h" | "24h"
  >("24h");
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const isMobile = window.innerWidth < 768;

  // Launchpad hooks + state for the on-chain data
  const { fetchCampaigns, fetchCampaignSummary, fetchCampaignMetrics, buyTokens, sellTokens } = useLaunchpad();
  const wallet = useWallet();
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [curveReserveWei, setCurveReserveWei] = useState<bigint | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
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

      // Unified token stats + metrics (same source as carousel / UpNow)
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

  // Read curve trades for transactions + analytics (live mode)
  const { points: liveCurvePoints } = useCurveTrades(campaign?.campaign);

  type TimeframeKey = "5m" | "1h" | "4h" | "24h";
  const timeframeTiles = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const windows: Record<TimeframeKey, number> = {
      "5m": 5 * 60,
      "1h": 60 * 60,
      "4h": 4 * 60 * 60,
      "24h": 24 * 60 * 60,
    };

    // End price: prefer current on-chain price, otherwise use latest trade price
    const endPrice = metrics?.currentPrice
      ? Number(ethers.formatUnits(metrics.currentPrice, 18))
      : undefined;

    // Normalize mock timestamps so they sit “around now” for realistic windows.
    const mockCurve = getMockCurveEventsForSymbol(campaign?.symbol);
    const mockCurvePoints = (() => {
      if (!mockCurve.length) return [] as Array<{ timestamp: number; pricePerToken: number; nativeWei?: bigint }>;
      const lastTs = mockCurve[mockCurve.length - 1].timestamp;
      const shift = now - lastTs;
      const perTrade = 50_000_000_000_000_000n; // 0.05 BNB per point (demo)
      return mockCurve.map((e) => ({
        timestamp: e.timestamp + shift,
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

    const points: Array<{ timestamp: number; pricePerToken: number; nativeWei?: bigint }> =
      USE_MOCK_DATA ? (mockGraduated ? mockDexPoints : mockCurvePoints) : (liveCurvePoints as any);

    if (!points.length && endPrice == null) {
      return {
        "5m": { change: null as number | null, volume: "—" },
        "1h": { change: null as number | null, volume: "—" },
        "4h": { change: null as number | null, volume: "—" },
        "24h": { change: null as number | null, volume: "—" },
      };
    }

    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
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
      const before = [...sorted].reverse().find((p) => p.timestamp <= startTs);
      const within = sorted.find((p) => p.timestamp >= startTs);
      const startPrice = (before ?? within)?.pricePerToken;

      const volumeWei = sorted
        .filter((p) => p.timestamp >= startTs)
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
  }, [USE_MOCK_DATA, campaign?.symbol, liveCurvePoints, metrics]);

  // Token view-model used throughout the page (mock + live)
  const tokenData = useMemo(() => {
  const ticker = campaign?.symbol ?? "";
  const name = campaign?.name ?? "Token";
  const stats = summary?.stats;

  return {
    image: campaign?.logoURI || "/placeholder.svg",
      ticker,
      name,
      hasWebsite: Boolean(campaign?.website && campaign.website.length > 0),
      hasTwitter: Boolean(campaign?.xAccount && campaign.xAccount.length > 0),

      // Unified headline stats
      marketCap: stats?.marketCap ?? "—",
      volume: stats?.volume ?? "—",
      holders: stats?.holders ?? "—",
      price: formatPriceFromWei(metrics?.currentPrice ?? null),
      liquidity: formatBnbFromWei(curveReserveWei),

      // Timeframe analytics (BNB volume + price change)
      metrics: timeframeTiles,
    };
  }, [campaign, curveReserveWei, metrics, summary, timeframeTiles]);

  const shorten = (addr?: string): string => {
    if (!addr) return "—";
    return addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;
  };

  const formatCompact = (n: number): string => {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}m`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}k`;
    return n.toFixed(2);
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

  const formatChange = (ch: number | null): string => {
    if (ch == null || !Number.isFinite(ch)) return "—";
    const abs = Math.abs(ch);
    const dir = ch >= 0 ? "▲" : "▼";
    return `${dir} ${abs.toFixed(2)}%`;
  };
const [bnbUsd, setBnbUsd] = useState<number | null>(null);

useEffect(() => {
  let cancelled = false;

  const loadBnbUsd = async () => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd"
      );
      if (!res.ok) throw new Error(`BNB/USD HTTP ${res.status}`);

      const data = await res.json();
      const usd = Number(data?.binancecoin?.usd);

      if (!cancelled) setBnbUsd(Number.isFinite(usd) ? usd : null);
    } catch {
      if (!cancelled) setBnbUsd(null);
    }
  };

  loadBnbUsd();
  return () => {
    cancelled = true;
  };
}, []);

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
        console.warn('[TokenDetails] Failed to load balances', e);
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

  // Build transactions table from curve events (live). In mock mode we keep it empty unless you add mock trade data.
  useEffect(() => {
    if (!campaign) {
      setTxs([]);
      return;
    }

    if (USE_MOCK_DATA) {
      const sym = campaign?.symbol ?? "";
      const isCurveTest = sym.toUpperCase() === "MOCK2";
      const graduated =
        !isCurveTest &&
        Boolean(
          metrics &&
            metrics.graduationTarget > 0n &&
            metrics.sold >= metrics.graduationTarget
        );

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

      const mcap = summary?.stats.marketCap ?? "—";

      if (graduated) {
        const dex = getMockDexTradesForSymbol(sym);
        if (!dex.length) {
          setTxs([]);
          return;
        }

        const lastTs = dex[dex.length - 1].timestamp;
        const shift = nowTs - lastTs;

        const next: Transaction[] = [...dex]
          .map((t, i) => ({
            timestamp: t.timestamp + shift,
            side: t.side,
            tokensWei: t.tokensWei,
            nativeWei: t.nativeWei,
            pricePerToken: t.pricePerToken,
            trader: t.trader || addrs[i % addrs.length],
            txHash: t.txHash || pseudoTx(`dex-${sym}`, i),
          }))
          .slice(-50)
          .reverse()
          .map((p) => {
            const tokenAmount = Number(ethers.formatUnits(p.tokensWei, 18));
            const bnb = Number(ethers.formatEther(p.nativeWei));
            const bnbStr = Number.isFinite(bnb) ? `${bnb.toFixed(4)} BNB` : "—";
            const priceStr = formatPriceBnb(p.pricePerToken);
            return {
              time: formatAgo(p.timestamp),
              type: p.side,
              amount: formatCompact(tokenAmount),
              bnb: bnbStr,
              price: priceStr,
              mcap,
              trader: shorten(p.trader),
              tx: p.txHash,
            };
          });

        setTxs(next);
        return;
      }

      // Pre-LP: derive mock curve transactions from mock curve events
      const curve = getMockCurveEventsForSymbol(sym);
      if (!curve.length) {
        setTxs([]);
        return;
      }

      const lastTs = curve[curve.length - 1].timestamp;
      const shift = nowTs - lastTs;

      const perTradeBnb = 0.05;
      const perTradeWei = 50_000_000_000_000_000n; // 0.05 BNB

      const next: Transaction[] = [...curve]
        .map((e, i) => {
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
            pricePerToken: e.pricePerToken,
            trader,
            txHash,
          };
        })
        .slice(-50)
        .reverse()
        .map((p) => {
          const tokenAmount = Number(ethers.formatUnits(p.tokensWei, 18));
          const bnb = Number(ethers.formatEther(p.nativeWei));
          const bnbStr = Number.isFinite(bnb) ? `${bnb.toFixed(4)} BNB` : "—";
          const priceStr = formatPriceBnb(p.pricePerToken);
          return {
            time: formatAgo(p.timestamp),
            type: p.side,
            amount: formatCompact(tokenAmount),
            bnb: bnbStr,
            price: priceStr,
            mcap,
            trader: shorten(p.trader),
            tx: p.txHash,
          };
        });

      setTxs(next);
      return;
    }

    const next: Transaction[] = [...liveCurvePoints]
      .slice(-50)
      .reverse()
      .map((p) => {
        const tokenAmount = Number(ethers.formatUnits(p.tokensWei, 18));
        const bnb = Number(ethers.formatEther(p.nativeWei));

        const bnbStr = Number.isFinite(bnb) ? `${bnb.toFixed(4)} BNB` : "—";
        const priceStr = formatPriceBnb(p.pricePerToken);

        return {
          time: formatAgo(p.timestamp),
          type: p.side,
          amount: formatCompact(tokenAmount),
          bnb: bnbStr,
          price: priceStr,
          mcap: summary?.stats.marketCap ?? "—",
          trader: shorten(p.trader),
          tx: p.txHash,
        };
      });

    setTxs(next);
  }, [USE_MOCK_DATA, campaign, liveCurvePoints, summary, metrics]);

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

  const { url: chartUrl, baseUrl: dexBaseUrl, pairAddress: dexPairAddress, liquidityBnb: dexLiquidityBnb } =
    useDexScreenerChart(dexTokenAddress);
  const hasDexChart = !!chartUrl && !isCurveTestToken && isGraduated;
  const isDexStage = !isCurveTestToken && isGraduated;

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
  })();
  const stagePill = isDexStage ? "Graduated" : "Bonding";

const graduationTargetWei = metrics?.graduationTarget ?? null;

const {
  curvePct,
  curvePctLabel,
  curveReserveLabel,
  curveToGraduateLabel,
} = useMemo(() => {
  const reserveWei = curveReserveWei ?? null;

  const clamp = (x: number, a = 0, b = 100) => Math.min(b, Math.max(a, x));
  const toBnb = (wei: bigint) => Number(ethers.formatEther(wei));

  // Graduated: always show 100% + message
  if (isDexStage) {
    return {
      curvePct: 100,
      curvePctLabel: "100.0%",
      curveReserveLabel: "Coin has graduated!",
      curveToGraduateLabel: "",
    };
  }

  const reserveBnb = reserveWei ? toBnb(reserveWei) : 0;

  const reserveLabel = reserveWei
    ? `${reserveBnb.toFixed(3)} BNB in bonding curve`
    : "— in bonding curve";

  // If no target, still show the bar at 0% but keep labels sensible
  if (!metrics?.graduationTarget || metrics.graduationTarget <= 0n) {
    return {
      curvePct: 0,
      curvePctLabel: "0.0%",
      curveReserveLabel: reserveLabel,
      curveToGraduateLabel: "— to graduate",
    };
  }

  const targetBnb = toBnb(metrics.graduationTarget);
  const pctRaw = targetBnb > 0 ? (reserveBnb / targetBnb) * 100 : 0;
  const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 0;

  const remainingBnb = Math.max(targetBnb - reserveBnb, 0);
  const remainingUsd = bnbUsd != null ? remainingBnb * bnbUsd : null;

  const toGraduateLabel =
    remainingUsd == null
      ? "— to graduate"
      : `$${Math.round(remainingUsd).toLocaleString()} to graduate`;

  return {
    curvePct: pct,
    curvePctLabel: `${pct.toFixed(1)}%`,
    curveReserveLabel: reserveLabel,
    curveToGraduateLabel: toGraduateLabel,
  };
}, [curveReserveWei, metrics?.graduationTarget, bnbUsd, isDexStage]);


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

        const amountWei = parseTokenAmountWei(tradeAmount);
        if (amountWei <= 0n) {
          setQuoteWei(null);
          return;
        }

        setQuoteLoading(true);

        if (USE_MOCK_DATA) {
          const priceWei = metrics?.currentPrice ?? 0n;
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
        const q: bigint = tradeTab === "buy"
          ? await c.quoteBuyExactTokens(amountWei)
          : await c.quoteSellExactTokens(amountWei);

        if (!cancelled) setQuoteWei(q);
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
  }, [wallet.provider, campaign?.campaign, metrics?.currentPrice, tradeTab, tradeAmount, isDexStage]);

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

    const amountWei = parseTokenAmountWei(tradeAmount);
    if (amountWei <= 0n) {
      toast({
        title: "Invalid amount",
        description: `Enter a ${tokenData.ticker} amount greater than 0.`,
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

      if (!isDexStage && tradeTab === "buy" && bnbBalanceWei != null && quoteWei != null) {
        const maxCostWei = (quoteWei * BigInt(100 + SLIPPAGE_PCT)) / 100n;
        if (maxCostWei > bnbBalanceWei) {
          toast({
            title: "Insufficient BNB",
            description: `You need ~${formatBnbFromWei(maxCostWei)} to place this buy.`,
            variant: "destructive",
          });
          return;
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
        let costWei = quoteWei;
        if (costWei == null) {
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
        let payoutWei = quoteWei;
        if (payoutWei == null) {
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
      console.error('[TokenDetails] Trade failed', e);
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
          <h2 className="text-sm md:text-base font-semibold mb-2">
            {error}
          </h2>
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
    <div className="h-full w-full overflow-hidden flex flex-col px-3 md:px-6 pt-3 md:pt-6 gap-3 md:gap-4">
      {/* Main Content - Single Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4 flex-1 min-h-0">
        {/* Left Column - Header, Chart & Transactions (3/4 width) */}
        <div className="lg:col-span-3 flex flex-col gap-3 md:gap-4 min-h-0">
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
                  </div>
                </div>
              </div>

              {/* Vertical Separator - Desktop only */}
              <div className="hidden md:block h-14 w-px bg-border/50 flex-shrink-0" />

              {/* Market Cap */}
              <div className="flex items-center justify-between md:flex-col md:gap-1.5 md:flex-1 md:min-w-0">
                <p className="text-xs text-muted-foreground">Market cap</p>
                <div className="flex items-center gap-2 md:gap-3">
                  <h2 className="text-lg md:text-2xl font-retro text-foreground">
                    {tokenData.marketCap}
                  </h2>
                </div>
              </div>

              {/* Mobile: Expandable Metrics Section */}
              {isMobile && (
                <div className="w-full">
                  <button
                    onClick={() => setMetricsExpanded(!metricsExpanded)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg"
                  >
                    <span className="text-xs text-muted-foreground">
                      More metrics
                    </span>
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
                        {Object.entries(tokenData.metrics).map(
                          ([key, data]) => (
                            <div
                              key={key}
                              onClick={() =>
                                setSelectedTimeframe(
                                  key as "5m" | "1h" | "4h" | "24h"
                                )
                              }
                              className={`cursor-pointer transition-all text-xs p-2 rounded-md ${
                                selectedTimeframe === key
                                  ? "bg-accent/20"
                                  : "hover:bg-muted/50"
                              }`}
                            >
                              <span className="text-muted-foreground">
                                {key}
                              </span>
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
                                    {ch == null
                                      ? "—"
                                      : `${ch > 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%`}
                                  </span>
                                );
                              })()}
                            </div>
                          )
                        )}
                      </div>

                      {/* Additional metrics */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
                        <div className="text-xs">
                          <span className="text-muted-foreground block">
                            Price
                          </span>
                          <span className="font-mono text-foreground">
                            {tokenData.price}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">
                            {liquidityLabel}
                          </span>
                          <span className="font-mono text-foreground">
                            {liquidityValue}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">
                            Volume
                          </span>
                          <span className="font-mono text-foreground">
                            {tokenData.metrics[selectedTimeframe].volume}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">
                            Holders
                          </span>
                          <span className="font-mono text-foreground">
                            {tokenData.holders}
                          </span>
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
                      onClick={() =>
                        setSelectedTimeframe(
                          key as "5m" | "1h" | "4h" | "24h"
                        )
                      }
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
                            {ch == null
                              ? "—"
                              : `${ch > 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%`}
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
                    <span className="ml-2 font-mono text-foreground">
                      {tokenData.price}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">{liquidityLabel}</span>
                    <span className="ml-2 font-mono text-foreground">
                      {liquidityValue}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="ml-2 font-mono text-foreground">
                      {tokenData.metrics[selectedTimeframe].volume}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Holders</span>
                    <span className="ml-2 font-mono text-foreground">
                      {tokenData.holders}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Chart */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-0 overflow-hidden flex flex-col min-h-[320px]"
            style={{ flex: isMobile ? "3" : "2" }}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-card/20">
              <div className="flex items-center gap-2 min-w-0">
                <span
  className={[
    "inline-flex items-center justify-center",
    "h-7 px-3 rounded-full text-[11px] font-semibold",
    "border shadow-sm select-none",
    "tracking-wide",
    isDexStage
      ? "bg-green-500/15 text-green-400 border-green-500/30 shadow-green-500/10 backdrop-blur-md ring-1 ring-white/5"
      : "bg-yellow-500/15 text-yellow-300 border-yellow-500/30 shadow-yellow-500/10",
  ].join(" ")}
>
  {stagePill}
</span>
              </div>

              <div className="flex items-center gap-3">
                <AthBar
                  currentLabel={tokenData.marketCap}
                  storageKey={`ath:${campaign?.campaign ?? campaignAddress ?? "unknown"}`}
                  className="hidden sm:block"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <TokenCandlestickChart
                stage={isDexStage ? "dex" : "curve"}
                symbol={campaign?.symbol}
                campaignAddress={campaign?.campaign}
                tokenAddress={campaign?.token}
                dexPairAddress={dexPairAddress}
              />
            </div>
          </Card>

          {/* Transactions Table */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4 flex flex-col min-h-0"
            style={{ flex: "1" }}
          >
            <div className="overflow-auto flex-1">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-card/95 backdrop-blur">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-1.5 text-muted-foreground font-normal">
                      Time
                    </th>
                    <th className="text-left py-1.5 text-muted-foreground font-normal">
                      Type
                    </th>
                    <th className="text-left py-1.5 text-muted-foreground font-normal">
                      {tokenData.ticker}
                    </th>
                    <th className="text-left py-1.5 text-muted-foreground font-normal">
                      BNB
                    </th>
                    <th className="text-left py-1.5 text-muted-foreground font-normal">
                      Price
                    </th>
                    <th className="hidden lg:table-cell text-left py-1.5 text-muted-foreground font-normal">
                      MCap
                    </th>
                    <th className="hidden md:table-cell text-left py-1.5 text-muted-foreground font-normal">
                      Trader
                    </th>
                    <th className="text-left py-1.5 text-muted-foreground font-normal">
                      TX
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {txs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-6 text-center text-muted-foreground"
                      >
                        No trades yet.
                      </td>
                    </tr>
                  ) : (
                    txs.map((tx, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-muted/20"
                    >
                      <td className="py-1.5 text-muted-foreground">{tx.time}</td>
                      <td
                        className={`py-1.5 ${
                          tx.type === "buy"
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {tx.type.toUpperCase()}
                      </td>
                      <td className="py-1.5 font-mono">{tx.amount}</td>
                      <td className="py-1.5 font-mono">{tx.bnb}</td>
                      <td className="py-1.5 font-mono">{tx.price}</td>
                      <td className="hidden lg:table-cell py-1.5 font-mono">{tx.mcap}</td>
                      <td className="hidden md:table-cell py-1.5 font-mono">{tx.trader}</td>
                      <td className="py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => {
                            if (!tx.tx) return;
                            const base = wallet.chainId === 97
                              ? "https://testnet.bscscan.com/tx/"
                              : "https://bscscan.com/tx/";
                            window.open(`${base}${tx.tx}`, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column - Trading Panel & Stats (1/3 width) */}
        <div className="lg:col-span-1 flex flex-col gap-4 min-h-0">
          {/* Trading Panel - 2/5 height */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4"
            style={{ flex: "2" }}
          >
            <Tabs value={tradeTab} onValueChange={handleTradeTabChange}>
              <TabsList className="grid w-full grid-cols-2 mb-3">
                <TabsTrigger value="buy" className="text-sm">
                  Buy
                </TabsTrigger>
                <TabsTrigger value="sell" className="text-sm">
                  Sell
                </TabsTrigger>
              </TabsList>
              <TabsContent value="buy" className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">
                      Amount ({tokenData.ticker})
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Slippage: {SLIPPAGE_PCT}%
                    </span>
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
                      <span className="text-xs font-mono text-muted-foreground">
                        {tokenData.ticker}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      Wallet: {formatBnbFromWei(bnbBalanceWei)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Cost: {quoteLoading ? "…" : quoteWei != null ? formatBnbFromWei(quoteWei) : "—"}
                    </span>
                  </div>
                  {quoteError ? (
                    <p className="mt-2 text-center text-xs text-destructive">
                      {quoteError}
                    </p>
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
                  disabled={tradePending || approvePending || (!isDexStage && parseTokenAmountWei(tradeAmount) <= 0n)}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-retro py-5"
                >
                  {tradePending ? "Processing..." : isDexStage ? "Trade on DEX" : "Place Trade"}
                </Button>
              </TabsContent>
              <TabsContent value="sell" className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">
                      Amount ({tokenData.ticker})
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Slippage: {SLIPPAGE_PCT}%
                    </span>
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
                      <span className="text-xs font-mono text-muted-foreground">
                        {tokenData.ticker}
                      </span>
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
                      Payout: {quoteLoading ? "…" : quoteWei != null ? formatBnbFromWei(quoteWei) : "—"}
                    </span>
                  </div>

                  {approvePending ? (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      Approval in progress...
                    </p>
                  ) : null}
                  {quoteError ? (
                    <p className="mt-2 text-center text-xs text-destructive">
                      {quoteError}
                    </p>
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
                  disabled={tradePending || approvePending || (!isDexStage && parseTokenAmountWei(tradeAmount) <= 0n)}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-retro py-5"
                >
                  {tradePending ? "Processing..." : isDexStage ? "Trade on DEX" : "Place Trade"}
                </Button>
              </TabsContent>
            </Tabs>
          </Card>
          {/* Bonding Curve Progress */}
<Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
  <div className="flex items-center justify-between mb-3">
    <span className="text-sm font-retro text-foreground">
      Bonding Curve Progress
    </span>
    <span className="text-sm font-mono text-foreground">{curvePctLabel}</span>
  </div>

  <div className="relative h-[10px] w-full rounded-full bg-muted/40 overflow-hidden border border-border/40">
    <div
  className="absolute inset-y-0 left-0 rounded-full"
  style={{
    width: `${isDexStage ? 100 : curvePct}%`,
    backgroundColor: "hsl(var(--success))",
boxShadow: "0 0 12px hsl(var(--success) / 0.35)",
    transition: "width 350ms ease",
    // optional: makes tiny % still visible on bonding coins
    minWidth: curvePct > 0 ? "2px" : undefined,
  }}
/>
  </div>

  <div className="mt-3 flex items-center justify-between text-xs">
    <span className="text-muted-foreground font-mono">{curveReserveLabel}</span>
    <span className="text-muted-foreground font-mono">{curveToGraduateLabel}</span>
  </div>
</Card>
          {/* User Statistics - 2/5 height */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4"
            style={{ flex: "2" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-retro text-foreground">
                Flywheel statistics
              </h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </Button>
                <span className="text-xs text-muted-foreground">Share</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-4 bg-accent rounded-full" />
                <span className="text-muted-foreground">Invested</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Invested
                  </p>
                  <p className="text-xl font-retro text-foreground">$0</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Tokens burned
                  </p>
                  <p className="text-xl font-retro text-foreground flex items-center gap-1">
                    0.000%
                    <span className="text-xs text-muted-foreground">
                      ${tokenData.ticker}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Holder Distribution - 1/5 height */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4 flex flex-col min-h-0"
            style={{ flex: "1" }}
          >
            <h3 className="text-sm font-retro text-foreground mb-3 flex-shrink-0">
              Holder Distribution
            </h3>
            <div className="space-y-2 overflow-auto flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono">1. 42me...</span>
                <span className="font-mono text-muted-foreground">
                  100.000%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono">2. Bzdb... 🔥 (DEV)</span>
                <span className="font-mono text-muted-foreground">
                  0.000%
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TokenDetails;