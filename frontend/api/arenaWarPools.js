import { pool } from "../server/db.js";
import { badMethod, isAddress, json, readJson } from "../server/http.js";

const MIN_BET_BNB = 0.05;
const PLATFORM_FEE_RATE = 0.05;
const STATES = new Set(["open", "locked", "settling", "paid"]);
const TRANSITIONS = { open: ["locked"], locked: ["settling"], settling: ["paid"], paid: ["open"] };

function futureIso(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function normalizeState(value) {
  const state = String(value || "open");
  return STATES.has(state) ? state : "open";
}

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function toBnb(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 1e8) / 1e8 : 0;
}

function sum(entries, sideTokenId, key = "amountBnb") {
  return entries.filter((entry) => !sideTokenId || entry.sideTokenId === sideTokenId).reduce((total, entry) => total + Number(entry[key] || 0), 0);
}

function routing(totalPotBnb) {
  const platformFeeBnb = Math.round(totalPotBnb * PLATFORM_FEE_RATE * 1e8) / 1e8;
  const winnersBnb = Math.max(0, Math.round((totalPotBnb - platformFeeBnb) * 1e8) / 1e8);
  return {
    winnersBnb,
    platformFeeBnb,
    platformFeeRate: PLATFORM_FEE_RATE,
    winnersUsd: 0,
    protocolUsd: 0,
    featuredUsd: 0,
  };
}

function mapEntry(row) {
  const amountBnb = toBnb(row.amount_bnb ?? 0);
  return {
    battleId: String(row.battle_id),
    sideTokenId: String(row.side_token_id),
    supporterAddress: normalizeAddress(row.supporter_address),
    amountBnb,
    platformFeeBnb: toBnb(row.platform_fee_bnb ?? amountBnb * PLATFORM_FEE_RATE),
    amountUsd: Number(row.amount_usd || 0),
    enteredAt: row.entered_at ? new Date(row.entered_at).toISOString() : new Date().toISOString(),
    payoutEligible: Boolean(row.payout_eligible),
  };
}

function poolPayload(record, entries) {
  const totalPotBnb = sum(entries);
  const totalPotUsd = sum(entries, null, "amountUsd");
  return {
    battleId: String(record.battle_id),
    state: normalizeState(record.state),
    minBetBnb: MIN_BET_BNB,
    platformFeeRate: PLATFORM_FEE_RATE,
    totalPotBnb,
    totalPotUsd,
    cutoffAt: record.cutoff_at ? new Date(record.cutoff_at).toISOString() : futureIso(30),
    routingBreakdown: routing(totalPotBnb),
    entries,
  };
}

async function entriesFor(battleId) {
  const result = await pool.query(
    `select battle_id, side_token_id, supporter_address, amount_usd, amount_bnb, platform_fee_bnb, entered_at, payout_eligible
       from public.arena_war_pool_entries
      where battle_id = $1
      order by entered_at asc, created_at asc`,
    [battleId],
  );
  return result.rows.map(mapEntry);
}

async function findPool(battleId) {
  const result = await pool.query(
    `select battle_id, state, cutoff_at, created_at, updated_at from public.arena_war_pools where battle_id = $1 limit 1`,
    [battleId],
  );
  const record = result.rows?.[0];
  return record ? poolPayload(record, await entriesFor(battleId)) : null;
}

async function ensurePool(battleId) {
  const existing = await pool.query(
    `select battle_id, state, cutoff_at, created_at, updated_at from public.arena_war_pools where battle_id = $1 limit 1`,
    [battleId],
  );
  if (existing.rows?.[0]) return existing.rows[0];
  const inserted = await pool.query(
    `insert into public.arena_war_pools (battle_id, state, cutoff_at) values ($1, 'open', now() + interval '30 minutes') returning battle_id, state, cutoff_at, created_at, updated_at`,
    [battleId],
  );
  return inserted.rows[0];
}

async function listPools() {
  const result = await pool.query(
    `select battle_id, state, cutoff_at, created_at, updated_at
       from public.arena_war_pools
      order by coalesce(updated_at, created_at) desc
      limit 200`,
  );
  const pools = [];
  for (const row of result.rows) pools.push(poolPayload(row, await entriesFor(row.battle_id)));
  return pools;
}

function settlementSummary(poolRecord) {
  const grouped = Object.create(null);
  for (const entry of poolRecord.entries) grouped[entry.sideTokenId] = (grouped[entry.sideTokenId] || 0) + entry.amountBnb;
  const [winnerTokenId, winnerSideBnb = 0] = Object.entries(grouped).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const projectedWinnerPayoutBnb = poolRecord.routingBreakdown.winnersBnb;
  return {
    winnerTokenId,
    winnerLabel: winnerTokenId || "No winner yet",
    totalPotBnb: poolRecord.totalPotBnb,
    totalPotUsd: poolRecord.totalPotUsd,
    winnerSideBnb,
    loserSideBnb: Math.max(0, poolRecord.totalPotBnb - winnerSideBnb),
    winnerSideUsd: 0,
    loserSideUsd: 0,
    projectedPayoutMultiple: winnerSideBnb > 0 ? projectedWinnerPayoutBnb / winnerSideBnb : 0,
    projectedWinnerPayoutBnb,
    projectedNetProfitBnb: Math.max(0, projectedWinnerPayoutBnb - winnerSideBnb),
    projectedWinnerPayoutUsd: 0,
    projectedNetProfitUsd: 0,
    eligibleWinningEntries: winnerTokenId ? poolRecord.entries.filter((entry) => entry.sideTokenId === winnerTokenId && entry.payoutEligible).length : 0,
    settlementStateLabel: poolRecord.state,
    settlementStateBody: "Betting settlement data is sourced from postgrad storage.",
    routingBreakdown: poolRecord.routingBreakdown,
  };
}

