const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function readFlag(value: string | undefined, fallback = false) {
  if (value == null || value.trim() === "") return fallback;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

const postGradEnabled = readFlag(import.meta.env.VITE_ENABLE_POSTGRAD, false);

export const postGradFlags = {
  enabled: postGradEnabled,
  arena: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_ARENA, postGradEnabled),
  warRoom: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_WAR_ROOM, postGradEnabled),
  battle: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_BATTLE, postGradEnabled),
  events: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_EVENTS, postGradEnabled),
  league: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_LEAGUE, postGradEnabled),
  tournament: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_TOURNAMENT, postGradEnabled),
} as const;

export function isPostGradRouteEnabled() {
  return postGradFlags.enabled;
}

export function isPostGradNavEnabled() {
  return postGradFlags.enabled && postGradFlags.arena;
}
