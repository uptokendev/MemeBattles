import { pool } from "../server/db.js";
import { badMethod, json } from "../server/http.js";

const CHECKS = [
  ["battles", "Arena battles", "arena_battles"],
  ["warPools", "War Pools", "arena_war_pools"],
  ["warPoolEntries", "War Pool entries", "arena_war_pool_entries"],
  ["events", "Arena events", "arena_events"],
  ["leagueSeasons", "League seasons", "arena_league_seasons"],
  ["leagueEntries", "League entries", "arena_league_entries"],
  ["sponsorshipApplications", "Sponsorship applications", "sponsorship_applications"],
  ["sponsoredPlacements", "Sponsored placements", "sponsored_placements"],
];

async function checkTable([key, label, table]) {
  try {
    const result = await pool.query(`select count(*)::int as count from public.${table}`);
    return { key, label, table, ok: true, count: Number(result.rows?.[0]?.count || 0) };
  } catch (error) {
    return { key, label, table, ok: false, count: 0, error: String(error?.message || error || "Unknown database error") };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  const startedAt = Date.now();
  let databaseOk = false;
  let databaseError = null;

  try {
    await pool.query("select 1");
    databaseOk = true;
  } catch (error) {
    databaseError = String(error?.message || error || "Database unavailable");
  }

  const checks = await Promise.all(CHECKS.map(checkTable));
  const missingTables = checks.filter((check) => !check.ok).map((check) => check.table);

  return json(res, 200, {
    ok: databaseOk && missingTables.length === 0,
    databaseOk,
    databaseError,
    checks,
    missingTables,
    importedTables: checks.filter((check) => check.ok).map((check) => check.table),
    durationMs: Date.now() - startedAt,
    updatedAt: new Date().toISOString(),
  });
}
