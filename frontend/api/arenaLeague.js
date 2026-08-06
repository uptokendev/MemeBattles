import { pool } from "../server/db.js";
import { badMethod, json } from "../server/http.js";
import { requireAdminOrOps, isAuthEnforceArenaMutations } from "./lib/apiAuth.js";

const DIVISIONS = ["bronze", "silver", "gold", "apex"];
const STATES = ["preseason", "live", "playoffs", "completed"];
const MOVEMENTS = ["promoted", "safe", "relegated"];

function futureIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function normalize(value, allowed, fallback) {
  const text = String(value || fallback);
  return allowed.includes(text) ? text : fallback;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => DIVISIONS.indexOf(b.division) - DIVISIONS.indexOf(a.division) || b.points - a.points || b.wins - a.wins);
}

function mapEntry(row) {
  return {
    tokenId: String(row.token_id),
    tokenName: String(row.token_name || row.symbol || "Unknown token"),
    symbol: String(row.symbol || "---"),
    division: normalize(row.division, DIVISIONS, "bronze"),
    points: Math.max(0, Number(row.points || 0)),
    wins: Math.max(0, Number(row.wins || 0)),
    losses: Math.max(0, Number(row.losses || 0)),
    streak: Number(row.streak || 0),
    movement: normalize(row.movement, MOVEMENTS, "safe"),
  };
}

function mapSeason(row, entries) {
  return {
    id: String(row.id),
    label: String(row.label || "Arena Season"),
    state: normalize(row.state, STATES, "preseason"),
    week: Math.max(1, Number(row.week || 1)),
    rewardPoolUsd: Math.max(0, Number(row.reward_pool_usd || 0)),
    resetAt: row.reset_at ? new Date(row.reset_at).toISOString() : futureIso(7),
    divisions: DIVISIONS,
    entries: sortEntries(entries),
  };
}

function mapHistory(row) {
  return {
    seasonId: String(row.season_id),
    label: String(row.label || "Completed season"),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : new Date().toISOString(),
    rewardPoolUsd: Math.max(0, Number(row.reward_pool_usd || 0)),
    week: Math.max(1, Number(row.week || 1)),
    topTokenName: String(row.top_token_name || "Unknown"),
    topTokenSymbol: String(row.top_token_symbol || "---"),
  };
}

async function activeSeason() {
  const seasonResult = await pool.query(
    `select id, label, state, week, reward_pool_usd, reset_at, created_at, updated_at
       from public.arena_league_seasons
      where active = true
      order by created_at desc
      limit 1`,
  );
  const row = seasonResult.rows?.[0];
  if (!row) return null;
  const entries = await pool.query(
    `select season_id, token_id, token_name, symbol, division, points, wins, losses, streak, movement
       from public.arena_league_entries where season_id = $1`,
    [row.id],
  );
  return mapSeason(row, entries.rows.map(mapEntry));
}

async function history() {
  const result = await pool.query(
    `select season_id, label, completed_at, reward_pool_usd, week, top_token_name, top_token_symbol
       from public.arena_league_history
      order by completed_at desc
      limit 24`,
  );
  return result.rows.map(mapHistory);
}

async function feed() {
  return { season: await activeSeason(), history: await history() };
}

async function updateSeason(seasonId, patch) {
  await pool.query(
    `update public.arena_league_seasons set state = coalesce($2, state), week = coalesce($3, week), reward_pool_usd = coalesce($4, reward_pool_usd), reset_at = coalesce($5, reset_at), updated_at = now() where id = $1`,
    [seasonId, patch.state ?? null, patch.week ?? null, patch.rewardPoolUsd ?? null, patch.resetAt ?? null],
  );
}

async function updateEntries(seasonId, entries) {
  for (const entry of entries) {
    await pool.query(
      `update public.arena_league_entries set division = $3, points = $4, wins = $5, losses = $6, streak = $7, movement = $8, updated_at = now() where season_id = $1 and token_id = $2`,
      [seasonId, entry.tokenId, entry.division, entry.points, entry.wins, entry.losses, entry.streak, entry.movement],
    );
  }
}

