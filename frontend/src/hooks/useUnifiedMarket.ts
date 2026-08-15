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
import { campaignKey, isCampaignAddress, isTradeTxId } from "@/lib/chart/normalizeTrade";
import { isMarketContinuityApiEnabled } from "@/lib/marketContinuityFlags";
import { normalizeTradeTxHash } from "@/lib/tradeDedupe";

export type MarketResolution = "5s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

// Chart composition is always available from bonding curve points + browser Topaz scans.
// Remote Topaz candles/trades only load when market continuity API is enabled.
const ENABLE_MARKET_API = isMarketContinuityApiEnabled();

function tradeKey(trade: Pick<MarketTrade, "txHash" | "logIndex">) {
  const tx = normalizeTradeTxHash(trade.txHash) || String(trade.txHash || "").trim();
  const logIndex = Number(trade.logIndex ?? 0);
  // Preserve real log indices (bonding multi-log txs); collapse missing/0 synthetics.
  if (!Number.isFinite(logIndex) || logIndex <= 0 || logIndex >= 1_000_000) {
    return `${tx}:synthetic`;
  }
  return `${tx}:${logIndex}`;
}

function mergeTrades(current: MarketTrade[], incoming: MarketTrade[], chainId: number) {
  const map = new Map<string, MarketTrade>();
  const realTx = new Set<string>();
  const prefer = (a: MarketTrade, b: MarketTrade) => {
    const aReal = Number(a.logIndex) > 0 && Number(a.logIndex) < 1_000_000;
    const bReal = Number(b.logIndex) > 0 && Number(b.logIndex) < 1_000_000;
    if (aReal !== bReal) return bReal ? b : a;
    return Number(b.logIndex || 0) >= Number(a.logIndex || 0) ? b : a;
  };
  for (const trade of [...current, ...incoming]) {
    const tx = normalizeTradeTxHash(trade.txHash);
    if (!tx || !isTradeTxId(chainId, tx)) continue;
    const logIndex = Number(trade.logIndex ?? 0);
    if (Number.isFinite(logIndex) && logIndex > 0 && logIndex < 1_000_000) realTx.add(tx);
    const key = tradeKey(trade);
    const prev = map.get(key);
    map.set(key, prev ? prefer(prev, trade) : trade);
  }
  return Array.from(map.values())
    .filter((trade) => {
      const tx = normalizeTradeTxHash(trade.txHash);
      const logIndex = Number(trade.logIndex ?? 0);
      const synthetic = !Number.isFinite(logIndex) || logIndex <= 0 || logIndex >= 1_000_000;
      return !(synthetic && tx && realTx.has(tx));
    })
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

function realtimeTrade(data: any, chainId: number): MarketTrade | null {
  const txHash = normalizeTradeTxHash(data?.txHash || data?.tx_hash);
  const blockNumber = Number(data?.blockNumber || data?.block_number || 0);
  if (!txHash || !isTradeTxId(chainId, txHash) || !Number.isInteger(blockNumber) || blockNumber <= 0) return null;
  return {
    chainId: Number(data.chainId || chainId || 0),
    campaignAddress: campaignKey(chainId, data.campaignAddress || data.campaign_address || ""),
    tokenAddress: campaignKey(chainId, data.tokenAddress || data.token_address || ""),
    pairAddress: data.pairAddress || data.pair_address
      ? campaignKey(chainId, data.pairAddress || data.pair_address)
      : null,
    marketStage: String(data.marketStage || "TOPAZ"),
    source: String(data.source || "topaz") === "bonding" ? "bonding" : "topaz",
    side: String(data.side || "buy") === "sell" ? "sell" : "buy",
    wallet: campaignKey(chainId, data.wallet || ""),
    recipient: data.recipient ? campaignKey(chainId, data.recipient) : null,
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
  const campaignAddress = campaignKey(input.chainId, input.campaignAddress || "");
  const resolution = input.resolution ?? "1m";
  // Chart is always "enabled" for a valid campaign so TokenDetails can render continuous history from curve points.
  const enabled = (input.enabled ?? true) && isCampaignAddress(input.chainId, campaignAddress);
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

      // Missing market-state row is normal for pre-handoff / older campaigns.
      // Do not surface as an outage — chart still uses bonding + Topaz browser scan.
      if (!nextState && !nextSummary) {
        setState((prev) =>
          prev || {
            chainId: input.chainId,
            campaignAddress,
            tokenAddress: campaignAddress,
            factoryAddress: null,
            campaignGeneration: null,
            marketStage: "BONDING",
            graduation: null,
            pairAddress: null,
            routerAddress: null,
            dexFactoryAddress: null,
            wrappedNativeAddress: null,
            stable: null,
            feeBps: null,
            poolVerified: false,
            supportEnabled: true,
            bondingActive: true,
            tradingEnabled: true,
            indexingStatus: {
              enabled: true,
              poolEnabled: false,
              lastIndexedBlock: null,
              lastFinalizedBlock: null,
              lastSwapAt: null,
              lastSyncAt: null,
              dataLagSeconds: null,
            },
            reserves: { tokenRaw: null, nativeRaw: null },
            lastVerifiedAt: null,
            lastError: null,
          },
        );
        setError(null);
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
      setTrades((current) => mergeTrades(current, nextTrades?.items || [], input.chainId));
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
      const trade = realtimeTrade(message?.data, input.chainId);
      if (trade) setTrades((current) => mergeTrades(current, [trade], input.chainId));
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
