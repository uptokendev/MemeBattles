// src/components/token/TokenCandlestickChart.tsx
// TradingView-like candlestick chart using TradingView Lightweight Charts.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  ColorType,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type CandlestickData,
  type Time,
} from "lightweight-charts";

import { USE_MOCK_DATA } from "@/config/mockConfig";
import { getMockCurveEventsForSymbol } from "@/constants/mockCurveTrades";
import { getMockDexTradesForSymbol } from "@/constants/mockDexTrades";
import { useCurveTrades, type CurveTradePoint } from "@/hooks/useCurveTrades";
import { useDexPairTrades } from "@/hooks/useDexPairTrades";
import { useWallet } from "@/hooks/useWallet";

type ChartStage = "curve" | "dex";

type TimeframeKey =
  | "1s"
  | "5s"
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1w"
  | "1M"
  | "1Y";

const TIMEFRAMES: Array<{ key: TimeframeKey; label: string; seconds: number }> = [
  { key: "1s", label: "1s", seconds: 1 },
  { key: "5s", label: "5s", seconds: 5 },
  { key: "1m", label: "1m", seconds: 60 },
  { key: "5m", label: "5m", seconds: 5 * 60 },
  { key: "15m", label: "15m", seconds: 15 * 60 },
  { key: "1h", label: "1h", seconds: 60 * 60 },
  { key: "4h", label: "4h", seconds: 4 * 60 * 60 },
  { key: "1w", label: "1W", seconds: 7 * 24 * 60 * 60 },
  // Phase 1: fixed-length approximation for month/year.
  { key: "1M", label: "1M", seconds: 30 * 24 * 60 * 60 },
  { key: "1Y", label: "1Y", seconds: 365 * 24 * 60 * 60 },
];

type PricePoint = { timestamp: number; price: number };

function normalizeMockTimestamps<T extends { timestamp: number }>(items: T[]): T[] {
  if (!items.length) return items;
  const now = Math.floor(Date.now() / 1000);
  const last = items[items.length - 1].timestamp;
  const shift = now - last;
  return items.map((x) => ({ ...x, timestamp: x.timestamp + shift }));
}

function buildCandles(points: PricePoint[], intervalSec: number): CandlestickData<Time>[] {
  if (!points.length || intervalSec <= 0) return [];
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const out: CandlestickData<Time>[] = [];
  let curBucket = -1;
  let cur: CandlestickData<Time> | null = null;

  for (const p of sorted) {
    const bucket = Math.floor(p.timestamp / intervalSec) * intervalSec;
    if (bucket !== curBucket) {
      if (cur) out.push(cur);
      curBucket = bucket;
      const t = bucket as UTCTimestamp;
      cur = {
        time: t,
        open: p.price,
        high: p.price,
        low: p.price,
        close: p.price,
      };
      continue;
    }

    if (!cur) continue;
    cur.high = Math.max(cur.high, p.price);
    cur.low = Math.min(cur.low, p.price);
    cur.close = p.price;
  }

  if (cur) out.push(cur);
  return out;
}

function choosePrecision(samplePrices: number[]): { precision: number; minMove: number } {
  const p = samplePrices.filter((x) => Number.isFinite(x) && x > 0).slice(0, 200);
  if (!p.length) return { precision: 8, minMove: 0.00000001 };

  // Heuristic: choose enough decimals so that minMove is meaningful.
  const min = Math.min(...p);
  if (!Number.isFinite(min) || min <= 0) return { precision: 8, minMove: 0.00000001 };

  let precision = 8;
  if (min >= 1) precision = 4;
  else if (min >= 0.01) precision = 6;
  else if (min >= 0.0001) precision = 8;
  else precision = 10;

  precision = Math.max(2, Math.min(12, precision));
  const minMove = Number((10 ** -precision).toFixed(precision));
  return { precision, minMove };
}

