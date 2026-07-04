const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function readFlag(value: string | undefined, fallback = false) {
  if (value == null || value.trim() === "") return fallback;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

const isLocalDev = import.meta.env.DEV === true;

// Keep deployed/staged builds gated by env vars, but make the devpostgrad branch
// immediately testable with `npm run dev` when no local .env override exists.
const postGradEnabled = readFlag(import.meta.env.VITE_ENABLE_POSTGRAD, isLocalDev);

// The first launch is the launchpad plus Trade War Room. Arena surfaces stay
// hidden by default until the Arena rollout is explicitly enabled.
const arenaEnabled = postGradEnabled && readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_ARENA, false);

export const postGradFlags = {
  enabled: postGradEnabled,
  arena: arenaEnabled,
  warRoom: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_WAR_ROOM, postGradEnabled),
  battle: arenaEnabled && readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_BATTLE, arenaEnabled),
  events: arenaEnabled && readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_EVENTS, arenaEnabled),
  league: arenaEnabled && readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_LEAGUE, arenaEnabled),
  tournament: arenaEnabled && readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_TOURNAMENT, arenaEnabled),
  // Mock-only UX should be explicit opt-in so the branch defaults to the real
  // post-grad route structure, API adapters, and honest empty states.
  mocks: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_MOCKS, false),
} as const;

export function isPostGradRouteEnabled() {
  return postGradFlags.enabled;
}

export function isPostGradNavEnabled() {
  return postGradFlags.enabled && postGradFlags.arena;
}
