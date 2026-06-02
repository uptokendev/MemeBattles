import { pool } from "../server/db.js";
import { badMethod, json } from "../server/http.js";

const DIVISION_ORDER = ["bronze", "silver", "gold", "apex"];
const SEASON_STATES = ["preseason", "live", "playoffs", "completed"];
const MOVEMENTS = ["promoted", "safe", "relegated"];
const BASE_SEASON = {
  id: "season-01",
  label: "Season One",
  state: "live",
  week: 4,
  rewardPoolUsd: 150000,
  resetAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
  divisions: ["bronze", "silver", "gold", "apex"],
  entries: [
    { tokenId: "redline-rats", tokenName: "Redline Rats", symbol: "RATS", division: "apex", points: 144, wins: 12, losses: 2, streak: 4, movement: "promoted" },
    { tokenId: "storm-doge", tokenName: "Storm Doge", symbol: "SDOGE", division: "gold", points: 131, wins: 11, losses: 3, streak: 3, movement: "promoted" },
    { tokenId: "moon-ops", tokenName: "Moon Ops", symbol: "MOPS", division: "gold", points: 118, wins: 9, losses: 4, streak: 1, movement: "safe" },
    { tokenId: "glitch-ape", tokenName: "Glitch Ape", symbol: "GAPE", division: "silver", points: 94, wins: 7, losses: 6, streak: -1, movement: "safe" },
    { tokenId: "astro-frogs", tokenName: "Astro Frogs", symbol: "AFRG", division: "silver", points: 81, wins: 6, losses: 7, streak: 2, movement: "safe" },
    { tokenId: "neon-shib", tokenName: "Neon Shib", symbol: "NSHB", division: "bronze", points: 63, wins: 4, losses: 8, streak: -2, movement: "relegated" },
  ],
};

function getLeagueStore() {
  if (!globalThis.__memebattlesArenaLeagueStore) {
    globalThis.__memebattlesArenaLeagueStore = {
      season: JSON.parse(JSON.stringify(BASE_SEASON)),
      history: [],
    };
  }
  return globalThis.__memebattlesArenaLeagueStore;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function futureIso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeDivision(value) {
  const division = String(value || "bronze");
  return DIVISION_ORDER.includes(division) ? division : "bronze";
}

function normalizeMovement(value) {
  const movement = String(value || "safe");
  return MOVEMENTS.includes(movement) ? movement : "safe";
}

function normalizeSeasonState(value) {
  const state = String(value || "preseason");
  return SEASON_STATES.includes(state) ? state : "preseason";
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const divisionDelta = DIVISION_ORDER.indexOf(right.division) - DIVISION_ORDER.indexOf(left.division);
    if (divisionDelta !== 0) return divisionDelta;
    return right.points - left.points || right.wins - left.wins;
  });
}

function getMemoryResolvedSeason() {
  const season = clone(getLeagueStore().season);
  season.entries = sortEntries(season.entries);
  return season;
}

function archiveMemorySeason(season) {
  const [winner] = sortEntries(season.entries);
  const store = getLeagueStore();
  store.history = [
    {
      seasonId: season.id,
      label: season.label,
      completedAt: new Date().toISOString(),
      rewardPoolUsd: season.rewardPoolUsd,
      week: season.week,
      topTokenName: winner?.tokenName || "Unknown",
      topTokenSymbol: winner?.symbol || "---",
    },
    ...store.history.filter((entry) => !(entry.seasonId === season.id && entry.label === season.label)),
  ];
}

function mapSeasonRow(row, entries) {
  return {
    id: String(row.id),
    label: String(row.label || "Arena Season"),
    state: normalizeSeasonState(row.state),
    week: Math.max(1, Number(row.week || 1)),
    rewardPoolUsd: Math.max(0, Number(row.reward_pool_usd || 0)),
    resetAt: row.reset_at ? new Date(row.reset_at).toISOString() : futureIso(7),
    divisions: DIVISION_ORDER,
    entries: sortEntries(entries),
  };
}

function mapEntryRow(row) {
  return {
    tokenId: String(row.token_id),
    tokenName: String(row.token_name || row.symbol || "Unknown token"),
    symbol: String(row.symbol || "---"),
    division: normalizeDivision(row.division),
    points: Math.max(0, Number(row.points || 0)),
    wins: Math.max(0, Number(row.wins || 0)),
    losses: Math.max(0, Number(row.losses || 0)),
    streak: Number(row.streak || 0),
    movement: normalizeMovement(row.movement),
  };
}

