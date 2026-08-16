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
  /**
   * If true, appends flat candles from the last trade up to "now".
   * Off by default — Pump-style charts only print when a trade happens.
   */
  extendToNow?: boolean;
  /** Override "now" (unix seconds). Defaults to current time. */
  nowSec?: number;
  /**
   * Max empty buckets to insert between real trades (flat OHLC, zero volume).
   * Default 0: no empty candles. Only intervals that contain at least one trade are drawn.
   */
  maxGapFillBuckets?: number;
  /** First bonding print: open at 0, close at first mcap/price. */
  genesisFromZero?: boolean;
};

function bucketStartSec(tsMs: number, intervalSec: number): number {
  const tSec = Math.floor(tsMs / 1000);
  return Math.floor(tSec / intervalSec) * intervalSec;
}

/**
 * Build OHLC candles from raw trade points.
 *
 * - Same-bucket trades update high/low/close (buy then sell in the same 1m = one wick).
 * - New bucket OPEN = previous close so the series stays continuous (Pump-style).
 * - Empty intervals are skipped (no flat runway). Set maxGapFillBuckets > 0 only if needed.
 */
export function buildCandles(
  points: CurveTradePoint[],
  intervalSec: number,
  opts?: BuildOpts,
): { candles: Candle[]; volumes: VolumeBar[] } {
  const extendToNow = !!opts?.extendToNow;
  const nowSec = Math.floor(opts?.nowSec ?? Date.now() / 1000);
  const maxGapFill =
    opts?.maxGapFillBuckets === undefined ? 0 : Math.max(0, Math.floor(opts.maxGapFillBuckets));

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
  const genesis = opts?.genesisFromZero === true;
  let open = genesis ? 0 : sorted[0].value;
  let high = sorted[0].value;
  let low = genesis ? 0 : sorted[0].value;
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
      // Jump to the next print. Open links to prev close so bodies stay continuous.
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
