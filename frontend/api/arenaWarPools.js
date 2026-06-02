import { pool } from "../server/db.js";
import { badMethod, json, readJson } from "../server/http.js";

const BASE_POOL = {
  battleId: "battle-redline-vs-sdoge",
  state: "open",
  cutoffAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  entries: [
    {
      battleId: "battle-redline-vs-sdoge",
      sideTokenId: "redline-rats",
      amountUsd: 1800,
      enteredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      payoutEligible: true,
    },
    {
      battleId: "battle-redline-vs-sdoge",
      sideTokenId: "storm-doge",
      amountUsd: 1200,
      enteredAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      payoutEligible: true,
    },
  ],
};

const WAR_POOL_STATES = new Set(["open", "locked", "settling", "paid"]);

const STATE_TRANSITIONS = {
  open: ["locked"],
  locked: ["settling"],
  settling: ["paid"],
  paid: ["open"],
};

function futureIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function getWarPoolStore() {
  if (!globalThis.__memebattlesArenaWarPoolStore) {
    globalThis.__memebattlesArenaWarPoolStore = {
      pools: {
        [BASE_POOL.battleId]: {
          state: BASE_POOL.state,
          cutoffAt: BASE_POOL.cutoffAt,
          entries: BASE_POOL.entries,
        },
        "battle-mops-vs-gape": {
          state: "open",
          cutoffAt: futureIso(35),
          entries: [
            {
              battleId: "battle-mops-vs-gape",
              sideTokenId: "moon-ops",
              amountUsd: 1450,
              enteredAt: futureIso(-12),
              payoutEligible: true,
            },
            {
              battleId: "battle-mops-vs-gape",
              sideTokenId: "glitch-ape",
              amountUsd: 950,
              enteredAt: futureIso(-9),
              payoutEligible: true,
            },
          ],
        },
      },
    };
  }
  return globalThis.__memebattlesArenaWarPoolStore;
}

function calculateRouting(totalPotUsd) {
  return {
    winnersUsd: Math.round(totalPotUsd * 0.85),
    protocolUsd: Math.round(totalPotUsd * 0.05),
    featuredUsd: Math.round(totalPotUsd * 0.1),
  };
}

function sumEntries(entries, sideTokenId) {
  return entries
    .filter((entry) => !sideTokenId || entry.sideTokenId === sideTokenId)
    .reduce((total, entry) => total + Number(entry.amountUsd || 0), 0);
}

function normalizePoolState(value) {
  const state = String(value || "open");
  return WAR_POOL_STATES.has(state) ? state : "open";
}

function mapDbEntry(row) {
  return {
    battleId: String(row.battle_id),
    sideTokenId: String(row.side_token_id),
    amountUsd: Number(row.amount_usd || 0),
    enteredAt: row.entered_at ? new Date(row.entered_at).toISOString() : new Date().toISOString(),
    payoutEligible: Boolean(row.payout_eligible),
  };
}

function resolvePoolFromRecord(record, entries = []) {
  const totalPotUsd = sumEntries(entries);
  return {
    battleId: String(record.battleId || record.battle_id),
    state: normalizePoolState(record.state),
    totalPotUsd,
    cutoffAt: record.cutoffAt || record.cutoff_at || futureIso(30),
    routingBreakdown: calculateRouting(totalPotUsd),
    entries,
  };
}

function getMemoryPoolRecord(battleId) {
  const store = getWarPoolStore();
  if (!store.pools[battleId]) {
    store.pools[battleId] = {
      state: "open",
      cutoffAt: futureIso(30),
      entries: [],
    };
  }
  return store.pools[battleId];
}

function resolveMemoryPool(battleId) {
  const record = getMemoryPoolRecord(battleId);
  return resolvePoolFromRecord({ battleId, state: record.state, cutoffAt: record.cutoffAt }, record.entries);
}

async function ensureDbPoolRecord(battleId) {
  const existing = await pool.query(
    `select battle_id, state, cutoff_at, created_at, updated_at
       from public.arena_war_pools
      where battle_id = $1
      limit 1`,
    [battleId],
  );
  if (existing.rows?.[0]) return existing.rows[0];

  const inserted = await pool.query(
    `insert into public.arena_war_pools (battle_id, state, cutoff_at)
     values ($1, 'open', now() + interval '30 minutes')
     returning battle_id, state, cutoff_at, created_at, updated_at`,
    [battleId],
  );
  return inserted.rows[0];
}

async function fetchDbEntries(battleId) {
  const entries = await pool.query(
    `select battle_id, side_token_id, amount_usd, entered_at, payout_eligible
       from public.arena_war_pool_entries
      where battle_id = $1
      order by entered_at asc, created_at asc`,
    [battleId],
  );
  return entries.rows.map(mapDbEntry);
}

