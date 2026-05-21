import type { CommanderStreakState, CommanderWeeklyReward } from "@/features/postgrad/contracts";
import { pushMockActivity } from "@/features/postgrad/mockActivityRuntime";

const STORAGE_KEY = "mwz:postgrad:mock-commander-streak";
const UPDATE_EVENT = "mwz:postgrad-mock-commander-streak-updated";
const WEEKLY_GOAL_DAYS = 7;
const CHECK_IN_INTERVAL_MS = 24 * 60 * 60 * 1000;

type MockCommanderStreakRuntimeState = {
  currentStreakDays: number;
  bestStreakDays: number;
  weekProgressDays: number;
  rewardCycle: number;
  claimedRewardsCount: number;
  nextCheckInAt: string;
  lastClaimedRewardLabel?: string;
  lastClaimedAt?: string;
};

const REWARD_ROTATION: Array<Omit<CommanderWeeklyReward, "id" | "unlockAtDays" | "status">> = [
  {
    label: "War Room watchlist boost",
    description: "Unlock a temporary watchlist visibility boost for this week’s scouting cycle.",
    tier: "watchlist_boost",
  },
  {
    label: "Featured slot draw",
    description: "Enter the mock featured-placement draw for a prime Arena placement rotation.",
    tier: "featured_slot_draw",
  },
  {
    label: "War Pool fee rebate",
    description: "Apply a mock rebate token to the next War Pool support action in the sandbox.",
    tier: "fee_rebate",
  },
  {
    label: "War Pool credit",
    description: "Bank a mock support credit for the next featured battle settlement test.",
    tier: "war_pool_credit",
  },
];

function isBrowser() {
  return typeof window !== "undefined";
}

function dispatchCommanderStreakUpdate() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function getNextCheckInAt(offsetMs = CHECK_IN_INTERVAL_MS) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createDefaultState(): MockCommanderStreakRuntimeState {
  return {
    currentStreakDays: 4,
    bestStreakDays: 6,
    weekProgressDays: 4,
    rewardCycle: 0,
    claimedRewardsCount: 0,
    nextCheckInAt: getNextCheckInAt(12 * 60 * 60 * 1000),
  };
}

function normalizeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeState(input: Partial<MockCommanderStreakRuntimeState> | null | undefined): MockCommanderStreakRuntimeState {
  const base = createDefaultState();
  return {
    currentStreakDays: normalizeCount(input?.currentStreakDays) || base.currentStreakDays,
    bestStreakDays: Math.max(normalizeCount(input?.bestStreakDays), normalizeCount(input?.currentStreakDays), base.bestStreakDays),
    weekProgressDays: Math.min(WEEKLY_GOAL_DAYS, normalizeCount(input?.weekProgressDays) || base.weekProgressDays),
    rewardCycle: normalizeCount(input?.rewardCycle),
    claimedRewardsCount: normalizeCount(input?.claimedRewardsCount),
    nextCheckInAt: typeof input?.nextCheckInAt === "string" ? input.nextCheckInAt : base.nextCheckInAt,
    lastClaimedRewardLabel: typeof input?.lastClaimedRewardLabel === "string" ? input.lastClaimedRewardLabel : undefined,
    lastClaimedAt: typeof input?.lastClaimedAt === "string" ? input.lastClaimedAt : undefined,
  };
}

function readRuntimeState(): MockCommanderStreakRuntimeState {
  if (!isBrowser()) return createDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

function writeRuntimeState(next: MockCommanderStreakRuntimeState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  dispatchCommanderStreakUpdate();
}

function resolveActiveReward(runtime: MockCommanderStreakRuntimeState): CommanderWeeklyReward {
  const template = REWARD_ROTATION[runtime.rewardCycle % REWARD_ROTATION.length];
  return {
    id: `commander-reward-cycle-${runtime.rewardCycle + 1}`,
    label: template.label,
    description: template.description,
    tier: template.tier,
    unlockAtDays: WEEKLY_GOAL_DAYS,
    status: runtime.weekProgressDays >= WEEKLY_GOAL_DAYS ? "claimable" : "locked",
  };
}

function resolveCommanderStreak(runtime: MockCommanderStreakRuntimeState): CommanderStreakState {
  return {
    currentStreakDays: runtime.currentStreakDays,
    bestStreakDays: runtime.bestStreakDays,
    weekProgressDays: runtime.weekProgressDays,
    weeklyGoalDays: WEEKLY_GOAL_DAYS,
    rewardCycle: runtime.rewardCycle,
    claimedRewardsCount: runtime.claimedRewardsCount,
    nextCheckInAt: runtime.nextCheckInAt,
    activeReward: resolveActiveReward(runtime),
    lastClaimedRewardLabel: runtime.lastClaimedRewardLabel,
    lastClaimedAt: runtime.lastClaimedAt,
  };
}

export function getResolvedCommanderStreak() {
  return resolveCommanderStreak(readRuntimeState());
}

export function subscribeToMockCommanderStreakRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function resetMockCommanderStreakRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  dispatchCommanderStreakUpdate();
  pushMockActivity("war_room", "Commander streak reset", "Daily streak progress and weekly reward state returned to baseline.");
}

export function recordMockCommanderCheckIn() {
  const runtime = readRuntimeState();
  const nextWeekProgressDays = Math.min(WEEKLY_GOAL_DAYS, runtime.weekProgressDays + 1);
  const nextCurrentStreakDays = runtime.currentStreakDays + 1;
  const next: MockCommanderStreakRuntimeState = {
    ...runtime,
    currentStreakDays: nextCurrentStreakDays,
    bestStreakDays: Math.max(runtime.bestStreakDays, nextCurrentStreakDays),
    weekProgressDays: nextWeekProgressDays,
    nextCheckInAt: getNextCheckInAt(),
  };

  writeRuntimeState(next);

  if (nextWeekProgressDays >= WEEKLY_GOAL_DAYS && runtime.weekProgressDays < WEEKLY_GOAL_DAYS) {
    pushMockActivity("war_room", "Weekly reward unlocked", `${resolveActiveReward(next).label} is now ready to claim.`);
  } else {
    pushMockActivity("war_room", "Commander streak advanced", `Daily check-in logged. Week progress is now ${nextWeekProgressDays}/${WEEKLY_GOAL_DAYS}.`);
  }

  return resolveCommanderStreak(next);
}

export function claimMockWeeklyReward() {
  const runtime = readRuntimeState();
  if (runtime.weekProgressDays < WEEKLY_GOAL_DAYS) return null;

  const reward = resolveActiveReward(runtime);
  const claimedAt = new Date().toISOString();
  const next: MockCommanderStreakRuntimeState = {
    ...runtime,
    weekProgressDays: 0,
    rewardCycle: runtime.rewardCycle + 1,
    claimedRewardsCount: runtime.claimedRewardsCount + 1,
    nextCheckInAt: getNextCheckInAt(12 * 60 * 60 * 1000),
    lastClaimedRewardLabel: reward.label,
    lastClaimedAt: claimedAt,
  };

  writeRuntimeState(next);
  pushMockActivity("war_room", "Weekly reward claimed", `${reward.label} claimed from the commander streak lane.`);
  return reward;
}
