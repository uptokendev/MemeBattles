export type TF = "5s" | "1m" | "5m" | "15m" | "1h";

export const TIMEFRAMES: TF[] = ["5s", "1m", "5m", "15m", "1h"];

const TF_SECONDS: Record<TF, number> = {
  "5s": 5,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600
};

export function bucketStart(tsSec: number, tf: TF): number {
  const s = TF_SECONDS[tf];
  return Math.floor(tsSec / s) * s;
}