async function resolveDbPool(battleId, createIfMissing = true) {
  const record = createIfMissing
    ? await ensureDbPoolRecord(battleId)
    : (await pool.query(
        `select battle_id, state, cutoff_at, created_at, updated_at
           from public.arena_war_pools
          where battle_id = $1
          limit 1`,
        [battleId],
      )).rows?.[0];

  if (!record) return null;
  const entries = await fetchDbEntries(battleId);
  return resolvePoolFromRecord(record, entries);
}

async function listDbPools() {
  const poolsResult = await pool.query(
    `select battle_id, state, cutoff_at, created_at, updated_at
       from public.arena_war_pools
      order by coalesce(updated_at, created_at) desc
      limit 200`,
  );

  const pools = [];
  for (const row of poolsResult.rows) {
    const entries = await fetchDbEntries(row.battle_id);
    pools.push(resolvePoolFromRecord(row, entries));
  }
  return pools;
}

async function insertDbSupportEntry({ battleId, sideTokenId, amountUsd, supporterAddress }) {
  await pool.query(
    `insert into public.arena_war_pool_entries (
       battle_id,
       side_token_id,
       amount_usd,
       supporter_address,
       payout_eligible
     ) values ($1, $2, $3, $4, true)`,
    [battleId, sideTokenId, amountUsd, supporterAddress || null],
  );

  await pool.query(
    `update public.arena_war_pools
        set updated_at = now()
      where battle_id = $1`,
    [battleId],
  );
}

async function transitionDbPool(battleId, nextState) {
  const cutoffSql = nextState === "open" ? "now() + interval '30 minutes'" : "cutoff_at";
  const result = await pool.query(
    `update public.arena_war_pools
        set state = $2,
            cutoff_at = ${cutoffSql},
            updated_at = now()
      where battle_id = $1
      returning battle_id, state, cutoff_at, created_at, updated_at`,
    [battleId, nextState],
  );

  if (nextState === "open") {
    await pool.query(
      `update public.arena_war_pool_entries
          set payout_eligible = true
        where battle_id = $1`,
      [battleId],
    );
  }

  return result.rows?.[0] || null;
}

function getSettlementCopy(state) {
  switch (state) {
    case "open":
      return {
        label: "Support window open",
        body: "New entries still change the projected winner payout and side share.",
      };
    case "locked":
      return {
        label: "Cutoff locked",
        body: "Support is closed. The pool is ready to move into settlement.",
      };
    case "settling":
      return {
        label: "Settlement in progress",
        body: "Winner routing is being finalized and payout eligibility is frozen.",
      };
    default:
      return {
        label: "Payout complete",
        body: "Winner-side payouts are marked as distributed in the sandbox.",
      };
  }
}

function resolveSettlementSummary(pool) {
  const grouped = Object.create(null);
  for (const entry of pool.entries) {
    grouped[entry.sideTokenId] = (grouped[entry.sideTokenId] || 0) + entry.amountUsd;
  }
  const rankedSides = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const winnerTokenId = rankedSides[0]?.[0] || null;
  const winnerSideUsd = rankedSides[0]?.[1] || 0;
  const loserSideUsd = Math.max(0, pool.totalPotUsd - winnerSideUsd);
  const projectedWinnerPayoutUsd = pool.routingBreakdown.winnersUsd;
  const projectedPayoutMultiple = winnerSideUsd > 0 ? projectedWinnerPayoutUsd / winnerSideUsd : 0;
  const settlementCopy = getSettlementCopy(pool.state);
  return {
    winnerTokenId,
    winnerLabel: winnerTokenId || "No winner yet",
    totalPotUsd: pool.totalPotUsd,
    winnerSideUsd,
    loserSideUsd,
    projectedPayoutMultiple,
    projectedWinnerPayoutUsd,
    projectedNetProfitUsd: Math.max(0, projectedWinnerPayoutUsd - winnerSideUsd),
    eligibleWinningEntries: winnerTokenId ? pool.entries.filter((entry) => entry.sideTokenId === winnerTokenId && entry.payoutEligible).length : 0,
    settlementStateLabel: settlementCopy.label,
    settlementStateBody: settlementCopy.body,
    routingBreakdown: pool.routingBreakdown,
  };
}

async function resolveSummary() {
  try {
    const pools = await listDbPools();
    return {
      pools,
      totalPotUsd: pools.reduce((total, pool) => total + pool.totalPotUsd, 0),
      openPools: pools.filter((pool) => pool.state === "open").length,
      lockedPools: pools.filter((pool) => pool.state === "locked" || pool.state === "settling").length,
      paidPools: pools.filter((pool) => pool.state === "paid").length,
    };
  } catch (error) {
    console.warn("[api/arenaWarPools] DB summary unavailable, using memory store", error);
    const pools = Object.keys(getWarPoolStore().pools).map((battleId) => resolveMemoryPool(battleId));
    return {
      pools,
      totalPotUsd: pools.reduce((total, pool) => total + pool.totalPotUsd, 0),
      openPools: pools.filter((pool) => pool.state === "open").length,
      lockedPools: pools.filter((pool) => pool.state === "locked" || pool.state === "settling").length,
      paidPools: pools.filter((pool) => pool.state === "paid").length,
    };
  }
}

