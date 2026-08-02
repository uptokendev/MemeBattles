import type { CurveTradePoint } from "@/hooks/useCurveTrades";

/**
 * Wallet reports / optimistic UI use synthetic log indices (>= 1e6).
 * Some older reports used 0. On-chain pool scans use real log indices.
 *
 * Chart + trade tab must show at most ONE row per transaction hash for Topaz
 * fills — multi-log same-tx is rare and double-counting breaks mcap.
 */
export const SYNTHETIC_LOG_INDEX_MIN = 1_000_000;

export function isSyntheticLogIndex(logIndex: unknown): boolean {
  const n = Number(logIndex);
  // 0 / missing / huge synthetic marker → not a trusted chain log index.
  if (!Number.isFinite(n) || n <= 0) return true;
  if (n >= SYNTHETIC_LOG_INDEX_MIN) return true;
  return false;
}

export function tradeDedupeKey(point: Pick<CurveTradePoint, "txHash" | "logIndex">): string {
  const tx = String(point.txHash || "").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(tx)) return "";
  // One market row per tx — logIndex only ranks quality, it does not split rows.
  return tx;
}

function tradeQuality(point: CurveTradePoint): number {
  let score = 0;
  if (!isSyntheticLogIndex(point.logIndex)) score += 100;
  if (Number(point.blockNumber || 0) > 0) score += 20;
  try {
    if (point.tokensWei > 0n) score += 5;
    if (point.nativeWei > 0n) score += 5;
  } catch {
    // ignore
  }
  if (Number(point.pricePerToken || 0) > 0) score += 2;
  // Prefer real log indices when both are "real".
  if (!isSyntheticLogIndex(point.logIndex)) {
    score += Math.min(50, Math.max(0, Number(point.logIndex) || 0) % 50);
  }
  return score;
}

/**
 * Merge bonding + Topaz scan + wallet reports + optimistic local into one stream.
 * Same txHash always collapses to the highest-quality row (on-chain wins).
 */
export function mergeTradePoints(...streams: Array<CurveTradePoint[] | null | undefined>): CurveTradePoint[] {
  const byTx = new Map<string, CurveTradePoint>();

  for (const stream of streams) {
    for (const point of stream || []) {
      const tx = String(point.txHash || "").toLowerCase();
      if (!/^0x[a-f0-9]{64}$/.test(tx)) continue;
      const prev = byTx.get(tx);
      if (!prev || tradeQuality(point) >= tradeQuality(prev)) {
        byTx.set(tx, point);
      }
    }
  }

  return Array.from(byTx.values()).sort(
    (a, b) =>
      Number(a.timestamp || 0) - Number(b.timestamp || 0) ||
      Number(a.blockNumber || 0) - Number(b.blockNumber || 0) ||
      Number(a.logIndex || 0) - Number(b.logIndex || 0),
  );
}
