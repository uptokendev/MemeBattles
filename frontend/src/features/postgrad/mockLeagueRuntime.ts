import type { LeagueDivision, LeagueSeason, LeagueSeasonState } from "@/features/postgrad/contracts";
import { mockLeagueSeason } from "@/features/postgrad/mockRegistry";

const STORAGE_KEY = "mwz:postgrad:mock-league";
const HISTORY_STORAGE_KEY = "mwz:postgrad:mock-league-history";
const UPDATE_EVENT = "mwz:postgrad-mock-league-updated";

const LEAGUE_DIVISION_ORDER: LeagueDivision[] = ["bronze", "silver", "gold", "apex"];
const LEAGUE_SEASON_STATES: LeagueSeasonState[] = ["preseason", "live", "playoffs", "completed"];

type MockLeagueRuntimeState = {
  state: LeagueSeasonState;
  week: number;
  rewardPoolUsd: number;
  resetAt: string;
  entries: LeagueSeason["entries"];
};

type MockLeagueHistoryEntry = {
  seasonId: string;
  label: string;
  completedAt: string;
  rewardPoolUsd: number;
  week: number;
  topTokenName: string;
  topTokenSymbol: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function dispatchRuntimeUpdate() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function readRuntimeState(): MockLeagueRuntimeState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as MockLeagueRuntimeState) : null;
  } catch {
    return null;
  }
}

function writeRuntimeState(next: MockLeagueRuntimeState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  dispatchRuntimeUpdate();
}

function readHistory(): MockLeagueHistoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(next: MockLeagueHistoryEntry[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
}

function futureIso(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

function sortEntries(entries: LeagueSeason["entries"]) {
  return [...entries].sort((left, right) => {
    const divisionDelta = LEAGUE_DIVISION_ORDER.indexOf(right.division) - LEAGUE_DIVISION_ORDER.indexOf(left.division);
    if (divisionDelta !== 0) return divisionDelta;
    return right.points - left.points || right.wins - left.wins;
  });
}

function archiveSeason(season: LeagueSeason) {
  const [winner] = sortEntries(season.entries);
  const nextHistory = [
    {
      seasonId: season.id,
      label: season.label,
      completedAt: new Date().toISOString(),
      rewardPoolUsd: season.rewardPoolUsd,
      week: season.week,
      topTokenName: winner?.tokenName ?? "Unknown",
      topTokenSymbol: winner?.symbol ?? "---",
    },
    ...readHistory().filter((entry) => !(entry.seasonId === season.id && entry.label === season.label)),
  ];

  writeHistory(nextHistory);
}

export function getResolvedLeagueSeason(): LeagueSeason {
  const overrides = readRuntimeState();
  if (!overrides) return { ...mockLeagueSeason, entries: sortEntries(mockLeagueSeason.entries) };
  return {
    ...mockLeagueSeason,
    state: overrides.state,
    week: overrides.week,
    rewardPoolUsd: overrides.rewardPoolUsd,
    resetAt: overrides.resetAt,
    entries: sortEntries(overrides.entries),
  };
}

export function getResolvedLeagueHistory() {
  return readHistory();
}

export function subscribeToMockLeagueRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function resetMockLeagueRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  dispatchRuntimeUpdate();
}

export function cycleMockLeagueState() {
  const season = getResolvedLeagueSeason();
  const currentIndex = LEAGUE_SEASON_STATES.indexOf(season.state);
  const nextState = LEAGUE_SEASON_STATES[(currentIndex + 1) % LEAGUE_SEASON_STATES.length];

  if (season.state === "completed" && nextState === "preseason") {
    archiveSeason(season);
  }

  writeRuntimeState({
    state: nextState,
    week: nextState === "preseason" ? 1 : season.week,
    rewardPoolUsd: season.rewardPoolUsd,
    resetAt: nextState === "completed" ? futureIso(1) : season.resetAt,
    entries: season.entries,
  });
}

export function advanceLeagueWeek() {
  const season = getResolvedLeagueSeason();
  const entries = season.entries.map((entry, index) => {
    const bonus = index === 0 ? 6 : index < 3 ? 4 : index < 5 ? 2 : 1;
    const winGain = index % 2 === 0 ? 1 : 0;
    const lossGain = index % 2 === 0 ? 0 : 1;
    const streak = index % 2 === 0 ? Math.max(1, entry.streak + 1) : Math.min(-1, entry.streak - 1);
    return {
      ...entry,
      points: entry.points + bonus,
      wins: entry.wins + winGain,
      losses: entry.losses + lossGain,
      streak,
    };
  });

  writeRuntimeState({
    state: season.state === "preseason" ? "live" : season.state,
    week: season.week + 1,
    rewardPoolUsd: season.rewardPoolUsd + 5000,
    resetAt: futureIso(6),
    entries,
  });
}

export function rebalanceLeagueDivisions() {
  const season = getResolvedLeagueSeason();
  const sorted = sortEntries(season.entries);
  const entries = sorted.map((entry, index) => {
    if (index === 0) {
      return { ...entry, division: "apex" as const, movement: "promoted" as const };
    }
    if (index <= 2) {
      const currentIndex = LEAGUE_DIVISION_ORDER.indexOf(entry.division);
      return {
        ...entry,
        division: LEAGUE_DIVISION_ORDER[Math.min(LEAGUE_DIVISION_ORDER.length - 1, currentIndex + 1)],
        movement: "promoted" as const,
      };
    }
    if (index >= sorted.length - 1) {
      const currentIndex = LEAGUE_DIVISION_ORDER.indexOf(entry.division);
      return {
        ...entry,
        division: LEAGUE_DIVISION_ORDER[Math.max(0, currentIndex - 1)],
        movement: "relegated" as const,
      };
    }
    return { ...entry, movement: "safe" as const };
  });

  writeRuntimeState({
    state: season.state === "completed" ? "preseason" : "playoffs",
    week: season.week,
    rewardPoolUsd: season.rewardPoolUsd,
    resetAt: season.state === "completed" ? futureIso(7) : season.resetAt,
    entries,
  });
}
