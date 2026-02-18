import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

// GET /api/epochPools?chainId=97
// Returns fixed current-epoch pool totals for weekly+monthly using *available* pools
// (i.e., accrued + rollovers - recorded payouts).

const DEFAULT_PROTOCOL_FEE_BPS = 200;
const DEFAULT_LEAGUE_FEE_BPS = 75;

const WEEKLY_PRIZE_BUDGET_BPS = 3000;
const MONTHLY_PRIZE_BUDGET_BPS = 7000;

const WEEKLY_CATEGORIES = ["fastest_finish", "biggest_hit", "top_earner", "crowd_favorite"];
const MONTHLY_CATEGORIES = ["perfect_run", ...WEEKLY_CATEGORIES];

function readBps(name, def) {
  const v = Number(process.env[name]);
  if (!Number.isFinite(v) || v < 0 || v > 10_000) return def;
  return Math.trunc(v);
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcWeekMonday(d) {
  const today0 = startOfUtcDay(d);
  const dow = today0.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  return new Date(today0.getTime() - daysSinceMonday * 86400_000);
}

function startOfUtcMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function getEpoch(period) {
  const now = new Date();
  if (period === "weekly") {
    const start = startOfUtcWeekMonday(now);
    const end = new Date(start.getTime() + 7 * 86400_000);
    return { epochStart: start, epochEnd: end, rangeEnd: now };
  }
  const start = startOfUtcMonth(now);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { epochStart: start, epochEnd: end, rangeEnd: now };
}

async function computeTotalLeagueFeeRawInRange(chainId, startIso, endIso, protocolFeeBps, leagueFeeBps) {
  const { rows } = await pool.query(
    `
    WITH trades AS (
      SELECT t.side, t.bnb_amount_raw::numeric AS amt
      FROM public.curve_trades t
      WHERE t.chain_id = $1
        AND t.block_time >= $2::timestamptz
        AND t.block_time <  $3::timestamptz
    ),
    base AS (
      SELECT
        side,
        amt,
        floor((amt * 10000) / (10000 + $4)) AS buy_g0,
        ceiling((amt * 10000) / (10000 - $4)) AS sell_g0
      FROM trades
    ),
    calc AS (
      SELECT
        side,
        CASE
          WHEN side = 'buy' THEN (
            CASE
              WHEN (buy_g0 + floor((buy_g0 * $4) / 10000)) = amt THEN buy_g0
              WHEN ((buy_g0 + 1) + floor(((buy_g0 + 1) * $4) / 10000)) = amt THEN buy_g0 + 1
              WHEN ((buy_g0 + 2) + floor(((buy_g0 + 2) * $4) / 10000)) = amt THEN buy_g0 + 2
              WHEN (greatest(buy_g0 - 1, 0) + floor((greatest(buy_g0 - 1, 0) * $4) / 10000)) = amt THEN greatest(buy_g0 - 1, 0)
              WHEN (greatest(buy_g0 - 2, 0) + floor((greatest(buy_g0 - 2, 0) * $4) / 10000)) = amt THEN greatest(buy_g0 - 2, 0)
              ELSE buy_g0
            END
          )
          ELSE (
            CASE
              WHEN (sell_g0 - floor((sell_g0 * $4) / 10000)) = amt THEN sell_g0
              WHEN (greatest(sell_g0 - 1, 0) - floor((greatest(sell_g0 - 1, 0) * $4) / 10000)) = amt THEN greatest(sell_g0 - 1, 0)
              WHEN (greatest(sell_g0 - 2, 0) - floor((greatest(sell_g0 - 2, 0) * $4) / 10000)) = amt THEN greatest(sell_g0 - 2, 0)
              WHEN ((sell_g0 + 1) - floor(((sell_g0 + 1) * $4) / 10000)) = amt THEN sell_g0 + 1
              WHEN ((sell_g0 + 2) - floor(((sell_g0 + 2) * $4) / 10000)) = amt THEN sell_g0 + 2
              ELSE sell_g0
            END
          )
        END AS gross
      FROM base
    ),
    fees AS (
      SELECT floor((gross * $5) / 10000) AS league_fee
      FROM calc
    )
    SELECT COALESCE(sum(league_fee), 0)::numeric(78, 0) AS total_league_fee_raw
    FROM fees;
    `,
    [chainId, startIso, endIso, protocolFeeBps, leagueFeeBps]
  );
  return BigInt(String(rows?.[0]?.total_league_fee_raw ?? "0"));
}

async function getRolloverTotals(chainId, period, epochStartIso) {
  const { rows } = await pool.query(
    `select category, coalesce(sum(amount_raw),0)::numeric(78,0) as amount_raw
       from public.league_rollovers
      where chain_id=$1 and period=$2 and epoch_start=$3::timestamptz
      group by category`,
    [chainId, period, epochStartIso]
  );
  const m = new Map();
  for (const r of rows) m.set(String(r.category), BigInt(String(r.amount_raw ?? "0")));
  return m;
}

async function getPaidTotals(chainId, period, epochStartIso) {
  const { rows } = await pool.query(
    `select category, coalesce(sum(amount_raw),0)::numeric(78,0) as amount_raw
       from public.league_epoch_payouts
      where chain_id=$1 and period=$2 and epoch_start=$3::timestamptz
      group by category`,
    [chainId, period, epochStartIso]
  );
  const m = new Map();
  for (const r of rows) m.set(String(r.category), BigInt(String(r.amount_raw ?? "0")));
  return m;
}

async function computeAvailableTotal(chainId, period) {
  const epoch = getEpoch(period);
  const epochStartIso = epoch.epochStart.toISOString();
  const rangeEndIso = epoch.rangeEnd.toISOString();
  const protocolFeeBps = readBps("PROTOCOL_FEE_BPS", DEFAULT_PROTOCOL_FEE_BPS);
  const leagueFeeBps = readBps("LEAGUE_FEE_BPS", DEFAULT_LEAGUE_FEE_BPS);

  const totalLeagueFee = await computeTotalLeagueFeeRawInRange(chainId, epochStartIso, rangeEndIso, protocolFeeBps, leagueFeeBps);
  const budgetBps = period === "weekly" ? readBps("WEEKLY_PRIZE_BUDGET_BPS", WEEKLY_PRIZE_BUDGET_BPS)
    : readBps("MONTHLY_PRIZE_BUDGET_BPS", MONTHLY_PRIZE_BUDGET_BPS);
  const eligible = period === "weekly" ? WEEKLY_CATEGORIES : MONTHLY_CATEGORIES;
  const budget = (totalLeagueFee * BigInt(budgetBps)) / 10_000n;
  const base = eligible.length ? budget / BigInt(eligible.length) : 0n;
  const rem = eligible.length ? budget % BigInt(eligible.length) : 0n;

  const roll = await getRolloverTotals(chainId, period, epochStartIso);
  const paid = await getPaidTotals(chainId, period, epochStartIso);

  let sum = 0n;
  for (let i = 0; i < eligible.length; i++) {
    const cat = eligible[i];
    const pot = base + (BigInt(i) < rem ? 1n : 0n) + (roll.get(cat) ?? 0n);
    const avail = pot > (paid.get(cat) ?? 0n) ? pot - (paid.get(cat) ?? 0n) : 0n;
    sum += avail;
  }

  return { epochStartIso, epochEndIso: epoch.epochEnd.toISOString(), availableTotalRaw: sum.toString() };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!pool) return json(res, 500, { error: "Server misconfigured: DATABASE_URL missing" });

    const weekly = await computeAvailableTotal(chainId, "weekly");
    const monthly = await computeAvailableTotal(chainId, "monthly");

    return json(res, 200, {
      chainId,
      weekly,
      monthly,
      computedAt: new Date().toISOString(),
    });
  } catch (e) {
    const code = e?.code;
    console.error("[api/epochPools]", e);
    // If schema isn't deployed yet, fail gracefully.
    if (code === "42P01" || code === "42703") {
      return json(res, 200, { weekly: { availableTotalRaw: "0" }, monthly: { availableTotalRaw: "0" }, warning: "DB schema missing" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
