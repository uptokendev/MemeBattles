export const RANK_SEQUENCE = ["Recruit", "Soldier", "Corporal", "Captain", "General"] as const;

export type RankName = (typeof RANK_SEQUENCE)[number];

const FALLBACK_RANK: RankName = "Recruit";

const RANK_LOOKUP = new Map<string, RankName>(
  RANK_SEQUENCE.map((rank) => [rank.toLowerCase(), rank])
);

function sanitizeRankValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeRank(value: unknown): RankName {
  const normalized = sanitizeRankValue(value);
  if (!normalized) return FALLBACK_RANK;
  return RANK_LOOKUP.get(normalized) ?? FALLBACK_RANK;
}

export function getRankIndex(value: unknown): number {
  return RANK_SEQUENCE.indexOf(normalizeRank(value));
}

export function isRankUpgrade(nextRank: unknown, previousRank: unknown): boolean {
  return getRankIndex(nextRank) > getRankIndex(previousRank);
}

export function getRankBadgeSrc(rank: unknown): string {
  return `/assets/ranks/${normalizeRank(rank).toLowerCase()}.png`;
}

export function buildRankShareText(rank: unknown): string {
  const resolved = normalizeRank(rank);
  return `🔥 Just got promoted to ${resolved} on MemeWarzone\n\nClimbing the ranks in the warzone ⚔️\n\nJoin the battle: https://memewar.zone`;
}

export function getRankStorageKey(chainId: number | string, address: string): string {
  return `mwz:last-rank:${String(chainId)}:${String(address).trim().toLowerCase()}`;
}

export function readStoredRank(chainId: number | string, address: string): RankName | null {
  if (typeof window === "undefined") return null;
  const addr = String(address ?? "").trim().toLowerCase();
  if (!addr) return null;

  try {
    const raw = window.localStorage.getItem(getRankStorageKey(chainId, addr));
    if (!raw) return null;
    return normalizeRank(raw);
  } catch {
    return null;
  }
}

export function writeStoredRank(chainId: number | string, address: string, rank: unknown): void {
  if (typeof window === "undefined") return;
  const addr = String(address ?? "").trim().toLowerCase();
  if (!addr) return;

  try {
    window.localStorage.setItem(getRankStorageKey(chainId, addr), normalizeRank(rank));
  } catch {
    // ignore storage failures
  }
}
