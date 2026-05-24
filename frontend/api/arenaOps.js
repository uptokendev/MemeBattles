import { pool } from "../server/db.js";
import { badMethod, json } from "../server/http.js";

const CHECKS = [
  {
    key: "battles",
    label: "Arena battles",
    table: "arena_battles",
    sql: "select count(*)::int as count from public.arena_battles",
  },
  {
    key: "warPools",
    label: "War Pools",
    table: "arena_war_pools",
    sql: "select count(*)::int as count from public.arena_war_pools",
  },
  {
    key: "warPoolEntries",
    label: "War Pool entries",
    table: "arena_war_pool_entries",
    sql: "select count(*)::int as count from public.arena_war_pool_entries",
  },
  {
    key: "events",
    label: "Arena events",
    table: "arena_events",
    sql: "select count(*)::int as count from public.arena_events",
  },
  {
    key: "leagueSeasons",
    label: "League seasons",
    table: "arena_league_seasons",
    sql: "select count(*)::int as count from public.arena_league_seasons",
  },
  {
    key: "leagueEntries",
    label: "League entries",
    table: "arena_league_entries",
    sql: "select count(*)::int as count from public.arena_league_entries",
  },
  {
    key: "sponsorshipApplications",
    label: "Sponsorship applications",
    table: "sponsorship_applications",
    sql: "select count(*)::int as count from public.sponsorship_applications",
  },
  {
    key: "sponsoredPlacements",
    label: "Sponsored placements",
    table: "sponsored_placements",
    sql: "select count(*)::int as count from public.sponsored_placements",
  },
];

async function runCheck(check) {
  try {
    const result = await pool.query(check.sql);
    return {
      key: check.key,
      label: check.label,
      table: check.table,
      ok: true,
      count: Number(result.rows?.[0]?.count || 0),
    };
  } catch (error) {
    return {
      key: check.key,
      label: check.label,
      table: check.table,
      ok: false,
      count: 0,
      error: String(error?.message || error || "Unknown database error"),
    };
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

  const checks = await Promise.all(CHECKS.map(runCheck));
  const missingTables = checks.filter((check) => !check.ok).map((check) => check.table);
  const ok = databaseOk && missingTables.length === 0;

  return json(res, 200, {
    ok,
    databaseOk,
    databaseError,
    checks,
    missingTables,
    importedTables: checks.filter((check) => check.ok).map((check) => check.table),
    durationMs: Date.now() - startedAt,
    updatedAt: new Date().toISOString(),
  });
}
