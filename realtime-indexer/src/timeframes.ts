export type TF = "5s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

/** Keep in lockstep with UnifiedMarketChart TIMEFRAMES + market-candles API. */
export const TIMEFRAMES: TF[] = ["5s", "1m", "5m", "15m", "30m", "1h", "4h", "1d"];

const TF_SECONDS: Record<TF, number> = {
  "5s": 5,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

export function bucketStart(tsSec: number, tf: TF): number {
  const s = TF_SECONDS[tf];
  return Math.floor(tsSec / s) * s;
}
