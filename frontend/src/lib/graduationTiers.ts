const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const GRADUATION_WAD = 10n ** 18n;
export const DEFAULT_GRADUATION_TARGET_WEI = 30_000n * GRADUATION_WAD;
export const TEST_GRADUATION_TARGET_WEI = 6n * GRADUATION_WAD;

export type GraduationTier = {
  id: "fast" | "normal" | "deep" | "test";
  label: string;
  title: string;
  description: string;
  targetWei: bigint;
  testOnly?: boolean;
};

export const STANDARD_GRADUATION_TIERS: readonly GraduationTier[] = [
  {
    id: "fast",
    label: "$15K",
    title: "Fast grad",
    description: "Shorter bonding phase for a faster route into DEX liquidity.",
    targetWei: 15_000n * GRADUATION_WAD,
  },
  {
    id: "normal",
    label: "$30K",
    title: "Normal bond",
    description: "Balanced default with room for discovery, activity, and community growth.",
    targetWei: DEFAULT_GRADUATION_TARGET_WEI,
  },
  {
    id: "deep",
    label: "$50K",
    title: "Deep liquidity",
    description: "Longer bonding phase designed to seed stronger DEX liquidity.",
    targetWei: 50_000n * GRADUATION_WAD,
  },
] as const;

export const TEST_GRADUATION_TIER: GraduationTier = {
  id: "test",
  label: "$6",
  title: "Test grad",
  description:
    "Dev/test only (BNB testnet + Solana). Rehearse graduation, LP lock, DEX trading, and fees without a $15k bond.",
  targetWei: TEST_GRADUATION_TARGET_WEI,
  testOnly: true,
};

/** Chains that may expose the $6 test graduation threshold. */
export function isTestGraduationChain(chainId: number): boolean {
  const id = Number(chainId);
  return id === 97 || id === 101 || id === 102;
}

export function isTestGraduationTierEnabled(chainId: number): boolean {
  if (!isTestGraduationChain(chainId)) return false;
  const raw = String(import.meta.env.VITE_ENABLE_TEST_GRADUATION_THRESHOLD ?? "").trim().toLowerCase();
  // Default ON for test chains when env is unset (same as Create.tsx historical default).
  if (!raw) return true;
  return TRUE_VALUES.has(raw);
}

/** Solana V4 create uses USD micros (1 USD = 1_000_000). BNB UI stores wei-scale USD wad. */
export function graduationTargetToUsdMicros(targetWei: bigint | string | number): string {
  try {
    const raw = typeof targetWei === "bigint" ? targetWei : BigInt(String(targetWei || "0"));
    if (raw <= 0n) return "6000000";
    // Already micros (e.g. 6_000_000 for $6).
    if (raw < 1_000_000_000_000n) return raw.toString();
    // Wei-scale USD wad: dollars * 10^18 → micros = dollars * 10^6.
    const dollars = raw / GRADUATION_WAD;
    if (dollars <= 0n) return "6000000";
    return (dollars * 1_000_000n).toString();
  } catch {
    return "6000000";
  }
}

export function getGraduationTiers(chainId: number): GraduationTier[] {
  const withTest = isTestGraduationTierEnabled(chainId);
  // Solana devnet generation currently allows only the $6 mask (bit 0). Prefer the
  // test tier first so creators do not pick $15k/$30k/$50k that on-chain rejects.
  if (Number(chainId) === 101 || Number(chainId) === 102) {
    return withTest ? [TEST_GRADUATION_TIER, ...STANDARD_GRADUATION_TIERS] : [...STANDARD_GRADUATION_TIERS];
  }
  return withTest ? [...STANDARD_GRADUATION_TIERS, TEST_GRADUATION_TIER] : [...STANDARD_GRADUATION_TIERS];
}

/** Default selected target: $6 on Solana/test chains when available, else $30K. */
export function getDefaultGraduationTargetWei(chainId: number): bigint {
  if (isTestGraduationTierEnabled(chainId) && (Number(chainId) === 101 || Number(chainId) === 102 || Number(chainId) === 97)) {
    return TEST_GRADUATION_TARGET_WEI;
  }
  return DEFAULT_GRADUATION_TARGET_WEI;
}

export function isSupportedGraduationTarget(chainId: number, targetWei: bigint): boolean {
  return getGraduationTiers(chainId).some((tier) => tier.targetWei === targetWei);
}

export function graduationTierLabel(targetWei: bigint): string {
  return [...STANDARD_GRADUATION_TIERS, TEST_GRADUATION_TIER].find((tier) => tier.targetWei === targetWei)?.label || "$30K";
}
