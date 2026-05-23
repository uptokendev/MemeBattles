import { badMethod, json } from "../server/http.js";

const DIVISION_ORDER = ["bronze", "silver", "gold", "apex"];
const SEASON_STATES = ["preseason", "live", "playoffs", "completed"];
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

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const divisionDelta = DIVISION_ORDER.indexOf(right.division) - DIVISION_ORDER.indexOf(left.division);
    if (divisionDelta !== 0) return divisionDelta;
    return right.points - left.points || right.wins - left.wins;
  });
}

function getResolvedSeason() {
  const season = clone(getLeagueStore().season);
  season.entries = sortEntries(season.entries);
  return season;
}

function archiveSeason(season) {
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

async function handleFeed(_req, res) {
  return json(res, 200, {
    season: getResolvedSeason(),
    history: getLeagueStore().history,
  });
}

async function handleAdvanceWeek(_req, res) {
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
  return json(res, 200, { ok: true, season: getResolvedSeason(), history: store.history });
}

async function handleRebalance(_req, res) {
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
  return json(res, 200, { ok: true, season: getResolvedSeason(), history: store.history });
}

async function handleCycleState(_req, res) {
  const store = getLeagueStore();
  const currentIndex = SEASON_STATES.indexOf(store.season.state);
  const nextState = SEASON_STATES[(currentIndex + 1) % SEASON_STATES.length];
  if (store.season.state === "completed" && nextState === "preseason") {
    archiveSeason(store.season);
    store.season = clone(BASE_SEASON);
    store.season.state = "preseason";
    store.season.week = 1;
    store.season.resetAt = futureIso(7);
  } else {
    store.season.state = nextState;
    if (nextState === "completed") store.season.resetAt = futureIso(1);
  }
  return json(res, 200, { ok: true, season: getResolvedSeason(), history: store.history });
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
