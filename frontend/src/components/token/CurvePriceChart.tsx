// src/components/token/CurvePriceChart.tsx
import { useMemo, useState } from "react";
import { useCurveTrades, type CurveTradePoint } from "@/hooks/useCurveTrades";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Customized,
} from "recharts";

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

type Point = { timestamp: number; pricePerToken: number };

type Candle = {
  timeMs: number; // epoch ms (bucket start)
  open: number;
  high: number;
  low: number;
  close: number;
};

function bucketStartMs(timestampSec: number, bucketSec: number): number {
  const t = Math.floor(timestampSec);
  const b = Math.floor(t / bucketSec) * bucketSec;
  return b * 1000;
}

function toCandles(points: Point[], bucketSec: number): Candle[] {
  if (!points.length) return [];

  const sorted = [...points]
    .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.pricePerToken) && p.pricePerToken > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  const out: Candle[] = [];
  let curBucket: number | null = null;
  let cur: Candle | null = null;

  for (const p of sorted) {
    const b = bucketStartMs(p.timestamp, bucketSec);
    if (curBucket === null || b !== curBucket) {
      if (cur) out.push(cur);
      curBucket = b;
      cur = {
        timeMs: b,
        open: p.pricePerToken,
        high: p.pricePerToken,
        low: p.pricePerToken,
        close: p.pricePerToken,
      };
      continue;
    }
    if (!cur) continue;
    cur.high = Math.max(cur.high, p.pricePerToken);
    cur.low = Math.min(cur.low, p.pricePerToken);
    cur.close = p.pricePerToken;
  }

  if (cur) out.push(cur);
  return out;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatPrice(x: number): string {
  if (!Number.isFinite(x)) return "—";
  // Keep small values readable (bonding curve often has tiny prices)
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs < 0.000001) return x.toExponential(4);
  if (abs < 0.01) return x.toFixed(8);
  if (abs < 1) return x.toFixed(6);
  return x.toFixed(4);
}

function CandleTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const c: Candle | undefined = payload?.[0]?.payload;
  if (!c) return null;

  return (
    <div className="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{formatTime(c.timeMs)}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <div className="text-muted-foreground">O</div>
        <div>{formatPrice(c.open)}</div>
        <div className="text-muted-foreground">H</div>
        <div>{formatPrice(c.high)}</div>
        <div className="text-muted-foreground">L</div>
        <div>{formatPrice(c.low)}</div>
        <div className="text-muted-foreground">C</div>
        <div>{formatPrice(c.close)}</div>
      </div>
    </div>
  );
}

function CandlesLayer(props: any) {
  const { xAxisMap, yAxisMap, offset, data } = props;
  if (!data?.length) return null;

  const xAxis = xAxisMap?.[Object.keys(xAxisMap)[0]];
  const yAxis = yAxisMap?.[Object.keys(yAxisMap)[0]];
  const xScale = xAxis?.scale;
  const yScale = yAxis?.scale;
  if (typeof xScale !== "function" || typeof yScale !== "function") return null;

  const innerW = (offset?.width ?? 0) || 0;
  const candleW = Math.max(2, Math.min(18, (innerW / Math.max(1, data.length)) * 0.65));

  return (
    <g>
      {data.map((c: Candle) => {
        const x = xScale(c.timeMs);
        if (!Number.isFinite(x)) return null;

        const up = c.close >= c.open;
        const bodyTop = Math.min(c.open, c.close);
        const bodyBot = Math.max(c.open, c.close);

        const yHigh = yScale(c.high);
        const yLow = yScale(c.low);
        const yBodyTop = yScale(bodyBot); // note: yScale is inverted
        const yBodyBot = yScale(bodyTop);

        if (![yHigh, yLow, yBodyTop, yBodyBot].every(Number.isFinite)) return null;

        const bodyH = Math.max(1, Math.abs(yBodyBot - yBodyTop));
        const fill = up ? "#16a34a" : "#ef4444"; // green/red as requested

        return (
          <g key={c.timeMs}>
            {/* wick */}
            <line
              x1={x}
              x2={x}
              y1={yHigh}
              y2={yLow}
              stroke={fill}
              strokeWidth={1}
              opacity={0.9}
            />
            {/* body */}
            <rect
              x={x - candleW / 2}
              y={Math.min(yBodyTop, yBodyBot)}
              width={candleW}
              height={bodyH}
              fill={fill}
              opacity={0.9}
              rx={1}
            />
          </g>
        );
      })}
    </g>
  );
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

  //
  // 🔹 LIVE CHAIN DATA (only used when mockMode = false)
  //
  const live = useCurveTrades(campaignAddress, { enabled: !curvePointsOverride });
  const livePoints = curvePointsOverride ?? live.points;
  const liveLoading = loadingOverride ?? live.loading;
  const liveError = errorOverride ?? live.error;

  //
  // 🔹 MERGE: Choose mock or live data
  //
  const isMock = mockMode;

  const points: Point[] = isMock
    ? mockEvents.map((e) => ({ timestamp: e.timestamp, pricePerToken: e.pricePerToken }))
    : livePoints.map((p) => ({ timestamp: p.timestamp, pricePerToken: p.pricePerToken }));

  const loading = isMock ? false : liveLoading;
  const error = isMock ? null : liveError;

  const bucketSec = useMemo(() => TIMEFRAMES.find((t) => t.key === tf)?.seconds ?? 60, [tf]);

  const candles = useMemo(() => toCandles(points, bucketSec), [points, bucketSec]);

  //
  // 🔹 Render states
  //
  if (isMock && mockEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No mock trades available.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        Loading curve trades…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-destructive p-4">
        {error}
      </div>
    );
  }

  if (candles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No trades on the bonding curve yet.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* timeframe controls */}
      <div className="flex items-center justify-end px-2 pb-2">
        <Select value={tf} onValueChange={(v) => setTf(v as TimeframeKey)}>
          <SelectTrigger className="h-7 w-[92px] rounded-md text-[11px]">
            <SelectValue placeholder="1m" />
          </SelectTrigger>
          <SelectContent align="end">
            {TIMEFRAMES.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={candles}
            margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
          >
            <XAxis
              dataKey="timeMs"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => formatTime(Number(v))}
              minTickGap={20}
            />
            <YAxis
              orientation="right"
              tick={{ fontSize: 10 }}
              width={70}
              tickFormatter={(v) => formatPrice(Number(v))}
            />
            <Tooltip content={<CandleTooltip />} />

            {/* Invisible line so tooltip tracking works smoothly */}
            <Line type="monotone" dataKey="close" stroke="transparent" dot={false} isAnimationActive={false} />

            {/* Custom candle drawing */}
            <Customized component={CandlesLayer} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