function mapHistoryRow(row) {
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

async function seedDbLeagueIfEmpty() {
  const countResult = await pool.query("select count(*)::int as count from public.arena_league_seasons");
  if (Number(countResult.rows?.[0]?.count || 0) > 0) return;

  await pool.query(
    `insert into public.arena_league_seasons (id, label, state, week, reward_pool_usd, reset_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do nothing`,
    [BASE_SEASON.id, BASE_SEASON.label, BASE_SEASON.state, BASE_SEASON.week, BASE_SEASON.rewardPoolUsd, BASE_SEASON.resetAt],
  );

  for (const entry of BASE_SEASON.entries) {
    await pool.query(
      `insert into public.arena_league_entries (
         season_id,
         token_id,
         token_name,
         symbol,
         division,
         points,
         wins,
         losses,
         streak,
         movement
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (season_id, token_id) do nothing`,
      [BASE_SEASON.id, entry.tokenId, entry.tokenName, entry.symbol, entry.division, entry.points, entry.wins, entry.losses, entry.streak, entry.movement],
    );
  }
}

async function getActiveDbSeason() {
  await seedDbLeagueIfEmpty();
  const seasonResult = await pool.query(
    `select id, label, state, week, reward_pool_usd, reset_at, created_at, updated_at
       from public.arena_league_seasons
      where active = true
      order by created_at desc
      limit 1`,
  );
  const seasonRow = seasonResult.rows?.[0];
  if (!seasonRow) return null;

  const entriesResult = await pool.query(
    `select season_id, token_id, token_name, symbol, division, points, wins, losses, streak, movement
       from public.arena_league_entries
      where season_id = $1`,
    [seasonRow.id],
  );
  return mapSeasonRow(seasonRow, entriesResult.rows.map(mapEntryRow));
}

async function listDbHistory() {
  const result = await pool.query(
    `select season_id, label, completed_at, reward_pool_usd, week, top_token_name, top_token_symbol
       from public.arena_league_history
      order by completed_at desc
      limit 24`,
  );
  return result.rows.map(mapHistoryRow);
}

async function archiveDbSeason(season) {
  const [winner] = sortEntries(season.entries);
  await pool.query(
    `insert into public.arena_league_history (
       season_id,
       label,
       completed_at,
       reward_pool_usd,
       week,
       top_token_name,
       top_token_symbol
     ) values ($1,$2,now(),$3,$4,$5,$6)
     on conflict (season_id) do update set
       label = excluded.label,
       completed_at = excluded.completed_at,
       reward_pool_usd = excluded.reward_pool_usd,
       week = excluded.week,
       top_token_name = excluded.top_token_name,
       top_token_symbol = excluded.top_token_symbol`,
    [season.id, season.label, season.rewardPoolUsd, season.week, winner?.tokenName || "Unknown", winner?.symbol || "---"],
  );
}

async function resetDbSeasonToPreseason() {
  await pool.query(
    `update public.arena_league_seasons
        set state = 'preseason',
            week = 1,
            reward_pool_usd = $2,
            reset_at = $3,
            updated_at = now()
      where id = $1`,
    [BASE_SEASON.id, BASE_SEASON.rewardPoolUsd, futureIso(7)],
  );

  for (const entry of BASE_SEASON.entries) {
    await pool.query(
      `insert into public.arena_league_entries (
         season_id,
         token_id,
         token_name,
         symbol,
         division,
         points,
         wins,
         losses,
         streak,
         movement
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (season_id, token_id) do update set
         token_name = excluded.token_name,
         symbol = excluded.symbol,
         division = excluded.division,
         points = excluded.points,
         wins = excluded.wins,
         losses = excluded.losses,
         streak = excluded.streak,
         movement = excluded.movement,
         updated_at = now()`,
      [BASE_SEASON.id, entry.tokenId, entry.tokenName, entry.symbol, entry.division, entry.points, entry.wins, entry.losses, entry.streak, entry.movement],
    );
  }
}

async function getDbFeed() {
  const season = await getActiveDbSeason();
  const history = await listDbHistory();
  return { season, history };
}

async function updateDbSeasonMeta(seasonId, patch) {
  await pool.query(
    `update public.arena_league_seasons
        set state = coalesce($2, state),
            week = coalesce($3, week),
            reward_pool_usd = coalesce($4, reward_pool_usd),
            reset_at = coalesce($5, reset_at),
            updated_at = now()
      where id = $1`,
    [seasonId, patch.state ?? null, patch.week ?? null, patch.rewardPoolUsd ?? null, patch.resetAt ?? null],
  );
}

async function replaceDbEntries(seasonId, entries) {
  for (const entry of entries) {
    await pool.query(
      `update public.arena_league_entries
          set division = $3,
              points = $4,
              wins = $5,
              losses = $6,
              streak = $7,
              movement = $8,
              updated_at = now()
        where season_id = $1 and token_id = $2`,
      [seasonId, entry.tokenId, entry.division, entry.points, entry.wins, entry.losses, entry.streak, entry.movement],
    );
  }
}

async function handleFeed(_req, res) {
  try {
    const feed = await getDbFeed();
    if (feed.season) return json(res, 200, feed);
  } catch (error) {
    console.warn("[api/arenaLeague] DB feed unavailable, using memory store", error);
  }

  return json(res, 200, {
    season: getMemoryResolvedSeason(),
    history: getLeagueStore().history,
  });
}

async function handleAdvanceWeek(_req, res) {
  try {
    const season = await getActiveDbSeason();
    if (season) {
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
      await replaceDbEntries(season.id, entries);
      await updateDbSeasonMeta(season.id, {
        state: season.state === "preseason" ? "live" : season.state,
        week: season.week + 1,
        rewardPoolUsd: season.rewardPoolUsd + 5000,
        resetAt: futureIso(6),
      });
      return json(res, 200, { ok: true, ...(await getDbFeed()) });
    }
  } catch (error) {
    console.warn("[api/arenaLeague] DB advance week unavailable, using memory store", error);
  }

  const store = getLeagueStore();
  store.season.entries = store.season.entries.map((entry, index) => {
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
  store.season.state = store.season.state === "preseason" ? "live" : store.season.state;
  store.season.week += 1;
  store.season.rewardPoolUsd += 5000;
  store.season.resetAt = futureIso(6);
  return json(res, 200, { ok: true, season: getMemoryResolvedSeason(), history: store.history });
}

async function handleRebalance(_req, res) {
  try {
    const season = await getActiveDbSeason();
    if (season) {
      const sorted = sortEntries(season.entries);
      const entries = sorted.map((entry, index) => {
        if (index === 0) {
          return { ...entry, division: "apex", movement: "promoted" };
        }
        if (index <= 2) {
          const currentIndex = DIVISION_ORDER.indexOf(entry.division);
          return { ...entry, division: DIVISION_ORDER[Math.min(DIVISION_ORDER.length - 1, currentIndex + 1)], movement: "promoted" };
        }
        if (index >= sorted.length - 1) {
          const currentIndex = DIVISION_ORDER.indexOf(entry.division);
          return { ...entry, division: DIVISION_ORDER[Math.max(0, currentIndex - 1)], movement: "relegated" };
        }
        return { ...entry, movement: "safe" };
      });
      await replaceDbEntries(season.id, entries);
      const nextState = season.state === "completed" ? "preseason" : "playoffs";
      await updateDbSeasonMeta(season.id, { state: nextState, resetAt: nextState === "preseason" ? futureIso(7) : season.resetAt });
      return json(res, 200, { ok: true, ...(await getDbFeed()) });
    }
  } catch (error) {
    console.warn("[api/arenaLeague] DB rebalance unavailable, using memory store", error);
  }

  const store = getLeagueStore();
  const sorted = sortEntries(store.season.entries);
  store.season.entries = sorted.map((entry, index) => {
    if (index === 0) {
      return { ...entry, division: "apex", movement: "promoted" };
    }
    if (index <= 2) {
      const currentIndex = DIVISION_ORDER.indexOf(entry.division);
      return { ...entry, division: DIVISION_ORDER[Math.min(DIVISION_ORDER.length - 1, currentIndex + 1)], movement: "promoted" };
    }
    if (index >= sorted.length - 1) {
      const currentIndex = DIVISION_ORDER.indexOf(entry.division);
      return { ...entry, division: DIVISION_ORDER[Math.max(0, currentIndex - 1)], movement: "relegated" };
    }
    return { ...entry, movement: "safe" };
  });
  store.season.state = store.season.state === "completed" ? "preseason" : "playoffs";
  if (store.season.state === "preseason") store.season.resetAt = futureIso(7);
  return json(res, 200, { ok: true, season: getMemoryResolvedSeason(), history: store.history });
}

async function handleCycleState(_req, res) {
  try {
    const season = await getActiveDbSeason();
    if (season) {
      const currentIndex = SEASON_STATES.indexOf(season.state);
      const nextState = SEASON_STATES[(currentIndex + 1) % SEASON_STATES.length];
      if (season.state === "completed" && nextState === "preseason") {
        await archiveDbSeason(season);
        await resetDbSeasonToPreseason();
      } else {
        await updateDbSeasonMeta(season.id, { state: nextState, resetAt: nextState === "completed" ? futureIso(1) : season.resetAt });
      }
      return json(res, 200, { ok: true, ...(await getDbFeed()) });
    }
  } catch (error) {
    console.warn("[api/arenaLeague] DB cycle state unavailable, using memory store", error);
  }

  const store = getLeagueStore();
  const currentIndex = SEASON_STATES.indexOf(store.season.state);
  const nextState = SEASON_STATES[(currentIndex + 1) % SEASON_STATES.length];
  if (store.season.state === "completed" && nextState === "preseason") {
    archiveMemorySeason(store.season);
    store.season = clone(BASE_SEASON);
    store.season.state = "preseason";
    store.season.week = 1;
    store.season.resetAt = futureIso(7);
  } else {
    store.season.state = nextState;
    if (nextState === "completed") store.season.resetAt = futureIso(1);
  }
  return json(res, 200, { ok: true, season: getMemoryResolvedSeason(), history: store.history });
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || new URL(req.url, "http://localhost").pathname);

  if (method === "GET" && path === "/arena/league") return handleFeed(req, res);
  if (method === "POST" && path === "/arena/league/advance-week") return handleAdvanceWeek(req, res);
  if (method === "POST" && path === "/arena/league/rebalance-divisions") return handleRebalance(req, res);
  if (method === "POST" && path === "/arena/league/cycle-season-state") return handleCycleState(req, res);

  if (path.startsWith("/arena/league")) return badMethod(res);
  return json(res, 404, { error: `Unknown arena league route: ${path}` });
}