export function TokenCandlestickChart(props: {
  stage: ChartStage;
  symbol?: string;
  campaignAddress?: string;
  tokenAddress?: string;
  dexPairAddress?: string;
  chainId?: number;
  curvePointsOverride?: CurveTradePoint[];
  className?: string;
}) {
  const { stage, symbol, campaignAddress, tokenAddress, dexPairAddress, chainId: chainIdProp, curvePointsOverride, className } = props;
  const { activeChainId } = useWallet();
  const chainId = chainIdProp ?? activeChainId;

  const [tf, setTf] = useState<TimeframeKey>("15m");
  const tfSeconds = useMemo(() => TIMEFRAMES.find((x) => x.key === tf)?.seconds ?? 900, [tf]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Data sources
  const curve = useCurveTrades(stage === "curve" ? campaignAddress : undefined, { enabled: stage === "curve" && !curvePointsOverride, chainId });
  const dex = useDexPairTrades({
    tokenAddress: stage === "dex" ? tokenAddress : undefined,
    pairAddress: stage === "dex" ? dexPairAddress : undefined,
    enabled: stage === "dex",
    chainId,
  });

  const points: PricePoint[] = useMemo(() => {
    if (USE_MOCK_DATA) {
      if (stage === "dex") {
        const items = normalizeMockTimestamps(getMockDexTradesForSymbol(symbol));
        return items.map((t) => ({ timestamp: t.timestamp, price: t.pricePerToken }));
      }
      const items = normalizeMockTimestamps(getMockCurveEventsForSymbol(symbol));
      return items.map((e) => ({ timestamp: e.timestamp, price: e.pricePerToken }));
    }

    if (stage === "dex") {
      return (dex.points ?? []).map((p) => ({ timestamp: p.timestamp, price: p.pricePerToken }));
    }

    return (curvePointsOverride ?? curve.points ?? []).map((p) => ({ timestamp: p.timestamp, price: p.pricePerToken }));
  }, [stage, symbol, curve.points, dex.points, curvePointsOverride]);

  const candles = useMemo(() => buildCandles(points, tfSeconds), [points, tfSeconds]);

  const loading = USE_MOCK_DATA ? false : stage === "dex" ? dex.loading : curve.loading;
  const error = USE_MOCK_DATA ? undefined : stage === "dex" ? dex.error : curve.error;

  // Create chart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Ensure container is empty on recreate
    el.innerHTML = "";

		const chart = createChart(el, {
      autoSize: true,
      layout: {
				background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.75)",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderVisible: false,
        rightOffset: 5,
        timeVisible: true,
        secondsVisible: tf.endsWith("s"),
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

		// Lightweight Charts v5 uses `addSeries(SeriesType, options)`
		const series = chart.addSeries(CandlestickSeries, {
			upColor: "#22c55e",
			downColor: "#ef4444",
			borderUpColor: "#22c55e",
			borderDownColor: "#ef4444",
			wickUpColor: "#22c55e",
			wickDownColor: "#ef4444",
			wickVisible: true,
			borderVisible: true,
		});

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        timeScale: {
          timeVisible: true,
          secondsVisible: tf.endsWith("s"),
        },
      });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tf]);

  // Push candles into the chart
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const sample = candles.slice(-200).map((c) => c.close);
    const fmt = choosePrecision(sample);
    series.applyOptions({
      priceFormat: {
        type: "price",
        precision: fmt.precision,
        minMove: fmt.minMove,
      },
    });

    series.setData(candles);

    // Keep last candle in view by default
    if (candles.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [candles]);

  return (
    <div className={"w-full h-full flex flex-col " + (className ?? "")}> 
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 bg-card/10">
        <div className="flex items-center gap-1.5 flex-wrap">
          {TIMEFRAMES.map((x) => (
            <button
              key={x.key}
              onClick={() => setTf(x.key)}
              className={
                "h-7 px-2 rounded-md text-[10px] font-mono border transition-colors " +
                (tf === x.key
                  ? "bg-accent/20 border-border/60 text-foreground"
                  : "bg-transparent border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/20")
              }
              type="button"
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-muted-foreground font-mono">
          {loading ? "Loading…" : error ? "Chart error" : ""}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground p-4">
            {error}
          </div>
        ) : candles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground p-4">
            {stage === "dex" ? "No DEX price data yet." : "No bonding-curve trades yet."}
          </div>
        ) : null}

        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}