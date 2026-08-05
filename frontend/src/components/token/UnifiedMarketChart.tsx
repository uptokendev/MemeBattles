import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { ethers } from "ethers";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import type { CurveTradePoint } from "@/hooks/useCurveTrades";
import type { MarketCandle, MarketState } from "@/lib/marketContinuityApi";
import { buildCandles, type CurveTradePoint as ChartPoint } from "@/lib/chart/buildCandles";

export type UnifiedChartResolution = "5s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
export type UnifiedChartMetric = "marketcap" | "price";
export type UnifiedChartDenomination = "USD" | "BNB";

const TIMEFRAMES: Array<{ key: UnifiedChartResolution; seconds: number }> = [
  { key: "5s", seconds: 5 },
  { key: "1m", seconds: 60 },
  { key: "5m", seconds: 300 },
  { key: "15m", seconds: 900 },
  { key: "30m", seconds: 1800 },
  { key: "1h", seconds: 3600 },
  { key: "4h", seconds: 14400 },
  { key: "1d", seconds: 86400 },
];

export type UnifiedMarketChartProps = {
  curvePoints: CurveTradePoint[];
  marketCandles: MarketCandle[];
  marketState: MarketState | null;
  graduationMarker?: {
    time: string;
    txHash?: string | null;
    finalCurvePriceBnb?: string | null;
    initialDexPriceBnb?: string | null;
    pairAddress?: string | null;
  } | null;
  /** Campaign creator wallet — buys/sells from this address get circle markers. */
  creatorAddress?: string | null;
  resolution: UnifiedChartResolution;
  onResolutionChange: (resolution: UnifiedChartResolution) => void;
  denomination?: UnifiedChartDenomination;
  loading?: boolean;
  error?: string | null;
};

