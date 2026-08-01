import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
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
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function bondingPoints(
  trades: CurveTradePoint[],
  metric: UnifiedChartMetric,
  denomination: UnifiedChartDenomination,
  bnbUsd: number,
): ChartPoint[] {
  const sorted = [...(trades || [])].sort((a, b) =>
    (a.timestamp ?? 0) - (b.timestamp ?? 0) ||
    (a.blockNumber ?? 0) - (b.blockNumber ?? 0) ||
    Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0),
  );
  let circulating = 0;
  const points: ChartPoint[] = [];

  for (const trade of sorted) {
    const tokenAmount = tokensFromWei(trade.tokensWei);
    circulating += trade.type === "sell" ? -tokenAmount : tokenAmount;
    circulating = Math.max(0, circulating);
    const priceBnb = finite(trade.pricePerToken);
    const timestampMs = Number(trade.timestamp || 0) * 1000;
    if (!priceBnb || !Number.isFinite(timestampMs) || timestampMs <= 0) continue;

    const valueBnb = metric === "marketcap" ? priceBnb * circulating : priceBnb;
    const value = denomination === "USD" ? valueBnb * bnbUsd : valueBnb;
    if (!Number.isFinite(value) || value <= 0) continue;
    points.push({ ts: timestampMs, value });
  }
  return points;
}

function topazCandles(
  rows: MarketCandle[],
  state: MarketState | null,
  metric: UnifiedChartMetric,
  denomination: UnifiedChartDenomination,
  bnbUsd: number,
): CandleRow[] {
  const supply = postBurnSupply(state);
  return (rows || [])
    .filter((row) => (Number(row.source_mask || 0) & 2) === 2)
    .map((row) => {
      const timestamp = Math.floor(new Date(row.bucket_start).getTime() / 1000);
      const multiplier = metric === "marketcap" ? supply : 1;
      const denominationMultiplier = denomination === "USD" ? bnbUsd : 1;
      const mapValue = (value: unknown) => Number(value) * multiplier * denominationMultiplier;
      return {
        time: timestamp as Time,
        open: mapValue(row.o),
        high: mapValue(row.h),
        low: mapValue(row.l),
        close: mapValue(row.c),
      };
    })
    .filter((row) =>
      Number.isFinite(row.open) && row.open > 0 &&
      Number.isFinite(row.high) && row.high > 0 &&
      Number.isFinite(row.low) && row.low > 0 &&
      Number.isFinite(row.close) && row.close > 0,
    );
}

function mergeCandleRows(bonding: CandleRow[], topaz: CandleRow[]): CandleRow[] {
  const map = new Map<number, CandleRow>();
  for (const candle of bonding) map.set(Number(candle.time), candle);
  for (const candle of topaz) map.set(Number(candle.time), candle);
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

export function UnifiedMarketChart({
  curvePoints,
  marketCandles,
  marketState,
  graduationMarker,
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
  const markerPluginRef = useRef<any>(null);
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

  const data = useMemo(() => {
    if (!bnbUsd && denomination === "USD") return [];
    const points = bondingPoints(curvePoints, metric, denomination, bnbUsd || 1);
    const bonding = buildCandles(points, intervalSeconds, { extendToNow: false }).candles as CandleRow[];
    const dex = topazCandles(
      marketCandles,
      marketState,
      metric,
      denomination,
      bnbUsd || 1,
    );
    return mergeCandleRows(bonding, dex);
  }, [bnbUsd, curvePoints, denomination, intervalSeconds, marketCandles, marketState, metric]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const chart = createChart(element, {
      width: Math.max(10, rect.width || element.clientWidth || 10),
      height: Math.max(260, rect.height || element.clientHeight || 360),
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
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: true,
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: true,
        secondsVisible: intervalSeconds <= 60,
        rightOffset: 6,
        barSpacing: 10,
        minBarSpacing: 4,
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
        height: Math.max(260, bounds.height || target.clientHeight || 360),
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
      const visibleBars = Math.max(20, Math.min(220, Math.floor(width / 10)));
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.length - visibleBars),
        to: data.length + 5,
      });
      initialRangeSetRef.current = true;
    }
  }, [data]);

  useEffect(() => {
    if (!markerPluginRef.current || !graduationMarker?.time || data.length === 0) return;
    const markerSeconds = Math.floor(new Date(graduationMarker.time).getTime() / 1000);
    const closest = data.reduce((best, row) =>
      Math.abs(Number(row.time) - markerSeconds) < Math.abs(Number(best.time) - markerSeconds) ? row : best,
    );
    markerPluginRef.current.setMarkers([
      {
        time: closest.time,
        position: "aboveBar",
        color: "#f59e0b",
        shape: "arrowDown",
        text: "Graduated to Topaz",
      },
    ]);
  }, [data, graduationMarker]);

  const hasData = data.length > 0;
  return (
    <div className="relative flex h-full min-h-[260px] w-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
        <div className="flex items-center gap-1 rounded-md border border-border/70 bg-background/35 p-0.5">
          <button
            type="button"
            onClick={() => setMetric("marketcap")}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${metric === "marketcap" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
          >
            Market Cap
          </button>
          <button
            type="button"
            onClick={() => setMetric("price")}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${metric === "price" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
          >
            Price
          </button>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {TIMEFRAMES.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => onResolutionChange(item.key)}
              className={`rounded border px-2 py-1 text-[10px] font-semibold ${resolution === item.key ? "border-primary/50 bg-primary/20 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
            >
              {item.key}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-[260px] flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {loading
              ? "Loading trade history…"
              : error
                ? error
                : "No trade history loaded yet. Bonding curve and Topaz swaps will appear here once recovered."}
          </div>
        )}
      </div>
    </div>
  );
}
