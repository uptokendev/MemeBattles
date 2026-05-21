import type { MockTokenProfile, TradeRoomFilter } from "@/features/postgrad/contracts";
import { pushMockActivity } from "@/features/postgrad/mockActivityRuntime";
import { defaultTradeRoomFilters, getMockBattleForToken, getMockTokenById, mockTokenProfiles } from "@/features/postgrad/mockRegistry";

const STORAGE_KEY = "mwz:postgrad:mock-war-room";
const UPDATE_EVENT = "mwz:postgrad-mock-war-room-updated";

type MockWarRoomRuntimeState = {
  filters: TradeRoomFilter;
  watchlistTokenIds: string[];
};

export type ResolvedMockTokenProfile = MockTokenProfile & {
  watched: boolean;
  effectiveWatchlistCount: number;
  relatedBattleId?: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function createDefaultState(): MockWarRoomRuntimeState {
  return {
    filters: { ...defaultTradeRoomFilters },
    watchlistTokenIds: [],
  };
}

function normalizeState(input: Partial<MockWarRoomRuntimeState> | null | undefined): MockWarRoomRuntimeState {
  const base = createDefaultState();
  return {
    filters: {
      ...base.filters,
      ...(input?.filters ?? {}),
    },
    watchlistTokenIds: Array.from(new Set((input?.watchlistTokenIds ?? []).filter((value): value is string => typeof value === "string"))),
  };
}

function readRuntimeState(): MockWarRoomRuntimeState {
  if (!isBrowser()) return createDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return createDefaultState();
  }
}

function writeRuntimeState(next: MockWarRoomRuntimeState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function resolveToken(token: MockTokenProfile, watchedIds: string[]): ResolvedMockTokenProfile {
  const watched = watchedIds.includes(token.id);
  return {
    ...token,
    watched,
    effectiveWatchlistCount: token.watchlistCount + (watched ? 1 : 0),
    relatedBattleId: getMockBattleForToken(token.id)?.id,
  };
}

export function getResolvedWarRoomState() {
  const runtime = readRuntimeState();
  return {
    filters: runtime.filters,
    watchlistTokenIds: runtime.watchlistTokenIds,
    tokens: mockTokenProfiles.map((token) => resolveToken(token, runtime.watchlistTokenIds)),
  };
}

export function getResolvedMockTokenById(tokenId?: string | null) {
  const token = getMockTokenById(tokenId);
  if (!token) return null;
  const { watchlistTokenIds } = readRuntimeState();
  return resolveToken(token, watchlistTokenIds);
}

export function subscribeToMockWarRoomRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function setMockWarRoomFilters(nextFilters: Partial<TradeRoomFilter>) {
  const runtime = readRuntimeState();
  writeRuntimeState({
    ...runtime,
    filters: {
      ...runtime.filters,
      ...nextFilters,
    },
  });
}

export function toggleMockWarRoomWatchlist(tokenId: string) {
  const runtime = readRuntimeState();
  const token = getMockTokenById(tokenId);
  const watched = runtime.watchlistTokenIds.includes(tokenId);
  const watchlistTokenIds = watched
    ? runtime.watchlistTokenIds.filter((value) => value !== tokenId)
    : [...runtime.watchlistTokenIds, tokenId];

  writeRuntimeState({
    ...runtime,
    watchlistTokenIds,
  });
  pushMockActivity("war_room", watched ? "Token removed from watchlist" : "Token added to watchlist", `${token?.symbol ?? tokenId} watchlist state changed.`);
}

export function resetMockWarRoomRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}