type CandleRow = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
};

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function tokensFromWei(value: bigint | null | undefined): number {
  try {
    const parsed = Number(ethers.formatUnits(value ?? 0n, 18));
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function postBurnSupply(state: MarketState | null): number {
  try {
    const raw = state?.graduation?.postBurnTotalSupplyRaw;
    if (!raw || !/^\d+$/.test(raw)) return 0;
    const parsed = Number(ethers.formatUnits(raw, 18));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function isGraduatedStage(state: MarketState | null): boolean {
  const stage = String(state?.marketStage || "").toUpperCase();
  return (
    stage === "TOPAZ_ACTIVE" ||
    stage === "TOPAZ_DEGRADED" ||
    stage === "TOPAZ_PENDING" ||
    stage === "GRADUATING"
  );
}

function sameAddr(a?: string | null, b?: string | null): boolean {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  return Boolean(x && y && x === y && /^0x[a-f0-9]{40}$/.test(x));
}

/**
 * Single continuous series for bonding + Topaz:
 * - Price mode: each trade's price (launchpad-style OHLC).
 * - Mcap mode: price × supply, where supply is curve circulating before graduation
 *   and fixed post-burn (or peak circulating) after — not "sum of DEX trade sizes".
 */
function tradeSeriesPoints(
  trades: CurveTradePoint[],
  metric: UnifiedChartMetric,
  denomination: UnifiedChartDenomination,
  bnbUsd: number,
  marketState: MarketState | null,
  graduationTimeSec: number,
): ChartPoint[] {
  const sorted = [...(trades || [])].sort(
    (a, b) =>
      (a.timestamp ?? 0) - (b.timestamp ?? 0) ||
      (a.blockNumber ?? 0) - (b.blockNumber ?? 0) ||
      Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0),
  );

  const fixedGradSupply = postBurnSupply(marketState);
  const marketAlreadyGraduated = isGraduatedStage(marketState);
  let circulating = 0;
  let peakCirc = 0;
  const points: ChartPoint[] = [];

  for (const trade of sorted) {
    const priceBnb = finite(trade.pricePerToken);
    const timestampSec = Number(trade.timestamp || 0);
    if (!priceBnb || !Number.isFinite(timestampSec) || timestampSec <= 0) continue;

    const tokenAmount = tokensFromWei(trade.tokensWei);
    const afterGrad =
      (graduationTimeSec > 0 && timestampSec >= graduationTimeSec) ||
      (marketAlreadyGraduated && graduationTimeSec <= 0 && fixedGradSupply > 0);

    // Curve-phase circulating walk (bonding buys mint sold supply).
    // After graduation we stop walking for mcap and use fixed supply.
    if (!afterGrad || fixedGradSupply <= 0) {
      circulating += trade.type === "sell" ? -tokenAmount : tokenAmount;
      circulating = Math.max(0, circulating);
      peakCirc = Math.max(peakCirc, circulating);
    }

    const supplyForMcap =
      afterGrad && fixedGradSupply > 0
        ? fixedGradSupply
        : afterGrad && peakCirc > 0
          ? peakCirc
          : Math.max(circulating, 0);

    const valueBnb = metric === "marketcap" ? priceBnb * Math.max(supplyForMcap, 1e-18) : priceBnb;
    const value = denomination === "USD" ? valueBnb * bnbUsd : valueBnb;
    if (!Number.isFinite(value) || value <= 0) continue;

    const volumeBnb = tokensFromWei(trade.nativeWei);
    points.push({
      ts: timestampSec * 1000,
      value,
      volume: Number.isFinite(volumeBnb) ? volumeBnb : 0,
      side: trade.type === "sell" ? "sell" : "buy",
      wallet: String(trade.from || "").toLowerCase(),
    });
  }
  return points;
}

/** Server Topaz candles — price or mcap with fixed post-burn supply. */
function topazCandles(
  rows: MarketCandle[],
  state: MarketState | null,
  metric: UnifiedChartMetric,
  denomination: UnifiedChartDenomination,
  bnbUsd: number,
): CandleRow[] {
  const supply = postBurnSupply(state);
  const denomMul = denomination === "USD" ? bnbUsd : 1;
  const mcapMul = metric === "marketcap" ? (supply > 0 ? supply : 1) : 1;

  return (rows || [])
    .filter((row) => (Number(row.source_mask || 0) & 2) === 2 || Number(row.dex_trade_count || 0) > 0)
    .map((row) => {
      const timestamp = Math.floor(new Date(row.bucket_start).getTime() / 1000);
      const mapValue = (value: unknown) => Number(value) * mcapMul * denomMul;
      return {
        time: timestamp as Time,
        open: mapValue(row.o),
        high: mapValue(row.h),
        low: mapValue(row.l),
        close: mapValue(row.c),
      };
    })
    .filter(
      (row) =>
        Number.isFinite(row.open) &&
        row.open > 0 &&
        Number.isFinite(row.high) &&
        row.high > 0 &&
        Number.isFinite(row.low) &&
        row.low > 0 &&
        Number.isFinite(row.close) &&
        row.close > 0,
    );
}

/** Merge OHLC for the same bucket instead of last-write-wins (preserves buy+sell wicks). */
function mergeCandleRows(primary: CandleRow[], secondary: CandleRow[]): CandleRow[] {
  const map = new Map<number, CandleRow>();
  const upsert = (candle: CandleRow) => {
    const key = Number(candle.time);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...candle });
      return;
    }
    map.set(key, {
      time: candle.time,
      open: prev.open,
      high: Math.max(prev.high, candle.high),
      low: Math.min(prev.low, candle.low),
      close: candle.close,
    });
  };
  // Primary first (client continuous series), then server Topaz enriches wicks/close.
  for (const c of primary) upsert(c);
  for (const c of secondary) upsert(c);
  return Array.from(map.values()).sort((a, b) => Number(a.time) - Number(b.time));
}

