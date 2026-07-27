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
  description: "BSC Testnet only. Rehearse graduation, LP locking, DEX trading, and fee collection.",
  targetWei: TEST_GRADUATION_TARGET_WEI,
  testOnly: true,
};

export function isTestGraduationTierEnabled(chainId: number): boolean {
  const raw = String(import.meta.env.VITE_ENABLE_TEST_GRADUATION_THRESHOLD || "").trim().toLowerCase();
  return Number(chainId) === 97 && TRUE_VALUES.has(raw);
}

export function getGraduationTiers(chainId: number): GraduationTier[] {
  return isTestGraduationTierEnabled(chainId)
    ? [...STANDARD_GRADUATION_TIERS, TEST_GRADUATION_TIER]
    : [...STANDARD_GRADUATION_TIERS];
}

export function isSupportedGraduationTarget(chainId: number, targetWei: bigint): boolean {
  return getGraduationTiers(chainId).some((tier) => tier.targetWei === targetWei);
}

export function graduationTierLabel(targetWei: bigint): string {
  return [...STANDARD_GRADUATION_TIERS, TEST_GRADUATION_TIER].find((tier) => tier.targetWei === targetWei)?.label || "$30K";
}
