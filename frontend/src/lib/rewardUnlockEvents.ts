import type { RewardItem } from "@/lib/rewardsApi";

export const REWARD_UNLOCKING_EVENT = "memebattles:reward-unlocking";
export const REWARD_RECORDED_EVENT = "memebattles:reward-recorded";
export const LEAGUE_CLAIM_UNLOCKING_EVENT = "memebattles:league-claim-unlocking";
export const LEAGUE_CLAIM_RECORDED_EVENT = "memebattles:league-claim-recorded";

export type RewardUnlockSource =
  | "league"
  | "airdrop"
  | "recruiter"
  | "squad"
  | "battle"
  | "tournament"
  | "achievement";

export type RewardUnlockPresentation = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  currency?: string;
  destinationLabel?: string;
  destinationPath?: string;
  destinationHash?: string;
  destinationFocusEvent?: string;
};

export type RewardUnlockDetail = {
  source?: RewardUnlockSource;
  reward: RewardItem;
  chainId: number;
  recipient: string;
  txHash: string | null;
  claimedAt: string;
  presentation?: RewardUnlockPresentation;
};

export function emitRewardUnlockEvent(name: string, detail: RewardUnlockDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RewardUnlockDetail>(name, { detail }));
}

export function emitRewardUnlocking(detail: RewardUnlockDetail, legacyEvent?: string) {
  emitRewardUnlockEvent(REWARD_UNLOCKING_EVENT, detail);
  if (legacyEvent) emitRewardUnlockEvent(legacyEvent, detail);
}

export function emitRewardRecorded(detail: RewardUnlockDetail, legacyEvent?: string) {
  emitRewardUnlockEvent(REWARD_RECORDED_EVENT, detail);
  if (legacyEvent) emitRewardUnlockEvent(legacyEvent, detail);
}

export function waitForRewardUnlockFlight() {
  if (typeof window === "undefined") return Promise.resolve();
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 120 : 780));
}