function formatValue(value: number, metric: UnifiedChartMetric, denomination: UnifiedChartDenomination) {
  if (!Number.isFinite(value)) return "";
  const prefix = denomination === "USD" ? "$" : "";
  const suffix = denomination === "BNB" ? " BNB" : "";
  const abs = Math.abs(value);
  const digits = metric === "price" && abs < 1 ? 8 : 2;
  if (abs >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(2)}B${suffix}`;
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(2)}M${suffix}`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(2)}K${suffix}`;
  return `${prefix}${value.toFixed(digits)}${suffix}`;
}

function nearestCandleTime(data: CandleRow[], targetSec: number): Time | null {
  if (!data.length) return null;
  let best = data[0];
  let bestDist = Math.abs(Number(best.time) - targetSec);
  for (const row of data) {
    const d = Math.abs(Number(row.time) - targetSec);
    if (d < bestDist) {
      best = row;
      bestDist = d;
    }
  }
  // Only attach if within ~2 buckets of something real (avoid floating markers).
  return bestDist <= 120 ? best.time : best.time;
}

export function UnifiedMarketChart({
  curvePoints,
  marketCandles,
  marketState,
  graduationMarker,
  creatorAddress,
  resolution,
  onResolutionChange,
  denomination = "USD",
  loading,
  error,
}: UnifiedMarketChartProps) {
  const [metric, setMetric] = useState<UnifiedChartMetric>("marketcap");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markerPluginRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);
  const resizeRef = useRef<ResizeObserver | null>(null);
  const previousDataRef = useRef<CandleRow[]>([]);
  const initialRangeSetRef = useRef(false);
  const lastUsdRef = useRef(0);
  const { price: liveBnbUsd } = useBnbUsdPrice(true);

  useEffect(() => {
    if (liveBnbUsd && Number.isFinite(liveBnbUsd) && liveBnbUsd > 0) lastUsdRef.current = liveBnbUsd;
  }, [liveBnbUsd]);
  const bnbUsd = liveBnbUsd && liveBnbUsd > 0 ? liveBnbUsd : lastUsdRef.current;
  const intervalSeconds = TIMEFRAMES.find((item) => item.key === resolution)?.seconds ?? 60;

  const graduationTimeSec = useMemo(() => {
    if (!graduationMarker?.time) return 0;
    const ms = new Date(graduationMarker.time).getTime();
    return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  }, [graduationMarker?.time]);

  const seriesPoints = useMemo(() => {
    if (!bnbUsd && denomination === "USD") return [] as ChartPoint[];
    return tradeSeriesPoints(
      curvePoints,
      metric,
      denomination,
      bnbUsd || 1,
      marketState,
      graduationTimeSec,
    );
  }, [bnbUsd, curvePoints, denomination, graduationTimeSec, marketState, metric]);

  const data = useMemo(() => {
    if (!seriesPoints.length && !(marketCandles || []).length) return [] as CandleRow[];
    // Cap gap-fill so sparse tokens don't draw a multi-hour flat runway into a spike.
    const maxGapFillBuckets = resolution === "5s" ? 6 : resolution === "1m" ? 3 : 2;
    const fromTrades = buildCandles(seriesPoints, intervalSeconds, {
      extendToNow: false,
      maxGapFillBuckets,
    }).candles as CandleRow[];
    const fromServer = topazCandles(marketCandles, marketState, metric, denomination, bnbUsd || 1);
    // Prefer continuous client series; server Topaz candles only enrich OHLC (no wipe).
    return mergeCandleRows(fromTrades, fromServer);
  }, [bnbUsd, denomination, intervalSeconds, marketCandles, marketState, metric, resolution, seriesPoints]);

  const markers = useMemo((): SeriesMarker<Time>[] => {
    if (!data.length) return [];
    const out: SeriesMarker<Time>[] = [];

    if (graduationTimeSec > 0) {
      const t = nearestCandleTime(data, graduationTimeSec);
      if (t != null) {
        out.push({
          time: t,
          position: "aboveBar",
          color: "#f59e0b",
          shape: "arrowDown",
          text: "Graduated",
        });
      }
    }

    const creator = String(creatorAddress || "").trim().toLowerCase();
    if (creator && /^0x[a-f0-9]{40}$/.test(creator)) {
      // One marker per bucket per side so we don't spam the series.
      const seen = new Set<string>();
      for (const trade of curvePoints || []) {
        const wallet = String(trade.from || "").toLowerCase();
        if (!sameAddr(wallet, creator)) continue;
        const ts = Number(trade.timestamp || 0);
        if (!ts) continue;
        const t = nearestCandleTime(data, ts);
        if (t == null) continue;
        const side = trade.type === "sell" ? "sell" : "buy";
        const key = `${Number(t)}:${side}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          time: t,
          position: side === "buy" ? "belowBar" : "aboveBar",
          color: side === "buy" ? "#22c55e" : "#ef4444",
          shape: "circle",
          text: side === "buy" ? "Creator buy" : "Creator sell",
        });
      }
    }

    return out.sort((a, b) => Number(a.time) - Number(b.time));
  }, [creatorAddress, curvePoints, data, graduationTimeSec]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const chart = createChart(element, {
      width: Math.max(10, rect.width || element.clientWidth || 10),
      height: Math.max(140, rect.height || element.clientHeight || 260),
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.75)",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: true, color: "rgba(255,255,255,0.06)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        visible: true,
        autoScale: true,
        borderVisible: true,
        borderColor: "rgba(255,255,255,0.18)",
        ticksVisible: true,
        minimumWidth: 88,
        scaleMargins: { top: 0.12, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: true,
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: true,
        secondsVisible: intervalSeconds <= 60,
        rightOffset: 6,
        barSpacing: 8,
        minBarSpacing: 3,
        lockVisibleTimeRangeOnResize: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: true,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        minMove: metric === "price" ? 0.00000001 : 0.01,
        formatter: (value: number) => formatValue(value, metric, denomination),
      },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markerPluginRef.current = createSeriesMarkers(series, []);

    const observer = new ResizeObserver(() => {
      const target = containerRef.current;
      if (!target || !chartRef.current) return;
      const bounds = target.getBoundingClientRect();
      chartRef.current.applyOptions({
        width: Math.max(10, bounds.width || target.clientWidth || 10),
        height: Math.max(140, bounds.height || target.clientHeight || 260),
      });
    });
    observer.observe(element);
    resizeRef.current = observer;

    return () => {
      observer.disconnect();
      resizeRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markerPluginRef.current = null;
      previousDataRef.current = [];
      initialRangeSetRef.current = false;
    };
    // Chart shell once; series options update separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { secondsVisible: intervalSeconds <= 60 },
    });
    seriesRef.current?.applyOptions({
      priceFormat: {
        type: "custom",
        minMove: metric === "price" ? 0.00000001 : 0.01,
        formatter: (value: number) => formatValue(value, metric, denomination),
      },
    });
    initialRangeSetRef.current = false;
  }, [denomination, intervalSeconds, metric]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || data.length === 0) return;

    const previous = previousDataRef.current;
    const onlyLatestChanged =
      previous.length > 0 &&
      data.length >= previous.length &&
      data.slice(0, -1).every((row, index) => Number(row.time) === Number(previous[index]?.time));

    if (onlyLatestChanged) series.update(data[data.length - 1] as any);
    else series.setData(data as any);
    previousDataRef.current = data;

    if (!initialRangeSetRef.current) {
      const width = containerRef.current?.getBoundingClientRect().width || 800;
      const visibleBars = Math.max(24, Math.min(180, Math.floor(width / 8)));
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.length - visibleBars),
        to: data.length + 4,
      });
      initialRangeSetRef.current = true;
    }
  }, [data]);

  useEffect(() => {
    if (!markerPluginRef.current) return;
    markerPluginRef.current.setMarkers(markers);
  }, [markers]);

  const hasData = data.length > 0;
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 shrink-0">
        <div className="flex items-center gap-1 rounded-md border border-orange-400/25 bg-black/30 p-0.5">
          <button
            type="button"
            onClick={() => setMetric("marketcap")}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
              metric === "marketcap"
                ? "bg-orange-500/25 text-orange-300"
                : "text-muted-foreground hover:text-orange-200"
            }`}
          >
            Market Cap
          </button>
          <button
            type="button"
            onClick={() => setMetric("price")}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
              metric === "price"
                ? "bg-orange-500/25 text-orange-300"
                : "text-muted-foreground hover:text-orange-200"
            }`}
          >
            Price
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {creatorAddress ? (
            <div className="hidden items-center gap-2 text-[9px] text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Creator buy
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Creator sell
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-1">
            {TIMEFRAMES.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => onResolutionChange(item.key)}
                className={`rounded border px-2 py-1 text-[10px] font-semibold transition-colors ${
                  resolution === item.key
                    ? "border-orange-400/50 bg-orange-500/25 text-orange-300"
                    : "border-border/60 text-muted-foreground hover:text-orange-200"
                }`}
              >
                {item.key}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {loading
              ? "Loading trade history…"
              : error
                ? error
                : "No trades in the loaded window yet. Buys/sells appear as continuous candles once history is recovered."}
          </div>
        )}
      </div>
    </div>
  );
}
