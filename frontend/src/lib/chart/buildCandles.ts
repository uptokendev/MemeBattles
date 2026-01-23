// src/lib/chart/buildCandles.ts

/**
 * Generic chart input point.
 * You control what "value" represents (e.g. marketCapUsd).
 */
export type CurveTradePoint = {
  ts: number; // milliseconds
  value: number; // e.g. marketCapUsd
  volume?: number; // optional (USD)
};

export type Candle = {
  time: number; // unix seconds (Lightweight Charts format)
  open: number;
  high: number;
  low: number;
  close: number;
};

export type VolumeBar = {
  time: number; // unix seconds
  value: number;
  color?: string;
};

type BuildOpts = {
  /** If true, fills gaps and extends candles up to "now" with flat candles. */
  extendToNow?: boolean;
  /** Override "now" (unix seconds). Defaults to current time. */
  nowSec?: number;
};

function bucketStartSec(tsMs: number, intervalSec: number): number {
  const tSec = Math.floor(tsMs / 1000);
  return Math.floor(tSec / intervalSec) * intervalSec;
}

/**
 * Build OHLC candles from raw points.
 *
 * Key behavior (for your TradingView-like experience):
 * - If extendToNow is enabled, the function:
 *   - fills missing buckets between trades with flat candles
 *   - extends to the current bucket (so 5s/1m/5m always keeps printing)
 */
export function buildCandles(
  points: CurveTradePoint[],
  intervalSec: number,
  opts?: BuildOpts
): { candles: Candle[]; volumes: VolumeBar[] } {
  const extendToNow = !!opts?.extendToNow;
  const nowSec = Math.floor(opts?.nowSec ?? Date.now() / 1000);

  if (!intervalSec || intervalSec <= 0) return { candles: [], volumes: [] };

  const sorted = (points || [])
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.value))
    .slice()
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length === 0) return { candles: [], volumes: [] };

  const candles: Candle[] = [];
  const volumes: VolumeBar[] = [];

  let curBucket = bucketStartSec(sorted[0].ts, intervalSec);
  let open = sorted[0].value;
  let high = sorted[0].value;
  let low = sorted[0].value;
  let close = sorted[0].value;
  let vol = sorted[0].volume ?? 0;

  const pushBucket = (bucketSec: number, o: number, h: number, l: number, c: number, v: number) => {
    candles.push({ time: bucketSec, open: o, high: h, low: l, close: c });
    volumes.push({ time: bucketSec, value: v });
  };

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const bSec = bucketStartSec(p.ts, intervalSec);

    // new bucket (or gap)
    if (bSec !== curBucket) {
      // finalize current
      pushBucket(curBucket, open, high, low, close, vol);

      // fill gaps with flat candles (close->open) so chart does not "teleport"
      if (bSec > curBucket + intervalSec) {
        let fill = curBucket + intervalSec;
        while (fill < bSec) {
          pushBucket(fill, close, close, close, close, 0);
          fill += intervalSec;
        }
      }

      // start new
      curBucket = bSec;
      open = p.value;
      high = p.value;
      low = p.value;
      close = p.value;
      vol = p.volume ?? 0;
      continue;
    }

    // same bucket update
    high = Math.max(high, p.value);
    low = Math.min(low, p.value);
    close = p.value;
    vol += p.volume ?? 0;
  }

  // finalize last real bucket
  pushBucket(curBucket, open, high, low, close, vol);

  if (extendToNow) {
    const endBucket = Math.floor(nowSec / intervalSec) * intervalSec;
    let fill = curBucket + intervalSec;
    while (fill <= endBucket) {
      // flat candles until now
      pushBucket(fill, close, close, close, close, 0);
      fill += intervalSec;
    }
  }

  return { candles, volumes };
}