async function handleSummary(_req, res) {
  try {
    const pools = await listPools();
    return json(res, 200, { summary: { pools, totalPotBnb: pools.reduce((total, item) => total + item.totalPotBnb, 0), totalPotUsd: pools.reduce((total, item) => total + item.totalPotUsd, 0), openPools: pools.filter((item) => item.state === "open").length, lockedPools: pools.filter((item) => item.state === "locked" || item.state === "settling").length, paidPools: pools.filter((item) => item.state === "paid").length } });
  } catch (error) {
    console.error("[api/arenaWarPools] summary failed", error);
    return json(res, 200, { summary: { pools: [], totalPotBnb: 0, totalPotUsd: 0, openPools: 0, lockedPools: 0, paidPools: 0 }, warning: "War Pool data is unavailable." });
  }
}

async function handleDetail(_req, res, battleId) {
  const poolRecord = await findPool(battleId);
  if (!poolRecord) return json(res, 404, { error: "War Pool not found" });
  return json(res, 200, { pool: poolRecord, settlementSummary: settlementSummary(poolRecord) });
}

async function handleSupport(req, res, battleId) {
  const body = await readJson(req);
  const sideTokenId = String(body?.sideTokenId || "").trim();
  const amountBnb = toBnb(body?.amountBnb ?? body?.betBnb);
  const supporterAddress = normalizeAddress(body?.supporterAddress || body?.walletAddress);
  if (!sideTokenId) return json(res, 400, { ok: false, error: "sideTokenId is required" });
  if (!isAddress(supporterAddress)) return json(res, 400, { ok: false, error: "A valid supporterAddress or walletAddress is required" });
  if (amountBnb < MIN_BET_BNB) return json(res, 400, { ok: false, error: `amountBnb must be at least ${MIN_BET_BNB} BNB`, minBetBnb: MIN_BET_BNB });

  const record = await ensurePool(battleId);
  if (normalizeState(record.state) !== "open") return json(res, 409, { ok: false, error: "War Pool is not open" });
  const platformFeeBnb = toBnb(amountBnb * PLATFORM_FEE_RATE);
  await pool.query(
    `insert into public.arena_war_pool_entries (battle_id, side_token_id, amount_usd, amount_bnb, platform_fee_bnb, supporter_address, payout_eligible) values ($1, $2, 0, $3, $4, $5, true)`,
    [battleId, sideTokenId, amountBnb, platformFeeBnb, supporterAddress],
  );
  await pool.query(`update public.arena_war_pools set updated_at = now() where battle_id = $1`, [battleId]);
  const poolRecord = await findPool(battleId);
  return json(res, 200, { ok: true, pool: poolRecord, settlementSummary: settlementSummary(poolRecord) });
}

async function handleTransition(req, res, battleId) {
  const current = await findPool(battleId);
  if (!current) return json(res, 404, { ok: false, error: "War Pool not found" });
  const body = await readJson(req);
  const nextState = String(body?.state || "");
  if (!(TRANSITIONS[current.state] || []).includes(nextState)) return json(res, 409, { ok: false, error: "Invalid war-pool transition", currentState: current.state });
  const cutoffSql = nextState === "open" ? "now() + interval '30 minutes'" : "cutoff_at";
  await pool.query(`update public.arena_war_pools set state = $2, cutoff_at = ${cutoffSql}, updated_at = now() where battle_id = $1`, [battleId, nextState]);
  if (nextState === "open") await pool.query(`update public.arena_war_pool_entries set payout_eligible = true where battle_id = $1`, [battleId]);
  const poolRecord = await findPool(battleId);
  return json(res, 200, { ok: true, pool: poolRecord, settlementSummary: settlementSummary(poolRecord) });
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || new URL(req.url, "http://localhost").pathname);
  try {
    if (method === "GET" && path === "/arena/war-pools") return handleSummary(req, res);
    const support = path.match(/^\/arena\/war-pools\/([^/]+)\/support$/);
    if (support) return method === "POST" ? handleSupport(req, res, decodeURIComponent(support[1])) : badMethod(res);
    const transition = path.match(/^\/arena\/war-pools\/([^/]+)\/transition$/);
    if (transition) return method === "POST" ? handleTransition(req, res, decodeURIComponent(transition[1])) : badMethod(res);
    const detail = path.match(/^\/arena\/war-pools\/([^/]+)$/);
    if (detail) return method === "GET" ? handleDetail(req, res, decodeURIComponent(detail[1])) : badMethod(res);
    return json(res, 404, { error: `Unknown arena war-pools route: ${path}` });
  } catch (error) {
    console.error("[api/arenaWarPools] request failed", error);
    return json(res, 503, { ok: false, error: "War Pool storage is unavailable", detail: String(error?.message || error || "unknown error") });
  }
}
