// src/lib/chart/CurveTradesChart.tsx
// TradingView-style chart using TradingView Lightweight Charts (free).

import React, { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  CrosshairMode,
  ColorType,
  CandlestickSeries,
  type IChartApi,
} from "lightweight-charts";

import { buildCandles, type CurveTradePoint } from "@/lib/chart/buildCandles";

type Props = {
  /** Points with ts in ms and value in USD marketcap. */
  points: CurveTradePoint[];
  /** Candle interval (seconds): 5, 60, 300, 900, 3600 */
  intervalSec: number;
  /** Optional fixed height (px). If omitted, fills container height. */
  height?: number;
};

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);

  if (abs >= 1_000_000_000) return `${sign}$${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}K`;
  return `${sign}$${v.toFixed(2)}`;
}

export const CurveTradesChart: React.FC<Props> = ({ points, intervalSec, height }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  // Desired candle width in pixels. We compute how many bars to show from container width
  // so candles look consistent across timeframes and when resizing.
  const DESIRED_BAR_PX = 10;
  // On small screens we may only fit ~15–30 bars at the desired pixel width.
  // Keep this low to avoid squeezing candles into sub-pixel widths.
  const MIN_VISIBLE_BARS = 20;
  const MAX_VISIBLE_BARS = 260;

  const lastBarCountRef = useRef(0);

  // Build candles when actual chart inputs change.
  // Realtime trades still update instantly because `points` changes when Ably/indexer data arrives.
  const { candles } = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    return buildCandles(points ?? [], intervalSec, {
      extendToNow: false,
      maxGapFillBuckets: 0,
      nowSec,
    });
  }, [points, intervalSec]);

  // Fit only once per interval to avoid "jumping" during realtime updates
  const fittedRef = useRef<{ intervalSec: number; fitted: boolean }>({ intervalSec, fitted: false });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    roRef.current?.disconnect();
    roRef.current = null;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    fittedRef.current = { intervalSec, fitted: false };

    const rect = el.getBoundingClientRect();
    const initW = Math.max(10, rect.width || el.clientWidth || 10);
    const inferredH = rect.height || el.clientHeight || 360;
    const initH = Math.max(200, height ?? inferredH);

    const chart = createChart(el, {
      width: initW,
      height: initH,

      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.72)",
      },

      // Horizontal grid lines only (price), no vertical time lines
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
        textColor: "rgba(255,255,255,0.90)",
        minimumWidth: 80, // ensures the full price ladder is visible
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },

      timeScale: {
        borderVisible: true,
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: true,
        secondsVisible: intervalSec <= 60,
        rightOffset: 6,
        // Keep candles readable; actual visible bar count is computed from width.
        barSpacing: DESIRED_BAR_PX,
        minBarSpacing: Math.max(4, Math.floor(DESIRED_BAR_PX * 0.7)),
        lockVisibleTimeRangeOnResize: false,
        fixLeftEdge: false,
        fixRightEdge: false,
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

    // v5 API: addSeries(SeriesDefinition, options)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      // Borders help visually separate doji/flat candles (otherwise they can look like a continuous line).
      borderVisible: true,
      borderUpColor: "rgba(38,166,154,0.95)",
      borderDownColor: "rgba(239,83,80,0.95)",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        minMove: 0.01,
        formatter: (p: number) => formatUsd(p),
      },
    });

    // Extra safety: force right scale ladder visibility
    chart.priceScale("right").applyOptions({
      ticksVisible: true,
      textColor: "rgba(255,255,255,0.90)",
      borderColor: "rgba(255,255,255,0.18)",
      minimumWidth: 80,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const ro = new ResizeObserver(() => {
      const c = containerRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const w = Math.max(10, r.width || c.clientWidth || 10);
      const inferred = r.height || c.clientHeight || 360;
      const h2 = Math.max(200, height ?? inferred);
      chart.applyOptions({ width: w, height: h2 });

      // Keep the visual candle width consistent after resize.
      chart.timeScale().applyOptions({
        barSpacing: DESIRED_BAR_PX,
        minBarSpacing: Math.max(4, Math.floor(DESIRED_BAR_PX * 0.7)),
      });

       const bars = lastBarCountRef.current;
       if (bars > 0) {
         const visibleBars = Math.max(
           MIN_VISIBLE_BARS,
           Math.min(MAX_VISIBLE_BARS, Math.floor(w / DESIRED_BAR_PX))
         );
         const from = bars - visibleBars;
         const to = bars + 5;
         chart.timeScale().setVisibleLogicalRange({ from, to });
       }
    });

    ro.observe(el);
    roRef.current = ro;

    return () => {
      ro.disconnect();
      roRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [height, intervalSec]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    series.setData(candles as any);

    lastBarCountRef.current = candles.length;

    if (fittedRef.current.intervalSec !== intervalSec) {
      fittedRef.current = { intervalSec, fitted: false };
    }

    // Initial auto-range per timeframe (show last N bars based on container width)
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;

    if (!fittedRef.current.fitted && candles.length > 0) {
      const w = Math.max(10, el.getBoundingClientRect().width || el.clientWidth || 10);

      // Fixed pixel candle width — few trades stay thin instead of stretching full-width.
      chart.timeScale().applyOptions({
        barSpacing: DESIRED_BAR_PX,
        minBarSpacing: Math.max(4, Math.floor(DESIRED_BAR_PX * 0.7)),
      });

      const visibleBars = Math.max(
        MIN_VISIBLE_BARS,
        Math.min(MAX_VISIBLE_BARS, Math.floor(w / DESIRED_BAR_PX))
      );
      const from = candles.length - visibleBars;
      const to = candles.length + 5;
      chart.timeScale().setVisibleLogicalRange({ from, to });
      fittedRef.current.fitted = true;
    }
  }, [candles, intervalSec]);

  return (
    <div style={{ width: "100%", height: height ? `${height}px` : "100%" }}>
      {/* Inner wrapper defines the exact drawing box (prevents 'cut off' look in padded cards). */}
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          paddingLeft: 8,
          paddingRight: 12, // room for the right price scale
        }}
      >
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      </div>
    </div>
  );
};