async function archiveSeason(season) {
  const [winner] = sortEntries(season.entries);
  await pool.query(
    `insert into public.arena_league_history (season_id, label, completed_at, reward_pool_usd, week, top_token_name, top_token_symbol)
     values ($1,$2,now(),$3,$4,$5,$6)
     on conflict (season_id) do update set label = excluded.label, completed_at = excluded.completed_at, reward_pool_usd = excluded.reward_pool_usd, week = excluded.week, top_token_name = excluded.top_token_name, top_token_symbol = excluded.top_token_symbol`,
    [season.id, season.label, season.rewardPoolUsd, season.week, winner?.tokenName || "Unknown", winner?.symbol || "---"],
  );
}

async function handleFeed(_req, res) {
  try {
    return json(res, 200, await feed());
  } catch (error) {
    console.error("[api/arenaLeague] feed failed", error);
    return json(res, 200, { season: null, history: [], warning: "Arena league data is unavailable." });
  }
}

async function handleAdvanceWeek(_req, res) {
  const season = await activeSeason();
  if (!season) return json(res, 404, { ok: false, error: "Active arena season not found" });
  const entries = season.entries.map((entry, index) => ({
    ...entry,
    points: entry.points + (index === 0 ? 6 : index < 3 ? 4 : index < 5 ? 2 : 1),
    wins: entry.wins + (index % 2 === 0 ? 1 : 0),
    losses: entry.losses + (index % 2 === 0 ? 0 : 1),
    streak: index % 2 === 0 ? Math.max(1, entry.streak + 1) : Math.min(-1, entry.streak - 1),
  }));
  await updateEntries(season.id, entries);
  await updateSeason(season.id, { state: season.state === "preseason" ? "live" : season.state, week: season.week + 1, rewardPoolUsd: season.rewardPoolUsd + 5000, resetAt: futureIso(6) });
  return json(res, 200, { ok: true, ...(await feed()) });
}

async function handleRebalance(_req, res) {
  const season = await activeSeason();
  if (!season) return json(res, 404, { ok: false, error: "Active arena season not found" });
  const sorted = sortEntries(season.entries);
  const entries = sorted.map((entry, index) => {
    if (index === 0) return { ...entry, division: "apex", movement: "promoted" };
    if (index <= 2) return { ...entry, division: DIVISIONS[Math.min(DIVISIONS.length - 1, DIVISIONS.indexOf(entry.division) + 1)], movement: "promoted" };
    if (index >= sorted.length - 1) return { ...entry, division: DIVISIONS[Math.max(0, DIVISIONS.indexOf(entry.division) - 1)], movement: "relegated" };
    return { ...entry, movement: "safe" };
  });
  await updateEntries(season.id, entries);
  await updateSeason(season.id, { state: season.state === "completed" ? "preseason" : "playoffs" });
  return json(res, 200, { ok: true, ...(await feed()) });
}

async function handleCycle(_req, res) {
  const season = await activeSeason();
  if (!season) return json(res, 404, { ok: false, error: "Active arena season not found" });
  const nextState = STATES[(STATES.indexOf(season.state) + 1) % STATES.length];
  if (season.state === "completed" && nextState === "preseason") await archiveSeason(season);
  await updateSeason(season.id, { state: nextState, week: nextState === "preseason" ? 1 : season.week, resetAt: nextState === "completed" ? futureIso(1) : nextState === "preseason" ? futureIso(7) : season.resetAt });
  return json(res, 200, { ok: true, ...(await feed()) });
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || new URL(req.url, "http://localhost").pathname);
  try {
    if (method === "GET" && path === "/arena/league") return handleFeed(req, res);
    if (method === "POST" && path === "/arena/league/advance-week") return handleAdvanceWeek(req, res);
    if (method === "POST" && path === "/arena/league/rebalance-divisions") return handleRebalance(req, res);
    if (method === "POST" && path === "/arena/league/cycle-season-state") return handleCycle(req, res);
    if (path.startsWith("/arena/league")) return badMethod(res);
    return json(res, 404, { error: `Unknown arena league route: ${path}` });
  } catch (error) {
    console.error("[api/arenaLeague] request failed", error);
    return json(res, 503, { ok: false, error: "Arena league storage is unavailable", detail: String(error?.message || error || "unknown error") });
  }
}
