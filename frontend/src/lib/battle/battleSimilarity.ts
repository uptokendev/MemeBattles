import type { Battle, BattleParticipant } from "@/features/postgrad/contracts";

/**
 * Battlefield similarity scoring (client + future backend portable).
 * Uses exactly the three metrics that drive battle resolution:
 *   - marketCapUsd
 *   - holderCount (falls back to holders)
 *   - volumeUsd (prefers volumeUsd, falls back to volume24hUsd)
 *
 * Higher score (0..1) = more similar battlefield profile.
 * Designed so the same normalization/averaging logic can be reused
 * later when the backend computes actual battle winner scores.
 */

export type BattlefieldMetrics = {
  marketCapUsd: number;
  holderCount: number;
  volumeUsd: number;
};

export type RivalCandidate = {
  battle: Battle;
  participant: BattleParticipant;
  metrics: BattlefieldMetrics;
  similarity?: number; // populated after scoring against a reference
};

export function extractBattlefieldMetrics(p: BattleParticipant | any): BattlefieldMetrics {
  const mc = Number(p?.marketCapUsd ?? p?.marketCap ?? 0);
  const h = Number(p?.holderCount ?? p?.holders ?? 0);
  const v = Number(p?.volumeUsd ?? p?.volume24hUsd ?? p?.volume24h ?? 0);
  return {
    marketCapUsd: Number.isFinite(mc) ? Math.max(0, mc) : 0,
    holderCount: Number.isFinite(h) ? Math.max(0, Math.floor(h)) : 0,
    volumeUsd: Number.isFinite(v) ? Math.max(0, v) : 0,
  };
}

export function getOpenRivals(openForBattleQueue: Battle[]): RivalCandidate[] {
  return (openForBattleQueue || [])
    .filter((b) => b?.state === "open_for_battle" && Array.isArray(b.participants) && b.participants.length > 0)
    .map((battle) => {
      // For open queue, the waiting coin is typically the first participant
      const participant = battle.participants[0];
      if (!participant) return null;
      return {
        battle,
        participant,
        metrics: extractBattlefieldMetrics(participant),
      } as RivalCandidate;
    })
    .filter(Boolean) as RivalCandidate[];
}

/**
 * Compute similarity between two metric sets.
 * Uses log-ratio for wide-range fields (MC/volume) + relative diff for holders.
 * Weights chosen to emphasize the primary battle drivers (MC + volume first).
 */
export function calculateBattlefieldSimilarity(a: BattlefieldMetrics, b: BattlefieldMetrics): number {
  const safeLogRatio = (x: number, y: number): number => {
    if (!x || !y || x <= 0 || y <= 0) return 3.0; // treat as very different
    return Math.abs(Math.log(x / y));
  };

  // MC closeness (log scale)
  const mcPenalty = safeLogRatio(a.marketCapUsd, b.marketCapUsd);
  const mcScore = 1 / (1 + mcPenalty * 0.65);

  // Volume closeness (log scale)
  const volPenalty = safeLogRatio(a.volumeUsd, b.volumeUsd);
  const volScore = 1 / (1 + volPenalty * 0.65);

  // Holder closeness (relative linear)
  const hSum = (a.holderCount + b.holderCount) || 1;
  const hDiff = Math.abs(a.holderCount - b.holderCount);
  const hScore = 1 / (1 + (hDiff / hSum) * 0.9);

  // Weighted blend — MC and volume dominate as they will in future scoring
  const raw = mcScore * 0.42 + volScore * 0.38 + hScore * 0.20;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Score an array of open rivals against a reference coin's metrics.
 * Returns new array sorted by similarity (highest first).
 */
export function rankRivalsBySimilarity(
  rivals: RivalCandidate[],
  reference: BattlefieldMetrics | null,
): RivalCandidate[] {
  if (!reference || !rivals.length) return rivals;

  return [...rivals]
    .map((r) => ({
      ...r,
      similarity: calculateBattlefieldSimilarity(reference, r.metrics),
    }))
    .sort((x, y) => (y.similarity ?? 0) - (x.similarity ?? 0));
}

/**
 * Pick a sensible "reference" coin from the user's created coins for autoselect.
 * Prefers higher market cap / more active coins. Falls back to first.
 */
export function pickReferenceCoinForAutoselect(createdCoins: Array<{ raw?: any; marketCap?: string | number }>): BattlefieldMetrics | null {
  if (!createdCoins?.length) return null;

  // Try to find the one with largest MC string/number
  let best: any = createdCoins[0];
  let bestMc = -1;

  for (const c of createdCoins) {
    const mcRaw = c?.raw?.marketCap ?? c?.raw?.stats?.marketCap ?? c?.marketCap ?? "0";
    const mc = typeof mcRaw === "number" ? mcRaw : parseFloat(String(mcRaw).replace(/[^0-9.]/g, "")) || 0;
    if (mc > bestMc) {
      bestMc = mc;
      best = c;
    }
  }

  // Fabricate a reference from whatever we have (we only have string MC in created list today).
  // In practice the open queue gives full numeric; for reference we can use a proxy or
  // let caller supply better data later. Here we synthesize plausible holders/vol from MC.
  const mc = Math.max(1000, bestMc || 25000);
  // Heuristic: larger MC coins tend to have more holders and volume
  const holders = Math.max(80, Math.floor(Math.sqrt(mc) * 1.8));
  const vol = Math.max(500, Math.floor(mc * (0.6 + Math.random() * 0.8)));

  return {
    marketCapUsd: mc,
    holderCount: holders,
    volumeUsd: vol,
  };
}

export function formatCompactBattleMetric(value: number, kind: "mc" | "holders" | "vol"): string {
  if (kind === "holders") {
    if (value >= 10000) return `${Math.round(value / 1000)}k`;
    return Math.round(value).toLocaleString();
  }
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${Math.round(value).toLocaleString()}`;
}
