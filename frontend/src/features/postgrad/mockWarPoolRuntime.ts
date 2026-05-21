import type { Battle, WarPool } from "@/features/postgrad/contracts";
import { getMockBattleById, battleWarPool } from "@/features/postgrad/mockRegistry";

const STORAGE_KEY = "mwz:postgrad:mock-war-pools";
const UPDATE_EVENT = "mwz:postgrad-mock-war-pools-updated";

type MockWarPoolRuntimeState = {
  state: WarPool["state"];
  cutoffAt: string;
  entries: WarPool["entries"];
};

type MockWarPoolRuntimeMap = Record<string, MockWarPoolRuntimeState>;

export type WarPoolSettlementSummary = {
  winnerTokenId: string | null;
  winnerLabel: string;
  totalPotUsd: number;
  winnerSideUsd: number;
  loserSideUsd: number;
  projectedPayoutMultiple: number;
  routingBreakdown: WarPool["routingBreakdown"];
};

function isBrowser() {
  return typeof window !== "undefined";
}

function dispatchRuntimeUpdate() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function readRuntimeMap(): MockWarPoolRuntimeMap {
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

function writeRuntimeMap(next: MockWarPoolRuntimeMap) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  dispatchRuntimeUpdate();
}

function futureIso(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function getSupportedParticipants(battle: Battle | null) {
  return (battle?.participants ?? []).filter((participant) => !participant.tokenId.startsWith("pending-"));
}

function calculateRouting(totalPotUsd: number): WarPool["routingBreakdown"] {
  return {
    winnersUsd: Math.round(totalPotUsd * 0.85),
    protocolUsd: Math.round(totalPotUsd * 0.05),
    featuredUsd: Math.round(totalPotUsd * 0.1),
  };
}

function sumEntries(entries: WarPool["entries"], sideTokenId?: string) {
  return entries
    .filter((entry) => !sideTokenId || entry.sideTokenId === sideTokenId)
    .reduce((total, entry) => total + entry.amountUsd, 0);
}

function defaultPoolForBattle(battleId: string): WarPool {
  if (battleWarPool.battleId === battleId) {
    const totalPotUsd = sumEntries(battleWarPool.entries) + battleWarPool.totalPotUsd;
    return {
      ...battleWarPool,
      totalPotUsd,
      routingBreakdown: calculateRouting(totalPotUsd),
    };
  }

  const battle = getMockBattleById(battleId);
  const participants = getSupportedParticipants(battle);
  const entries = participants.map((participant, index) => ({
    battleId,
    sideTokenId: participant.tokenId,
    amountUsd: index === 0 ? 1450 : 950,
    enteredAt: futureIso(-12 + index * 3),
    payoutEligible: true,
  }));
  const totalPotUsd = sumEntries(entries);

  return {
    battleId,
    state: battle?.state === "settled" ? "paid" : battle?.state === "completed" ? "settling" : "open",
    totalPotUsd,
    cutoffAt: battle?.endsAt ?? futureIso(30),
    routingBreakdown: calculateRouting(totalPotUsd),
    entries,
  };
}

function mergePool(base: WarPool): WarPool {
  const overrides = readRuntimeMap()[base.battleId];
  const entries = overrides?.entries ?? base.entries;
  const totalPotUsd = sumEntries(entries);

  return {
    ...base,
    state: overrides?.state ?? base.state,
    cutoffAt: overrides?.cutoffAt ?? base.cutoffAt,
    entries,
    totalPotUsd,
    routingBreakdown: calculateRouting(totalPotUsd),
  };
}

export function getResolvedWarPoolByBattleId(battleId?: string | null) {
  if (!battleId) return null;
  return mergePool(defaultPoolForBattle(battleId));
}

export function getWarPoolSettlementSummary(battleId?: string | null): WarPoolSettlementSummary | null {
  const battle = battleId ? getMockBattleById(battleId) : null;
  const pool = getResolvedWarPoolByBattleId(battleId);
  if (!battle || !pool) return null;

  const winner = [...battle.participants].filter((participant) => !participant.tokenId.startsWith("pending-")).sort((left, right) => right.score - left.score)[0];
  const winnerSideUsd = winner ? sumEntries(pool.entries, winner.tokenId) : 0;
  const loserSideUsd = Math.max(0, pool.totalPotUsd - winnerSideUsd);
  const projectedPayoutMultiple = winnerSideUsd > 0 ? pool.routingBreakdown.winnersUsd / winnerSideUsd : 0;

  return {
    winnerTokenId: winner?.tokenId ?? null,
    winnerLabel: winner ? `${winner.tokenName} (${winner.symbol})` : "No winner yet",
    totalPotUsd: pool.totalPotUsd,
    winnerSideUsd,
    loserSideUsd,
    projectedPayoutMultiple,
    routingBreakdown: pool.routingBreakdown,
  };
}

export function getResolvedWarPoolSummary() {
  const battleIds = [battleWarPool.battleId, "battle-mops-vs-gape"];
  const pools = battleIds.map((battleId) => getResolvedWarPoolByBattleId(battleId)).filter((pool): pool is WarPool => Boolean(pool));
  return {
    pools,
    totalPotUsd: pools.reduce((total, pool) => total + pool.totalPotUsd, 0),
    openPools: pools.filter((pool) => pool.state === "open").length,
    lockedPools: pools.filter((pool) => pool.state === "locked" || pool.state === "settling").length,
    paidPools: pools.filter((pool) => pool.state === "paid").length,
  };
}

export function subscribeToMockWarPoolRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function resetMockWarPoolRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  dispatchRuntimeUpdate();
}

export function supportWarPoolSide(battleId: string, sideTokenId: string, amountUsd = 500) {
  const pool = getResolvedWarPoolByBattleId(battleId);
  if (!pool || pool.state !== "open") return false;

  const nextMap = readRuntimeMap();
  const current = nextMap[battleId] ?? {
    state: pool.state,
    cutoffAt: pool.cutoffAt,
    entries: pool.entries,
  };

  nextMap[battleId] = {
    ...current,
    entries: [
      ...current.entries,
      {
        battleId,
        sideTokenId,
        amountUsd,
        enteredAt: new Date().toISOString(),
        payoutEligible: true,
      },
    ],
  };

  writeRuntimeMap(nextMap);
  return true;
}

export function transitionMockWarPool(battleId: string, nextState: WarPool["state"]) {
  const pool = getResolvedWarPoolByBattleId(battleId);
  if (!pool) return false;

  const allowed: Record<WarPool["state"], WarPool["state"][]> = {
    open: ["locked"],
    locked: ["settling"],
    settling: ["paid"],
    paid: ["open"],
  };

  if (!allowed[pool.state].includes(nextState)) return false;

  const nextMap = readRuntimeMap();
  nextMap[battleId] = {
    state: nextState,
    cutoffAt: nextState === "open" ? futureIso(30) : pool.cutoffAt,
    entries: pool.entries.map((entry) => ({
      ...entry,
      payoutEligible: nextState === "open" ? true : entry.payoutEligible,
    })),
  };

  writeRuntimeMap(nextMap);
  return true;
}
