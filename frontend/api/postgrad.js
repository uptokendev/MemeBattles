import arenaBattles from "./arenaBattles.js";
import arenaEvents from "./arenaEvents.js";
import arenaLeague from "./arenaLeague.js";
import arenaOps from "./arenaOps.js";
import arenaWarPools from "./arenaWarPools.js";
import sponsored from "./sponsored.js";
import sponsorshipApplications from "./sponsorship-applications.js";
import sponsorshipSettings from "./sponsorship-settings.js";
import warRoom from "./warRoom.js";

const ROUTES = [
  { pattern: /^\/arena\/ops\/health$/, flag: "POSTGRAD_ARENA_OPS_ENABLED", handler: arenaOps },
  { pattern: /^\/arena\/battles(?:\/.*)?$/, flag: "POSTGRAD_BATTLES_ENABLED", handler: arenaBattles },
  { pattern: /^\/arena\/events(?:\/.*)?$/, flag: "POSTGRAD_EVENTS_ENABLED", handler: arenaEvents },
  { pattern: /^\/arena\/league(?:\/.*)?$/, flag: "POSTGRAD_LEAGUE_ENABLED", handler: arenaLeague },
  { pattern: /^\/arena\/war-pools(?:\/.*)?$/, flag: "POSTGRAD_WAR_POOLS_ENABLED", handler: arenaWarPools },
  { pattern: /^\/sponsored$/, flag: "POSTGRAD_SPONSORSHIPS_ENABLED", handler: sponsored, alwaysOn: true },
  { pattern: /^\/sponsorship-applications$/, flag: "POSTGRAD_SPONSORSHIPS_ENABLED", handler: sponsorshipApplications, alwaysOn: true },
  { pattern: /^\/sponsorship-settings$/, flag: "POSTGRAD_SPONSORSHIPS_ENABLED", handler: sponsorshipSettings, alwaysOn: true },
  { pattern: /^\/war-room(?:\/.*)?$/, flag: "POSTGRAD_WAR_ROOM_ENABLED", handler: warRoom },
];

function enabled(name) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function routePath(req) {
  return String(req.path || new URL(req.url, "http://localhost").pathname);
}

export default async function handler(req, res) {
  const path = routePath(req);
  const route = ROUTES.find((candidate) => candidate.pattern.test(path));
  if (!route) return res.status(404).json({ error: `Unknown postgrad route: ${path}` });

  if (!route.alwaysOn && !enabled(route.flag)) {
    return res.status(503).json({
      ok: false,
      error: "Postgrad API route is disabled",
      featureFlag: route.flag,
    });
  }

  return route.handler(req, res);
}
