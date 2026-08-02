import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAblyTokenChannel } from "@/hooks/useAblyTokenChannel";
import {
  fetchMarketCandles,
  fetchMarketState,
  fetchMarketSummary,
  fetchMarketTrades,
  type MarketCandle,
  type MarketState,
  type MarketSummary,
  type MarketTrade,
} from "@/lib/marketContinuityApi";

export type MarketResolution = "5s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

// Chart composition is always available from bonding curve points.
// Remote Topaz candles/trades only load when the market API flag is on (avoids 503 spam).
const ENABLE_MARKET_API =
  String(import.meta.env.VITE_ENABLE_UNIFIED_MARKET_CHART || "").trim() === "1" ||
  String(import.meta.env.VITE_ENABLE_TOPAZ_MARKET_API || "").trim() === "1";

function tradeKey(trade: Pick<MarketTrade, "txHash" | "logIndex">) {
  return `${String(trade.txHash || "").toLowerCase()}:${Number(trade.logIndex ?? 0)}`;
}

function mergeTrades(current: MarketTrade[], incoming: MarketTrade[]) {
  const map = new Map<string, MarketTrade>();
  for (const trade of current) map.set(tradeKey(trade), trade);
  for (const trade of incoming) map.set(tradeKey(trade), trade);
  return Array.from(map.values())
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
    .slice(-500);
}

function candleKey(candle: MarketCandle) {
  return new Date(candle.bucket_start).getTime();
}

function mergeCandles(current: MarketCandle[], incoming: MarketCandle[]) {
  const map = new Map<number, MarketCandle>();
  for (const candle of current) map.set(candleKey(candle), candle);
  for (const candle of incoming) map.set(candleKey(candle), candle);
  return Array.from(map.values()).sort((a, b) => candleKey(a) - candleKey(b));
}

function realtimeTrade(data: any): MarketTrade | null {
  const txHash = String(data?.txHash || "").toLowerCase();
  const blockNumber = Number(data?.blockNumber || 0);
  if (!/^0x[a-f0-9]{64}$/i.test(txHash) || !Number.isInteger(blockNumber) || blockNumber <= 0) return null;
  return {
    chainId: Number(data.chainId || 0),
    campaignAddress: String(data.campaignAddress || "").toLowerCase(),
    tokenAddress: String(data.tokenAddress || "").toLowerCase(),
    pairAddress: data.pairAddress ? String(data.pairAddress).toLowerCase() : null,
    marketStage: String(data.marketStage || "TOPAZ"),
    source: String(data.source || "topaz") === "bonding" ? "bonding" : "topaz",
    side: String(data.side || "buy") === "sell" ? "sell" : "buy",
    wallet: String(data.wallet || "").toLowerCase(),
    recipient: data.recipient ? String(data.recipient).toLowerCase() : null,
    tokenAmountRaw: String(data.tokenAmountRaw || "0"),
    nativeAmountRaw: String(data.nativeAmountRaw || "0"),
    priceBnb: data.priceBnb == null ? null : String(data.priceBnb),
    txHash,
    logIndex: Number(data.logIndex || 0),
    blockNumber,
    blockTime: String(data.blockTime || new Date().toISOString()),
    status: String(data.status || "confirmed"),
  };
}

