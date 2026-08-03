import type { CurveTradePoint } from "@/hooks/useCurveTrades";

/**
 * Wallet reports / optimistic UI use synthetic log indices (>= 1e6).
 * Older reports used 0. On-chain pool/curve logs use real log indices.
 *
 * Bonding must keep multiple REAL logs per tx when they exist (rare, but
 * collapsing all logs to one tx breaks circulating-supply mcap walks).
 * Synthetic rows collapse onto a real log for the same txHash.
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
  if (isSyntheticLogIndex(point.logIndex)) return `${tx}:synthetic`;
  return `${tx}:${Number(point.logIndex)}`;
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
  if (!isSyntheticLogIndex(point.logIndex)) {
    score += Math.min(50, Math.max(0, Number(point.logIndex) || 0) % 50);
  }
  return score;
}

/**
 * Merge bonding + Topaz + wallet reports + optimistic local.
 * - Real chain logs: unique by txHash:logIndex (preserves bonding history).
 * - Synthetic / wallet reports: one per txHash, dropped when a real log exists.
 */
export function mergeTradePoints(...streams: Array<CurveTradePoint[] | null | undefined>): CurveTradePoint[] {
  const byKey = new Map<string, CurveTradePoint>();
  const realTx = new Set<string>();

  for (const stream of streams) {
    for (const point of stream || []) {
      const tx = String(point.txHash || "").toLowerCase();
      if (!/^0x[a-f0-9]{64}$/.test(tx)) continue;
      if (!isSyntheticLogIndex(point.logIndex)) realTx.add(tx);
      const key = tradeDedupeKey(point);
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev || tradeQuality(point) >= tradeQuality(prev)) {
        byKey.set(key, point);
      }
    }
  }

  const out: CurveTradePoint[] = [];
  for (const point of byKey.values()) {
    const tx = String(point.txHash || "").toLowerCase();
    // Drop optimistic/wallet rows once the real chain log is present.
    if (isSyntheticLogIndex(point.logIndex) && realTx.has(tx)) continue;
    out.push(point);
  }

  return out.sort(
    (a, b) =>
      Number(a.timestamp || 0) - Number(b.timestamp || 0) ||
      Number(a.blockNumber || 0) - Number(b.blockNumber || 0) ||
      Number(a.logIndex || 0) - Number(b.logIndex || 0),
  );
}
