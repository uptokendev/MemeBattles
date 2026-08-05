// src/lib/chart/buildCandles.ts

/**
 * Generic chart input point.
 * You control what "value" represents (price or market cap).
 */
export type CurveTradePoint = {
  ts: number; // milliseconds
  value: number;
  volume?: number;
  /** Optional: used for creator markers / debug — not required for OHLC. */
  side?: "buy" | "sell";
  wallet?: string;
};

export type Candle = {
  time: number; // unix seconds (Lightweight Charts format)
  open: number;
  high: number;
  low: number;
  close: number;
};

export type VolumeBar = {
  time: number;
  value: number;
  color?: string;
};

type BuildOpts = {
  /** If true, fills gaps and extends candles up to "now" with flat candles. */
  extendToNow?: boolean;
  /** Override "now" (unix seconds). Defaults to current time. */
  nowSec?: number;
  /**
   * Max empty buckets to bridge between real trades (flat candles).
   * 0 = never gap-fill (sparse prints stay sparse — healthier for low-volume tokens).
   * Default 3 (~3 minutes on 1m) so short idle periods stay readable without hour-long flat lines.
   */
  maxGapFillBuckets?: number;
};

function bucketStartSec(tsMs: number, intervalSec: number): number {
  const tSec = Math.floor(tsMs / 1000);
  return Math.floor(tSec / intervalSec) * intervalSec;
}

/**
 * Build OHLC candles from raw points (TradingView-like).
 *
 * - Same-bucket trades update high/low/close (so a buy then sell in 1m shows a real wick).
 * - New bucket OPEN = previous close (continuous series).
 * - Gap fill is capped so empty hours do not draw a fake flat runway into a spike.
 */
export function buildCandles(
  points: CurveTradePoint[],
  intervalSec: number,
  opts?: BuildOpts,
): { candles: Candle[]; volumes: VolumeBar[] } {
  const extendToNow = !!opts?.extendToNow;
  const nowSec = Math.floor(opts?.nowSec ?? Date.now() / 1000);
  const maxGapFill =
    opts?.maxGapFillBuckets === undefined ? 3 : Math.max(0, Math.floor(opts.maxGapFillBuckets));

  if (!intervalSec || intervalSec <= 0) return { candles: [], volumes: [] };

  const sorted = (points || [])
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.value) && p.value > 0)
    .slice()
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length === 0) return { candles: [], volumes: [] };

  const candles: Candle[] = [];
  const volumes: VolumeBar[] = [];

  const pushBucket = (bucketSec: number, o: number, h: number, l: number, c: number, v: number) => {
    // Guard inverted wicks from bad inputs
    const high = Math.max(o, h, l, c);
    const low = Math.min(o, h, l, c);
    candles.push({ time: bucketSec, open: o, high, low, close: c });
    volumes.push({ time: bucketSec, value: v });
  };

  let curBucket = bucketStartSec(sorted[0].ts, intervalSec);
  let open = sorted[0].value;
  let high = sorted[0].value;
  let low = sorted[0].value;
  let close = sorted[0].value;
  let vol = sorted[0].volume ?? 0;

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const bSec = bucketStartSec(p.ts, intervalSec);

    if (bSec !== curBucket) {
      pushBucket(curBucket, open, high, low, close, vol);

      const prevClose = close;
      const gapBuckets = Math.floor((bSec - curBucket) / intervalSec) - 1;

      if (gapBuckets > 0 && maxGapFill > 0 && gapBuckets <= maxGapFill) {
        let fill = curBucket + intervalSec;
        while (fill < bSec) {
          pushBucket(fill, prevClose, prevClose, prevClose, prevClose, 0);
          fill += intervalSec;
        }
      }
      // If gap is larger than maxGapFill: jump — open still links via prevClose for continuity.

      curBucket = bSec;
      open = prevClose;
      high = Math.max(prevClose, p.value);
      low = Math.min(prevClose, p.value);
      close = p.value;
      vol = p.volume ?? 0;
      continue;
    }

    high = Math.max(high, p.value);
    low = Math.min(low, p.value);
    close = p.value;
    vol += p.volume ?? 0;
  }

  pushBucket(curBucket, open, high, low, close, vol);

  if (extendToNow) {
    const endBucket = Math.floor(nowSec / intervalSec) * intervalSec;
    let fill = curBucket + intervalSec;
    let n = 0;
    while (fill <= endBucket && n < maxGapFill) {
      pushBucket(fill, close, close, close, close, 0);
      fill += intervalSec;
      n += 1;
    }
  }

  return { candles, volumes };
}