export function useUnifiedMarket(input: {
  campaignAddress?: string;
  chainId: number;
  resolution?: MarketResolution;
  enabled?: boolean;
}) {
  const campaignAddress = String(input.campaignAddress || "").trim().toLowerCase();
  const resolution = input.resolution ?? "1m";
  // Chart is always "enabled" for a valid campaign so TokenDetails can render continuous history from curve points.
  const enabled = (input.enabled ?? true) && /^0x[a-f0-9]{40}$/.test(campaignAddress);
  const apiEnabled = enabled && ENABLE_MARKET_API;

  const [state, setState] = useState<MarketState | null>(null);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [trades, setTrades] = useState<MarketTrade[]>([]);
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [graduationMarker, setGraduationMarker] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStageRef = useRef<string | null>(null);
  const [stageTransition, setStageTransition] = useState<{ from: string | null; to: string; at: number } | null>(null);

  const realtime = useAblyTokenChannel({
    enabled: apiEnabled,
    chainId: input.chainId,
    campaignAddress,
  });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!apiEnabled) {
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    try {
      // Soft-timeout each market endpoint so a hung Railway indexer cannot freeze quotes/UI.
      const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(fallback), ms);
        });
        return Promise.race([promise, timeout]).finally(() => {
          if (timer) clearTimeout(timer);
        });
      };

      const emptyTrades = { items: [] as MarketTrade[], nextCursor: null as string | null };
      const emptyCandles = {
        items: [] as MarketCandle[],
        graduationMarker: null,
        marketStage: "BONDING" as const,
      };

      const [nextState, nextSummary, nextTrades, nextCandles] = await Promise.all([
        withTimeout(
          fetchMarketState(campaignAddress, input.chainId, signal).catch(() => null),
          4_000,
          null,
        ),
        withTimeout(
          fetchMarketSummary(campaignAddress, input.chainId, signal).catch(() => null),
          4_000,
          null,
        ),
        withTimeout(
          fetchMarketTrades(campaignAddress, input.chainId, { limit: 500, signal }).catch(() => emptyTrades),
          4_000,
          emptyTrades,
        ),
        withTimeout(
          fetchMarketCandles(campaignAddress, input.chainId, resolution, { limit: 5000, signal }).catch(
            () => emptyCandles,
          ),
          4_000,
          emptyCandles,
        ),
      ]);
      if (requestId !== requestRef.current || signal?.aborted) return;
      if (!nextState && !nextSummary) {
        setError("Market API is slow or unavailable; showing on-chain fallback only.");
        setLoading(false);
        return;
      }

      const previousStage = previousStageRef.current;
      const stage = nextState?.marketStage || nextSummary?.marketStage || previousStage;
      if (previousStage && stage && previousStage !== stage) {
        setStageTransition({ from: previousStage, to: stage, at: Date.now() });
      }
      if (stage) previousStageRef.current = stage;
      if (nextState) setState(nextState);
      if (nextSummary) setSummary(nextSummary);
      setTrades((current) => mergeTrades(current, nextTrades?.items || []));
      setCandles((current) => mergeCandles(current, nextCandles?.items || []));
      setGraduationMarker(nextCandles?.graduationMarker || null);
      setError(null);
    } catch (caught: any) {
      if (caught?.name === "AbortError" || signal?.aborted) return;
      if (requestId !== requestRef.current) return;
      // Soft-fail: chart still works from bonding curve points.
      setError(null);
    } finally {
      if (requestId === requestRef.current && !signal?.aborted) setLoading(false);
    }
  }, [apiEnabled, campaignAddress, input.chainId, resolution]);

  const scheduleRefresh = useCallback((delay = 120) => {
    if (!apiEnabled) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh();
    }, delay);
  }, [apiEnabled, refresh]);

  useEffect(() => {
    if (!apiEnabled) {
      setState(null);
      setSummary(null);
      setTrades([]);
      setCandles([]);
      setGraduationMarker(null);
      setLoading(false);
      setError(null);
      previousStageRef.current = null;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void refresh(controller.signal);
    return () => controller.abort();
  }, [apiEnabled, refresh]);

  useEffect(() => {
    const channel = realtime.channel;
    if (!apiEnabled || !channel) return;

    const onStage = (message: any) => {
      const data = message?.data || {};
      const nextStage = String(data.marketStage || data.to || "");
      if (nextStage) {
        const previousStage = previousStageRef.current;
        if (previousStage !== nextStage) {
          setStageTransition({ from: previousStage, to: nextStage, at: Date.now() });
          previousStageRef.current = nextStage;
        }
        setState((current) => current ? { ...current, marketStage: nextStage as any } : current);
      }
      scheduleRefresh(50);
    };
    const onTrade = (message: any) => {
      const trade = realtimeTrade(message?.data);
      if (trade) setTrades((current) => mergeTrades(current, [trade]));
      scheduleRefresh(180);
    };
    const onCandle = () => scheduleRefresh(80);
    const onStats = (message: any) => {
      const patch = message?.data || {};
      setSummary((current) => current ? { ...current, ...patch } : current);
    };
    const onHealth = () => scheduleRefresh(100);

    channel.subscribe("market_stage_changed", onStage);
    channel.subscribe("market_trade", onTrade);
    channel.subscribe("market_candle_upsert", onCandle);
    channel.subscribe("market_stats_patch", onStats);
    channel.subscribe("market_health_changed", onHealth);

    const onConnected = () => scheduleRefresh(0);
    realtime.client?.connection?.on?.("connected", onConnected);

    return () => {
      try { channel.unsubscribe("market_stage_changed", onStage); } catch { /* noop */ }
      try { channel.unsubscribe("market_trade", onTrade); } catch { /* noop */ }
      try { channel.unsubscribe("market_candle_upsert", onCandle); } catch { /* noop */ }
      try { channel.unsubscribe("market_stats_patch", onStats); } catch { /* noop */ }
      try { channel.unsubscribe("market_health_changed", onHealth); } catch { /* noop */ }
      try { realtime.client?.connection?.off?.("connected", onConnected); } catch { /* noop */ }
    };
  }, [apiEnabled, realtime.channel, realtime.client, scheduleRefresh]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  const topazActive = state?.marketStage === "TOPAZ_ACTIVE";
  const degraded = state?.marketStage === "TOPAZ_DEGRADED" || Boolean(error);
  const dataLagSeconds = state?.indexingStatus?.dataLagSeconds ?? summary?.dataLagSeconds ?? null;

  return useMemo(() => ({
    enabled,
    state,
    summary,
    trades,
    candles,
    graduationMarker,
    stageTransition,
    topazActive,
    degraded,
    dataLagSeconds,
    loading,
    error,
    refresh,
  }), [
    enabled,
    state,
    summary,
    trades,
    candles,
    graduationMarker,
    stageTransition,
    topazActive,
    degraded,
    dataLagSeconds,
    loading,
    error,
    refresh,
  ]);
}
