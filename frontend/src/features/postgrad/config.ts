const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function readFlag(value: string | undefined, fallback = false) {
  if (value == null || value.trim() === "") return fallback;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export const postGradFlags = {
  enabled: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD, false),
  arena: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_ARENA, false),
  warRoom: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_WAR_ROOM, false),
  battle: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_BATTLE, false),
  events: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_EVENTS, false),
  league: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_LEAGUE, false),
  tournament: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_TOURNAMENT, false),
} as const;

export function isPostGradRouteEnabled() {
  return postGradFlags.enabled;
}

export function isPostGradNavEnabled() {
  return postGradFlags.enabled && postGradFlags.arena;
}
