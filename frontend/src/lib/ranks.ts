export const RANK_SEQUENCE = ["Recruit", "Soldier", "Corporal", "Captain", "General"] as const;

export type RankName = (typeof RANK_SEQUENCE)[number];

export type PendingRankPromotion = {
  chainId: number;
  address: string;
  oldRank: RankName;
  newRank: RankName;
  createdAt: number;
};

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

function normalizeAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
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
  return `🔥 Promoted to ${resolved} on MemeWarzone\n\nStatus earned. Rank unlocked. Next stop: General ⚔️\n\nJoin the battle: https://memewar.zone`;
}

export function getRankStorageKey(chainId: number | string, address: string): string {
  return `mwz:last-rank:${String(chainId)}:${normalizeAddress(address)}`;
}

export function readStoredRank(chainId: number | string, address: string): RankName | null {
  if (typeof window === "undefined") return null;
  const addr = normalizeAddress(address);
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
  const addr = normalizeAddress(address);
  if (!addr) return;

  try {
    window.localStorage.setItem(getRankStorageKey(chainId, addr), normalizeRank(rank));
  } catch {
    // ignore storage failures
  }
}

export function getPendingRankPromotionStorageKey(chainId: number | string, address: string): string {
  return `mwz:pending-rank-promotion:${String(chainId)}:${normalizeAddress(address)}`;
}

export function readPendingRankPromotion(
  chainId: number | string,
  address: string
): PendingRankPromotion | null {
  if (typeof window === "undefined") return null;
  const addr = normalizeAddress(address);
  if (!addr) return null;

  try {
    const raw = window.localStorage.getItem(getPendingRankPromotionStorageKey(chainId, addr));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingRankPromotion> | null;
    if (!parsed) return null;

    const parsedAddress = normalizeAddress(parsed.address ?? addr);
    if (parsedAddress !== addr) return null;

    return {
      chainId: Number(parsed.chainId ?? chainId) || Number(chainId) || 0,
      address: addr,
      oldRank: normalizeRank(parsed.oldRank),
      newRank: normalizeRank(parsed.newRank),
      createdAt: Number(parsed.createdAt ?? Date.now()) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function writePendingRankPromotion(
  chainId: number | string,
  address: string,
  oldRank: unknown,
  newRank: unknown
): void {
  if (typeof window === "undefined") return;
  const addr = normalizeAddress(address);
  if (!addr) return;

  const payload: PendingRankPromotion = {
    chainId: Number(chainId) || 0,
    address: addr,
    oldRank: normalizeRank(oldRank),
    newRank: normalizeRank(newRank),
    createdAt: Date.now(),
  };

  try {
    window.localStorage.setItem(
      getPendingRankPromotionStorageKey(chainId, addr),
      JSON.stringify(payload)
    );
  } catch {
    // ignore storage failures
  }
}

export function clearPendingRankPromotion(chainId: number | string, address: string): void {
  if (typeof window === "undefined") return;
  const addr = normalizeAddress(address);
  if (!addr) return;

  try {
    window.localStorage.removeItem(getPendingRankPromotionStorageKey(chainId, addr));
  } catch {
    // ignore storage failures
  }
}
