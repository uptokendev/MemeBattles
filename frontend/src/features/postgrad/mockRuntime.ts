import type { Battle } from "@/features/postgrad/contracts";
import { POST_GRAD_BATTLE_TRANSITIONS } from "@/features/postgrad/contracts";
import { pushMockActivity } from "@/features/postgrad/mockActivityRuntime";
import { getMockBattleById, liveBattles, openForBattleQueue } from "@/features/postgrad/mockRegistry";

const STORAGE_KEY = "mwz:postgrad:mock-battles";
const ARCHIVE_STORAGE_KEY = "mwz:postgrad:mock-battle-archive";
const UPDATE_EVENT = "mwz:postgrad-mock-battles-updated";

type MockBattleRuntimeState = {
  state: Battle["state"];
  startedAt?: string;
  endsAt?: string;
  settlementAt?: string;
};

type MockBattleRuntimeMap = Record<string, MockBattleRuntimeState>;

type MockArchivedBattle = {
  battle: Battle;
  archivedAt: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function readRuntimeMap(): MockBattleRuntimeMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRuntimeMap(next: MockBattleRuntimeMap) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function readArchive(): MockArchivedBattle[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArchive(next: MockArchivedBattle[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(next));
}

function archiveBattle(battle: Battle) {
  const nextArchive: MockArchivedBattle[] = [
    {
      battle,
      archivedAt: new Date().toISOString(),
    },
    ...readArchive().filter((entry) => entry.battle.id !== battle.id),
  ];

  writeArchive(nextArchive);
}

function futureIso(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function mergeBattle(base: Battle): Battle {
  const overrides = readRuntimeMap()[base.id];
  if (!overrides) return base;
  return {
    ...base,
    state: overrides.state,
    startedAt: overrides.startedAt ?? base.startedAt,
    endsAt: overrides.endsAt ?? base.endsAt,
    settlementAt: overrides.settlementAt ?? base.settlementAt,
  };
}

export function getResolvedMockBattleById(battleId?: string | null) {
  const base = getMockBattleById(battleId);
  return base ? mergeBattle(base) : null;
}

export function getResolvedLiveBattles() {
  return liveBattles.map(mergeBattle);
}

export function getResolvedOpenForBattleQueue() {
  return openForBattleQueue.map(mergeBattle);
}

export function getResolvedArchivedBattles() {
  return readArchive();
}

export function subscribeToMockBattleRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function resetMockBattleRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(ARCHIVE_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  pushMockActivity("battle", "Battle sandbox reset", "Battle lifecycle state returned to its baseline mock setup.");
}

export function transitionMockBattle(battleId: string, nextState: Battle["state"]) {
  const battle = getResolvedMockBattleById(battleId);
  if (!battle) return false;

  const allowed = POST_GRAD_BATTLE_TRANSITIONS[battle.state] ?? [];
  if (!allowed.includes(nextState)) return false;

  const nextMap = readRuntimeMap();
  const nextEntry: MockBattleRuntimeState = {
    state: nextState,
    startedAt: battle.startedAt,
    endsAt: battle.endsAt,
    settlementAt: battle.settlementAt,
  };

  if (nextState === "accepted") {
    nextEntry.endsAt = futureIso(20);
  }

  if (nextState === "live") {
    nextEntry.startedAt = new Date().toISOString();
    nextEntry.endsAt = futureIso(15);
    nextEntry.settlementAt = futureIso(18);
  }

  if (nextState === "completed") {
    nextEntry.endsAt = new Date().toISOString();
    nextEntry.settlementAt = futureIso(3);
  }

  if (nextState === "settled") {
    nextEntry.settlementAt = new Date().toISOString();
  }

  nextMap[battleId] = nextEntry;
  writeRuntimeMap(nextMap);

  const resolvedNextBattle: Battle = {
    ...battle,
    state: nextEntry.state,
    startedAt: nextEntry.startedAt ?? battle.startedAt,
    endsAt: nextEntry.endsAt ?? battle.endsAt,
    settlementAt: nextEntry.settlementAt ?? battle.settlementAt,
  };

  if (nextState === "settled") {
    archiveBattle(resolvedNextBattle);
  }

  pushMockActivity("battle", "Battle state changed", `${battle.participants[0].symbol} vs ${battle.participants[1].symbol}: ${battle.state.replaceAll("_", " ")} → ${nextState.replaceAll("_", " ")}.`);
  return true;
}
