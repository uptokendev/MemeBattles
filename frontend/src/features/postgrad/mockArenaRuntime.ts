import type { MockTokenProfile } from "@/features/postgrad/contracts";
import { getMockTokenById, mockTokenProfiles } from "@/features/postgrad/mockRegistry";

const STORAGE_KEY = "mwz:postgrad:mock-arena";
const UPDATE_EVENT = "mwz:postgrad-mock-arena-updated";
const DEFAULT_FEATURED_TOKEN_IDS = mockTokenProfiles.slice(0, 3).map((token) => token.id);

type MockArenaRuntimeState = {
  featuredTokenIds: string[];
  sponsoredTokenIds: string[];
};

export type ResolvedArenaTokenProfile = MockTokenProfile & {
  featuredPlacement: boolean;
  sponsoredPlacement: boolean;
  placementIndex: number | null;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function createDefaultState(): MockArenaRuntimeState {
  return {
    featuredTokenIds: [...DEFAULT_FEATURED_TOKEN_IDS],
    sponsoredTokenIds: mockTokenProfiles.filter((token) => token.tacticalTags.includes("Sponsored")).map((token) => token.id),
  };
}

function sanitizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.filter((value): value is string => typeof value === "string"))).filter((id) => Boolean(getMockTokenById(id)));
}

function normalizeState(input: Partial<MockArenaRuntimeState> | null | undefined): MockArenaRuntimeState {
  const base = createDefaultState();
  const featuredTokenIds = sanitizeIds(input?.featuredTokenIds);
  const sponsoredTokenIds = sanitizeIds(input?.sponsoredTokenIds);

  return {
    featuredTokenIds: featuredTokenIds.length > 0 ? featuredTokenIds : base.featuredTokenIds,
    sponsoredTokenIds: sponsoredTokenIds.length > 0 ? sponsoredTokenIds : base.sponsoredTokenIds,
  };
}

function readRuntimeState(): MockArenaRuntimeState {
  if (!isBrowser()) return createDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

function writeRuntimeState(next: MockArenaRuntimeState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function resolveArenaToken(token: MockTokenProfile, runtime: MockArenaRuntimeState): ResolvedArenaTokenProfile {
  const placementIndex = runtime.featuredTokenIds.indexOf(token.id);
  return {
    ...token,
    featuredPlacement: placementIndex !== -1,
    sponsoredPlacement: runtime.sponsoredTokenIds.includes(token.id),
    placementIndex: placementIndex === -1 ? null : placementIndex,
  };
}

export function getResolvedArenaState() {
  const runtime = readRuntimeState();
  const tokens = mockTokenProfiles.map((token) => resolveArenaToken(token, runtime));
  const featuredTokens = runtime.featuredTokenIds
    .map((id) => tokens.find((token) => token.id === id) ?? null)
    .filter((token): token is ResolvedArenaTokenProfile => Boolean(token));

  return {
    featuredTokens,
    sponsoredTokenIds: runtime.sponsoredTokenIds,
    allTokens: tokens,
  };
}

export function subscribeToMockArenaRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function resetMockArenaRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function setFeaturedPlacement(tokenId: string) {
  const runtime = readRuntimeState();
  const featuredTokenIds = [tokenId, ...runtime.featuredTokenIds.filter((id) => id !== tokenId)].slice(0, 3);
  writeRuntimeState({
    ...runtime,
    featuredTokenIds,
  });
}

export function rotateFeaturedPlacements() {
  const runtime = readRuntimeState();
  if (runtime.featuredTokenIds.length <= 1) return;
  const [first, ...rest] = runtime.featuredTokenIds;
  writeRuntimeState({
    ...runtime,
    featuredTokenIds: [...rest, first],
  });
}

export function toggleSponsoredPlacement(tokenId: string) {
  const runtime = readRuntimeState();
  const sponsoredTokenIds = runtime.sponsoredTokenIds.includes(tokenId)
    ? runtime.sponsoredTokenIds.filter((id) => id !== tokenId)
    : [...runtime.sponsoredTokenIds, tokenId];

  writeRuntimeState({
    ...runtime,
    sponsoredTokenIds,
  });
}
