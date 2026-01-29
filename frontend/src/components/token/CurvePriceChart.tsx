// src/components/token/CurvePriceChart.tsx
// Market-cap chart for bonding-curve trades, rendered with TradingView Lightweight Charts.

import { useMemo, useState, useEffect } from "react";
import { ethers } from "ethers";

import { useCurveTrades, type CurveTradePoint } from "@/hooks/useCurveTrades";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { CurveTradesChart } from "@/lib/chart/CurveTradesChart";
import type { CurveTradePoint as ChartPoint } from "@/lib/chart/buildCandles";

import type { MockCurveEvent } from "@/constants/mockCurveTrades";

type CurvePriceChartProps = {
  campaignAddress?: string;
  mockMode?: boolean;
  mockEvents?: MockCurveEvent[];
  /** Optional override to avoid opening additional realtime connections in child components. */
  curvePointsOverride?: CurveTradePoint[];
  loadingOverride?: boolean;
  errorOverride?: string | null;
};

type TimeframeKey = "5s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

const TIMEFRAMES: Array<{ key: TimeframeKey; label: string; seconds: number }> = [
  { key: "5s", label: "5s", seconds: 5 },
  { key: "1m", label: "1m", seconds: 60 },
  { key: "5m", label: "5m", seconds: 5 * 60 },
  { key: "15m", label: "15m", seconds: 15 * 60 },
  { key: "30m", label: "30m", seconds: 30 * 60 },
  { key: "1h", label: "1h", seconds: 60 * 60 },
  { key: "4h", label: "4h", seconds: 4 * 60 * 60 },
  { key: "1d", label: "1d", seconds: 24 * 60 * 60 },
];

function tokensFromWeiSafe(wei: bigint | undefined | null): number {
  try {
    if (!wei) return 0;
    const n = Number(ethers.formatUnits(wei, 18));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Builds market-cap series in USD:
 * - circulatingTokens += buyTokens; -= sellTokens
 * - mcapBNB = pricePerToken(BNB) * circulatingTokens
 * - mcapUSD = mcapBNB * bnbUsd
 */
function toMarketCapPointsUsd(trades: CurveTradePoint[], bnbUsd: number): ChartPoint[] {
  if (!trades?.length || !Number.isFinite(bnbUsd) || bnbUsd <= 0) return [];

  const sorted = [...trades].sort((a, b) => {
    if ((a.timestamp ?? 0) !== (b.timestamp ?? 0)) return (a.timestamp ?? 0) - (b.timestamp ?? 0);
    if ((a.blockNumber ?? 0) !== (b.blockNumber ?? 0)) return (a.blockNumber ?? 0) - (b.blockNumber ?? 0);
    return Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
  });

  let circ = 0;
  const out: ChartPoint[] = [];

  for (const t of sorted) {
    const delta = tokensFromWeiSafe(t.tokensWei);
    circ += t.type === "sell" ? -delta : delta;
    if (circ < 0) circ = 0;

    const priceBnb = Number(t.pricePerToken ?? 0);
    const mcUsd = priceBnb * circ * bnbUsd;

    const tsMs = Number(t.timestamp ?? 0) * 1000;
    if (!Number.isFinite(tsMs) || tsMs <= 0) continue;
    if (!Number.isFinite(mcUsd) || mcUsd <= 0) continue;

    out.push({ ts: tsMs, value: mcUsd });
  }

  return out;
}

/**
 * Mock fallback: uses pricePerToken as "shape" and assumes a small growing supply.
 */
function toMarketCapPointsUsdMock(events: MockCurveEvent[], bnbUsd: number): ChartPoint[] {
  if (!events?.length || !Number.isFinite(bnbUsd) || bnbUsd <= 0) return [];
  const sorted = [...events].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));

  let circ = 0;
  const out: ChartPoint[] = [];

  for (const e of sorted) {
    circ += 1; // simple mock supply increment
    const priceBnb = Number(e.pricePerToken ?? 0);
    const mcUsd = priceBnb * circ * bnbUsd;

    const tsMs = Number(e.timestamp ?? 0) * 1000;
    if (!Number.isFinite(tsMs) || tsMs <= 0) continue;
    if (!Number.isFinite(mcUsd) || mcUsd <= 0) continue;

    out.push({ ts: tsMs, value: mcUsd });
  }

  return out;
}

export const CurvePriceChart = ({
  campaignAddress,
  mockMode = false,
  mockEvents = [],
  curvePointsOverride,
  loadingOverride,
  errorOverride,
}: CurvePriceChartProps) => {
  // HOOKS MUST ALWAYS RUN BEFORE ANY RETURN
  const [tf, setTf] = useState<TimeframeKey>("1m");
  const bucketSec = useMemo(() => TIMEFRAMES.find((t) => t.key === tf)?.seconds ?? 60, [tf]);

  const live = useCurveTrades(campaignAddress, { enabled: !curvePointsOverride && !mockMode });
  const livePoints = curvePointsOverride ?? live.points;
  const liveLoading = loadingOverride ?? live.loading;
  const liveError = errorOverride ?? live.error;

  const { price: bnbUsd, loading: bnbUsdLoading, error: bnbUsdError } = useBnbUsdPrice(!mockMode);

  const chartPoints: ChartPoint[] = useMemo(() => {
    const usd = bnbUsd ?? 0;
    if (!usd || usd <= 0) return [];

    if (mockMode) return toMarketCapPointsUsdMock(mockEvents || [], usd);
    return toMarketCapPointsUsd(livePoints || [], usd);
  }, [mockMode, mockEvents, livePoints, bnbUsd]);

  useEffect(() => {
  const last = chartPoints && chartPoints.length ? chartPoints[chartPoints.length - 1] : null;

  console.debug("[Chart MCap]", {
    campaignAddress: (campaignAddress ?? "").toLowerCase(),
    bnbUsd,
    lastPoint: last, // { ts, value } where value is mcapUSD
    pointsCount: chartPoints?.length ?? 0,
  });
}, [campaignAddress, bnbUsd, chartPoints]);

  // Render states (SAFE: hooks already executed)
  if (mockMode && (!mockEvents || mockEvents.length === 0)) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No mock trades available.
      </div>
    );
  }

  if (!mockMode && liveLoading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        Loading curve trades…
      </div>
    );
  }

  if (!mockMode && liveError) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-destructive p-4">
        {liveError}
      </div>
    );
  }

  if (!mockMode && (bnbUsdLoading || !bnbUsd)) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        Loading USD conversion…
      </div>
    );
  }

  if (!mockMode && bnbUsdError) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-destructive p-4">
        {bnbUsdError}
      </div>
    );
  }

  if (chartPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No curve data available yet.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* timeframe dropdown (default 1m) */}
      <div className="flex items-center justify-end px-2 pb-2">
        <select
          value={tf}
          onChange={(e) => setTf(e.target.value as TimeframeKey)}
          className="h-7 rounded-md border border-border bg-background/50 px-2 text-[11px] text-foreground outline-none"
        >
          {TIMEFRAMES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-h-[260px]">
        <CurveTradesChart points={chartPoints} intervalSec={bucketSec} />
      </div>
    </div>
  );
};
