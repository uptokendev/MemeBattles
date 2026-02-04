import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

// League categories (LOCKED):
// - perfect_run (monthly only)
// - fastest_finish
// - biggest_hit
// - top_earner (bonding curve trader PnL)
// - crowd_favorite
const CATEGORY_SET = new Set(["perfect_run", "fastest_finish", "biggest_hit", "top_earner", "crowd_favorite"]);

// Accept old period spellings for backward compatibility.
const PERIOD_SET = new Set(["weekly", "monthly", "all", "all_time", "alltime"]);

function clampInt(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function normPeriod(periodRaw) {
  const p = String(periodRaw || "weekly").toLowerCase().trim();
  if (p === "weekly") return "weekly";
  if (p === "monthly") return "monthly";
  return "all_time";
}

function periodCutoff(norm) {
  if (norm === "weekly") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (norm === "monthly") return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return null; // all-time
}

// ---------------------------
// Prize pool (league fee only)
// ---------------------------
const DEFAULT_PROTOCOL_FEE_BPS = 200; // 2%
const DEFAULT_LEAGUE_FEE_BPS = 25; // 0.25% slice of gross
const PRIZE_TTL_MS = 60 * 60 * 1000;
const PRIZE_SPLIT_BPS = [4000, 2500, 1500, 1200, 800]; // 40/25/15/12/8

function readBps(name, def) {
  const raw = process?.env?.[name];
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return def;
  return Math.trunc(n);
}

function prizeEligibleCategories(periodNorm) {
  if (periodNorm === "weekly") return ["fastest_finish", "biggest_hit", "top_earner", "crowd_favorite"]; // 4
  if (periodNorm === "monthly") return ["perfect_run", "fastest_finish", "biggest_hit", "top_earner", "crowd_favorite"]; // 5
  return null;
}

const prizeCache = new Map(); // key: `${chainId}:${period}` -> { computedAtMs, data }

function splitPotRaw(potRawBigInt) {
  const pot = BigInt(potRawBigInt);
  const payouts = PRIZE_SPLIT_BPS.map((bps) => (pot * BigInt(bps)) / 10000n);
  const sum = payouts.reduce((a, b) => a + b, 0n);
  // Push rounding dust to #1 so totals reconcile.
  payouts[0] = payouts[0] + (pot - sum);
  return payouts.map((x) => x.toString());
}

async function computeTotalLeagueFeeRaw(chainId, cutoffIso, protocolFeeBps, leagueFeeBps) {
  // IMPORTANT:
  // curve_trades.bnb_amount_raw is:
  // - buy: total paid = gross + floor(gross * protocolFeeBps / 10000)
  // - sell: net payout = gross - floor(gross * protocolFeeBps / 10000)
  // We invert to gross using an integer-safe candidate +/- 2 wei check, then compute:
  // league_fee = floor(gross * leagueFeeBps / 10000)
  const { rows } = await pool.query(
    `
    WITH trades AS (
      SELECT
        t.side,
        t.bnb_amount_raw::numeric AS amt
      FROM public.curve_trades t
      WHERE t.chain_id = $1
        AND ($2::timestamptz IS NULL OR t.block_time >= $2::timestamptz)
    ),
    base AS (
      SELECT
        side,
        amt,
        floor((amt * 10000) / (10000 + $3)) AS buy_g0,
        ceiling((amt * 10000) / (10000 - $3)) AS sell_g0
      FROM trades
    ),
    calc AS (
      SELECT
        side,
        CASE
          WHEN side = 'buy' THEN (
            CASE
              WHEN (buy_g0 + floor((buy_g0 * $3) / 10000)) = amt THEN buy_g0
              WHEN ((buy_g0 + 1) + floor(((buy_g0 + 1) * $3) / 10000)) = amt THEN buy_g0 + 1
              WHEN ((buy_g0 + 2) + floor(((buy_g0 + 2) * $3) / 10000)) = amt THEN buy_g0 + 2
              WHEN (greatest(buy_g0 - 1, 0) + floor((greatest(buy_g0 - 1, 0) * $3) / 10000)) = amt THEN greatest(buy_g0 - 1, 0)
              WHEN (greatest(buy_g0 - 2, 0) + floor((greatest(buy_g0 - 2, 0) * $3) / 10000)) = amt THEN greatest(buy_g0 - 2, 0)
              ELSE buy_g0
            END
          )
          ELSE (
            CASE
              WHEN (sell_g0 - floor((sell_g0 * $3) / 10000)) = amt THEN sell_g0
              WHEN (greatest(sell_g0 - 1, 0) - floor((greatest(sell_g0 - 1, 0) * $3) / 10000)) = amt THEN greatest(sell_g0 - 1, 0)
              WHEN (greatest(sell_g0 - 2, 0) - floor((greatest(sell_g0 - 2, 0) * $3) / 10000)) = amt THEN greatest(sell_g0 - 2, 0)
              WHEN ((sell_g0 + 1) - floor(((sell_g0 + 1) * $3) / 10000)) = amt THEN sell_g0 + 1
              WHEN ((sell_g0 + 2) - floor(((sell_g0 + 2) * $3) / 10000)) = amt THEN sell_g0 + 2
              ELSE sell_g0
            END
          )
        END AS gross
      FROM base
    ),
    fees AS (
      SELECT floor((gross * $4) / 10000) AS league_fee
      FROM calc
    )
    SELECT COALESCE(sum(league_fee), 0)::numeric(78, 0) AS total_league_fee_raw
    FROM fees;
    `,
    [chainId, cutoffIso ?? null, protocolFeeBps, leagueFeeBps]
  );

  const v = rows?.[0]?.total_league_fee_raw;
  // Always return integer string.
  return String(v ?? "0");
}

async function getPrizeMeta(chainId, periodNorm) {
  const eligible = prizeEligibleCategories(periodNorm);
  if (!eligible) return null;

  const key = `${chainId}:${periodNorm}`;
  const now = Date.now();
  const cached = prizeCache.get(key);
  if (cached && now - cached.computedAtMs < PRIZE_TTL_MS) return cached.data;

  const protocolFeeBps = readBps("PROTOCOL_FEE_BPS", DEFAULT_PROTOCOL_FEE_BPS);
  const leagueFeeBps = readBps("LEAGUE_FEE_BPS", DEFAULT_LEAGUE_FEE_BPS);

  const cutoff = periodCutoff(periodNorm);
  const cutoffIso = cutoff ? cutoff.toISOString() : null;

  const totalLeagueFeeRaw = await computeTotalLeagueFeeRaw(chainId, cutoffIso, protocolFeeBps, leagueFeeBps);
  const total = BigInt(totalLeagueFeeRaw);

  const leagueCount = eligible.length;
  const base = leagueCount > 0 ? total / BigInt(leagueCount) : 0n;
  const rem = leagueCount > 0 ? total % BigInt(leagueCount) : 0n;

  const byCategory = {};
  for (let i = 0; i < eligible.length; i++) {
    const cat = eligible[i];
    const pot = base + (BigInt(i) < rem ? 1n : 0n); // spread dust evenly (<= 1 wei difference)
    byCategory[cat] = {
      potRaw: pot.toString(),
      payoutsRaw: splitPotRaw(pot)
    };
  }

  const data = {
    basis: "league_fee_only",
    period: periodNorm,
    cutoff: cutoffIso,
    computedAt: new Date(now).toISOString(),
    protocolFeeBps,
    leagueFeeBps,
    totalLeagueFeeRaw: total.toString(),
    leagueCount,
    winners: 5,
    splitBps: PRIZE_SPLIT_BPS,
    byCategory
  };

  prizeCache.set(key, { computedAtMs: now, data });
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

    const category = String(q.category ?? "").toLowerCase().trim();
    if (!CATEGORY_SET.has(category)) return json(res, 400, { error: "Invalid category" });

    const periodRaw = String(q.period ?? "weekly").toLowerCase().trim();
    if (!PERIOD_SET.has(periodRaw)) return json(res, 400, { error: "Invalid period" });

    const periodNorm = normPeriod(periodRaw);
    const cutoff = periodCutoff(periodNorm);
    const cutoffIso = cutoff ? cutoff.toISOString() : null;

    const limit = clampInt(q.limit ?? 10, 1, 50, 10);

    // Prize meta is computed once per chain/period per warm instance (and TTL = 1h).
    // This prevents recomputing fee totals on every category request.
    const prizeMeta = await getPrizeMeta(chainId, periodNorm);
    const prizeForCategory = prizeMeta?.byCategory?.[category]
      ? {
          basis: prizeMeta.basis,
          period: prizeMeta.period,
          cutoff: prizeMeta.cutoff,
          computedAt: prizeMeta.computedAt,
          totalLeagueFeeRaw: prizeMeta.totalLeagueFeeRaw,
          leagueCount: prizeMeta.leagueCount,
          winners: prizeMeta.winners,
          splitBps: prizeMeta.splitBps,
          potRaw: prizeMeta.byCategory[category].potRaw,
          payoutsRaw: prizeMeta.byCategory[category].payoutsRaw
        }
      : undefined;

    // -------------------------------------------------
    // Fastest Finish
    // -------------------------------------------------
    if (category === "fastest_finish") {
      const params = [chainId, cutoffIso, limit];

      const { rows } = await pool.query(
        `
        WITH grads AS (
          SELECT
            c.chain_id,
            c.campaign_address,
            c.name,
            c.symbol,
            c.logo_uri,
            c.creator_address,
            c.created_at_chain,
            c.graduated_at_chain,
            c.created_block,
            c.graduated_block,
            EXTRACT(EPOCH FROM (c.graduated_at_chain - c.created_at_chain))::bigint AS duration_seconds,
            (
              SELECT COUNT(DISTINCT t.wallet)
              FROM curve_trades t
              WHERE t.chain_id = c.chain_id
                AND t.campaign_address = c.campaign_address
                AND t.side = 'buy'
                AND t.block_number >= c.created_block
                AND (c.graduated_block IS NULL OR c.graduated_block = 0 OR t.block_number <= c.graduated_block)
                -- Locked rule: creator buys do not count towards "fastest"
                AND (c.creator_address IS NULL OR t.wallet <> c.creator_address)
            ) AS unique_buyers
          FROM campaigns c
          WHERE c.chain_id = $1
            AND c.created_at_chain IS NOT NULL
            AND c.graduated_at_chain IS NOT NULL
            AND (c.graduated_block IS NOT NULL AND c.graduated_block > 0)
            AND ($2::timestamptz IS NULL OR c.graduated_at_chain >= $2::timestamptz)
        )
        SELECT *
        FROM grads
        WHERE unique_buyers >= 25
        ORDER BY duration_seconds ASC NULLS LAST
        LIMIT $3
        `,
        params
      );

      return json(res, 200, { items: rows, prize: prizeForCategory });
    }

    // -------------------------------------------------
    // Perfect Run (monthly only)
    // -------------------------------------------------
    if (category === "perfect_run") {
      // Locked rule: monthly only. If caller asks weekly/all-time, respond empty.
      if (periodNorm !== "monthly") {
        return json(res, 200, { items: [], warning: "perfect_run is monthly only", prize: prizeForCategory });
      }

      const params = [chainId, cutoffIso, limit];

      const { rows } = await pool.query(
        `
        WITH qualified AS (
          SELECT
            c.chain_id,
            c.campaign_address,
            c.name,
            c.symbol,
            c.logo_uri,
            c.creator_address,
            c.created_at_chain,
            c.graduated_at_chain,
            c.created_block,
            c.graduated_block,
            EXTRACT(EPOCH FROM (c.graduated_at_chain - c.created_at_chain))::bigint AS duration_seconds,
            (
              SELECT COUNT(DISTINCT t.wallet)
              FROM curve_trades t
              WHERE t.chain_id = c.chain_id
                AND t.campaign_address = c.campaign_address
                AND t.side = 'buy'
                AND t.block_number >= c.created_block
                AND t.block_number <= c.graduated_block
                AND (c.creator_address IS NULL OR t.wallet <> c.creator_address)
            ) AS unique_buyers,
            (
              SELECT COALESCE(SUM(t.bnb_amount_raw), 0)::numeric(78,0)
              FROM curve_trades t
              WHERE t.chain_id = c.chain_id
                AND t.campaign_address = c.campaign_address
                AND t.side = 'buy'
                AND t.block_number >= c.created_block
                AND t.block_number <= c.graduated_block
                AND (c.creator_address IS NULL OR t.wallet <> c.creator_address)
            ) AS buy_total_raw
          FROM campaigns c
          WHERE c.chain_id = $1
            AND c.created_at_chain IS NOT NULL
            AND c.graduated_at_chain IS NOT NULL
            AND (c.graduated_block IS NOT NULL AND c.graduated_block > 0)
            AND ($2::timestamptz IS NULL OR c.graduated_at_chain >= $2::timestamptz)
            AND NOT EXISTS (
              SELECT 1
              FROM curve_trades t
              WHERE t.chain_id = c.chain_id
                AND t.campaign_address = c.campaign_address
                AND t.side = 'sell'
                AND t.block_number >= c.created_block
                AND t.block_number <= c.graduated_block
            )
        )
        SELECT *
        FROM qualified
        -- Top 5 determination (deterministic):
        -- 1) strongest demand (buy volume)
        -- 2) most unique buyers
        -- 3) fastest graduation
        ORDER BY buy_total_raw DESC, unique_buyers DESC, duration_seconds ASC
        LIMIT $3
        `,
        params
      );

      return json(res, 200, {
        items: rows,
        warning: rows.length ? undefined : "No Perfect Run qualifiers found. Jackpot rolls over.",
        prize: prizeForCategory
      });
    }

    // -------------------------------------------------
    // Biggest Hit (largest single buy in bonding)
    // -------------------------------------------------
    if (category === "biggest_hit") {
      const params = [chainId, cutoffIso, limit];

      const { rows } = await pool.query(
        `
        SELECT
          t.chain_id,
          t.campaign_address,
          c.name,
          c.symbol,
          c.logo_uri,
          c.creator_address,
          c.fee_recipient_address,
          t.wallet AS buyer_address,
          t.bnb_amount_raw,
          t.tx_hash,
          t.log_index,
          t.block_number,
          t.block_time
        FROM curve_trades t
        JOIN campaigns c
          ON c.chain_id = t.chain_id
         AND c.campaign_address = t.campaign_address
        WHERE t.chain_id = $1
          AND t.side = 'buy'
          AND ($2::timestamptz IS NULL OR t.block_time >= $2::timestamptz)
          -- anti-abuse exclusions
          AND t.wallet <> c.campaign_address
          AND (c.creator_address IS NULL OR t.wallet <> c.creator_address)
          AND (c.fee_recipient_address IS NULL OR t.wallet <> c.fee_recipient_address)
          -- ensure "during bonding" when we have a graduation block
          AND (c.graduated_block IS NULL OR c.graduated_block = 0 OR t.block_number <= c.graduated_block)
        ORDER BY t.bnb_amount_raw::numeric DESC NULLS LAST
        LIMIT $3
        `,
        params
      );

      return json(res, 200, { items: rows, prize: prizeForCategory });
    }

    // -------------------------------------------------
    // Crowd Favorite (most upvotes)
    // -------------------------------------------------
    if (category === "crowd_favorite") {
      const params = [chainId, cutoffIso, limit];

      // Rank by total confirmed vote count first, then unique voters.
      const { rows } = await pool.query(
        `
        WITH agg AS (
          SELECT
            v.chain_id,
            v.campaign_address,
            COUNT(*)::bigint AS votes_count,
            COUNT(DISTINCT v.voter_address)::bigint AS unique_voters,
            COALESCE(SUM(v.amount_raw), 0)::numeric AS amount_raw_sum
          FROM public.votes_confirmed v
          WHERE v.chain_id = $1
            AND ($2::timestamptz IS NULL OR v.block_timestamp >= $2::timestamptz)
          GROUP BY v.chain_id, v.campaign_address
        )
        SELECT
          a.chain_id,
          a.campaign_address,
          c.name,
          c.symbol,
          c.logo_uri,
          c.creator_address,
          a.votes_count,
          a.unique_voters,
          a.amount_raw_sum
        FROM agg a
        JOIN public.campaigns c
          ON c.chain_id = a.chain_id
         AND c.campaign_address = a.campaign_address
        ORDER BY a.votes_count DESC, a.unique_voters DESC
        LIMIT $3
        `,
        params
      );

      return json(res, 200, { items: rows, prize: prizeForCategory });
    }

    // -------------------------------------------------
    // Top Earner (bonding curve trader PnL)
    // -------------------------------------------------
    // Locked rule update:
    // - trader (NOT campaign owner)
    // - realized net BNB profit from curve trades in the period
    //   profit = sum(sell payouts) - sum(buy costs)
    if (category === "top_earner") {
      if (periodNorm === "all_time") {
        return json(res, 200, { items: [], warning: "top_earner is paid weekly/monthly only", prize: prizeForCategory });
      }

      const params = [chainId, cutoffIso, limit];

      const { rows } = await pool.query(
        `
        WITH filtered AS (
          SELECT
            t.wallet,
            t.side,
            t.bnb_amount_raw::numeric AS bnb_raw
          FROM public.curve_trades t
          JOIN public.campaigns c
            ON c.chain_id = t.chain_id
           AND c.campaign_address = t.campaign_address
          WHERE t.chain_id = $1
            AND ($2::timestamptz IS NULL OR t.block_time >= $2::timestamptz)
            -- exclude campaign/creator/feeRecipient wallets for that campaign
            AND t.wallet <> c.campaign_address
            AND (c.creator_address IS NULL OR t.wallet <> c.creator_address)
            AND (c.fee_recipient_address IS NULL OR t.wallet <> c.fee_recipient_address)
        ),
        agg AS (
          SELECT
            wallet,
            SUM(CASE WHEN side = 'sell' THEN bnb_raw ELSE 0 END)::numeric(78,0) AS sells_raw,
            SUM(CASE WHEN side = 'buy' THEN bnb_raw ELSE 0 END)::numeric(78,0) AS buys_raw,
            COUNT(*)::bigint AS trades_count
          FROM filtered
          GROUP BY wallet
        ),
        calc AS (
          SELECT
            wallet,
            (sells_raw - buys_raw)::numeric(78,0) AS profit_raw,
            sells_raw,
            buys_raw,
            trades_count
          FROM agg
        )
        SELECT wallet, profit_raw, sells_raw, buys_raw, trades_count
        FROM calc
        WHERE profit_raw > 0
        ORDER BY profit_raw DESC
        LIMIT $3
        `,
        params
      );

      return json(res, 200, { items: rows, prize: prizeForCategory });
    }

    return json(res, 200, { items: [], prize: prizeForCategory });
  } catch (e) {
    // If the DB schema hasn't been migrated yet, avoid breaking the UI with 500s.
    const code = e?.code;
    console.error("[api/league]", e);
    if (code === "42P01" || code === "42703") {
      return json(res, 200, { items: [], warning: "DB schema missing league columns/tables" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
