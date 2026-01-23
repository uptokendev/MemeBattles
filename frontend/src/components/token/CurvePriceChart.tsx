// src/components/token/CurvePriceChart.tsx
// Market-cap chart for bonding-curve trades, rendered with TradingView Lightweight Charts.

import { useMemo, useState } from "react";
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

type TimeframeKey = "5s" | "1m" | "5m" | "15m" | "1h";

const TIMEFRAMES: Array<{ key: TimeframeKey; label: string; seconds: number }> = [
  { key: "5s", label: "5s", seconds: 5 },
  { key: "1m", label: "1m", seconds: 60 },
  { key: "5m", label: "5m", seconds: 5 * 60 },
  { key: "15m", label: "15m", seconds: 15 * 60 },
  { key: "1h", label: "1h", seconds: 60 * 60 },
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
 * - derive circulating tokens from buys/sells
 * - mcapBNB = pricePerToken(BNB) * circulatingTokens
 * - mcapUSD = mcapBNB * bnbUsd
 */
function toMarketCapPointsUsd(trades: CurveTradePoint[], bnbUsd: number): ChartPoint[] {
  if (!trades?.length || !Number.isFinite(bnbUsd) || bnbUsd <= 0) return [];

  const sorted = [...trades].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
  });

  let circ = 0;
  const out: ChartPoint[] = [];

  for (const t of sorted) {
    const delta = tokensFromWeiSafe(t.tokensWei);
    circ += t.type === "sell" ? -delta : delta;
    if (circ < 0) circ = 0;

    const mcBnb = Number(t.pricePerToken ?? 0) * circ;
    const mcUsd = mcBnb * bnbUsd;

    const tsMs = Number(t.timestamp ?? 0) * 1000;
    if (!Number.isFinite(tsMs) || tsMs <= 0) continue;
    if (!Number.isFinite(mcUsd) || mcUsd <= 0) continue;

    out.push({ ts: tsMs, value: mcUsd });
  }

  return out;
}

/**
 * Mock mode fallback: uses pricePerToken as "shape" and assumes a small growing supply.
 */
function toMarketCapPointsUsdMock(events: MockCurveEvent[], bnbUsd: number): ChartPoint[] {
  if (!events?.length || !Number.isFinite(bnbUsd) || bnbUsd <= 0) return [];
  const sorted = [...events].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));

  let circ = 0;
  const out: ChartPoint[] = [];
  for (const e of sorted) {
    circ += 1; // 1 token per event (simple)
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
  const [tf, setTf] = useState<TimeframeKey>("1m");
  const bucketSec = useMemo(() => TIMEFRAMES.find((t) => t.key === tf)?.seconds ?? 60, [tf]);

  // Live data (disabled when TokenDetails passes override to avoid duplicate websockets)
  const live = useCurveTrades(campaignAddress, { enabled: !curvePointsOverride && !mockMode });
  const livePoints = curvePointsOverride ?? live.points;
  const liveLoading = loadingOverride ?? live.loading;
  const liveError = errorOverride ?? live.error;

  // USD conversion
  const { price: bnbUsd, loading: bnbUsdLoading, error: bnbUsdError } = useBnbUsdPrice(!mockMode);

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

  const chartPoints: ChartPoint[] = useMemo(() => {
    if (mockMode) return toMarketCapPointsUsdMock(mockEvents || [], bnbUsd ?? 0);
    return toMarketCapPointsUsd(livePoints || [], bnbUsd ?? 0);
  }, [mockMode, mockEvents, livePoints, bnbUsd]);

  if (chartPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No curve data available yet.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* timeframe controls */}
      <div className="flex items-center justify-end gap-1 px-2 pb-2">
        {TIMEFRAMES.map((t) => {
          const active = t.key === tf;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTf(t.key)}
              className={[
                "px-2 py-1 text-[11px] rounded-md border transition",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background/50 text-muted-foreground border-border hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-[260px]">
        <CurveTradesChart points={chartPoints} intervalSec={bucketSec} />
      </div>
    </div>
  );
};
