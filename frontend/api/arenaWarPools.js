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

function getPoolRecord(battleId) {
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

function resolvePool(battleId) {
  const record = getPoolRecord(battleId);
  const totalPotUsd = sumEntries(record.entries);
  return {
    battleId,
    state: record.state,
    totalPotUsd,
    cutoffAt: record.cutoffAt,
    routingBreakdown: calculateRouting(totalPotUsd),
    entries: record.entries,
  };
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

function resolveSummary() {
  const pools = Object.keys(getWarPoolStore().pools).map((battleId) => resolvePool(battleId));
  return {
    pools,
    totalPotUsd: pools.reduce((total, pool) => total + pool.totalPotUsd, 0),
    openPools: pools.filter((pool) => pool.state === "open").length,
    lockedPools: pools.filter((pool) => pool.state === "locked" || pool.state === "settling").length,
    paidPools: pools.filter((pool) => pool.state === "paid").length,
  };
}

async function handleSummary(_req, res) {
  return json(res, 200, { summary: resolveSummary() });
}

async function handleDetail(_req, res, battleId) {
  const pool = resolvePool(battleId);
  return json(res, 200, {
    pool,
    settlementSummary: resolveSettlementSummary(pool),
  });
}

async function handleSupport(req, res, battleId) {
  const body = await readJson(req);
  const sideTokenId = String(body?.sideTokenId || "").trim();
  const amountUsd = Number(body?.amountUsd || 0);
  const record = getPoolRecord(battleId);
  if (record.state !== "open") return json(res, 409, { ok: false, error: "War Pool is not open" });
  if (!sideTokenId || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    return json(res, 400, { ok: false, error: "sideTokenId and positive amountUsd are required" });
  }

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
  const pool = resolvePool(battleId);
  return json(res, 200, { ok: true, pool, settlementSummary: resolveSettlementSummary(pool) });
}

async function handleTransition(req, res, battleId) {
  const body = await readJson(req);
  const nextState = String(body?.state || "");
  const record = getPoolRecord(battleId);
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
  const pool = resolvePool(battleId);
  return json(res, 200, { ok: true, pool, settlementSummary: resolveSettlementSummary(pool) });
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