async function handleSummary(_req, res) {
  return json(res, 200, { summary: await resolveSummary() });
}

async function handleDetail(_req, res, battleId) {
  let poolRecord;
  try {
    poolRecord = await resolveDbPool(battleId, true);
  } catch (error) {
    console.warn("[api/arenaWarPools] DB detail unavailable, using memory store", error);
    poolRecord = resolveMemoryPool(battleId);
  }

  return json(res, 200, {
    pool: poolRecord,
    settlementSummary: resolveSettlementSummary(poolRecord),
  });
}

async function handleSupport(req, res, battleId) {
  const body = await readJson(req);
  const sideTokenId = String(body?.sideTokenId || "").trim();
  const amountUsd = Number(body?.amountUsd || 0);
  const supporterAddress = String(body?.supporterAddress || body?.walletAddress || "").trim().toLowerCase();

  if (!sideTokenId || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    return json(res, 400, { ok: false, error: "sideTokenId and positive amountUsd are required" });
  }

  try {
    const record = await ensureDbPoolRecord(battleId);
    if (record.state !== "open") return json(res, 409, { ok: false, error: "War Pool is not open" });
    await insertDbSupportEntry({ battleId, sideTokenId, amountUsd, supporterAddress });
    const poolRecord = await resolveDbPool(battleId, true);
    return json(res, 200, { ok: true, pool: poolRecord, settlementSummary: resolveSettlementSummary(poolRecord) });
  } catch (error) {
    console.warn("[api/arenaWarPools] DB support unavailable, using memory store", error);
  }

  const record = getMemoryPoolRecord(battleId);
  if (record.state !== "open") return json(res, 409, { ok: false, error: "War Pool is not open" });
  record.entries = [
    ...record.entries,
    {
      battleId,
      sideTokenId,
      amountUsd,
      enteredAt: new Date().toISOString(),
      payoutEligible: true,
    },
  ];
  const poolRecord = resolveMemoryPool(battleId);
  return json(res, 200, { ok: true, pool: poolRecord, settlementSummary: resolveSettlementSummary(poolRecord) });
}

async function handleTransition(req, res, battleId) {
  const body = await readJson(req);
  const nextState = String(body?.state || "");

  try {
    const poolRecord = await resolveDbPool(battleId, true);
    const allowed = STATE_TRANSITIONS[poolRecord.state] || [];
    if (!allowed.includes(nextState)) {
      return json(res, 409, { ok: false, error: "Invalid war-pool transition", currentState: poolRecord.state });
    }
    await transitionDbPool(battleId, nextState);
    const updatedPool = await resolveDbPool(battleId, true);
    return json(res, 200, { ok: true, pool: updatedPool, settlementSummary: resolveSettlementSummary(updatedPool) });
  } catch (error) {
    console.warn("[api/arenaWarPools] DB transition unavailable, using memory store", error);
  }

  const record = getMemoryPoolRecord(battleId);
  const allowed = STATE_TRANSITIONS[record.state] || [];
  if (!allowed.includes(nextState)) {
    return json(res, 409, { ok: false, error: "Invalid war-pool transition", currentState: record.state });
  }
  record.state = nextState;
  if (nextState === "open") record.cutoffAt = futureIso(30);
  record.entries = record.entries.map((entry) => ({
    ...entry,
    payoutEligible: nextState === "open" ? true : entry.payoutEligible,
  }));
  const poolRecord = resolveMemoryPool(battleId);
  return json(res, 200, { ok: true, pool: poolRecord, settlementSummary: resolveSettlementSummary(poolRecord) });
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || new URL(req.url, "http://localhost").pathname);

  if (method === "GET" && path === "/arena/war-pools") return handleSummary(req, res);

  const supportMatch = path.match(/^\/arena\/war-pools\/([^/]+)\/support$/);
  if (supportMatch) {
    if (method !== "POST") return badMethod(res);
    return handleSupport(req, res, decodeURIComponent(supportMatch[1]));
  }

  const transitionMatch = path.match(/^\/arena\/war-pools\/([^/]+)\/transition$/);
  if (transitionMatch) {
    if (method !== "POST") return badMethod(res);
    return handleTransition(req, res, decodeURIComponent(transitionMatch[1]));
  }

  const detailMatch = path.match(/^\/arena\/war-pools\/([^/]+)$/);
  if (detailMatch) {
    if (method !== "GET") return badMethod(res);
    return handleDetail(req, res, decodeURIComponent(detailMatch[1]));
  }

  return json(res, 404, { error: `Unknown arena war-pools route: ${path}` });
}
