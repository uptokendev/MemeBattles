import { ethers } from "ethers";
import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../server/http.js";

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

// ---------------------------
// Fixed epochs (UTC, locked)
// ---------------------------
// Weekly: Monday 00:00 UTC → next Monday 00:00 UTC
// Monthly: 1st 00:00 UTC → next 1st 00:00 UTC
// For live epoch: rangeEnd = now
// For past epoch: rangeEnd = epochEnd

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function getWeeklyEpochUtc(epochOffset) {
  const now = new Date();
  const today0 = startOfUtcDay(now);
  // JS: 0=Sun..6=Sat. We want Monday-based.
  const dow = today0.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  const thisMonday0 = new Date(today0.getTime() - daysSinceMonday * 86400_000);
  const epochStart = new Date(thisMonday0.getTime() - epochOffset * 7 * 86400_000);
  const epochEnd = new Date(epochStart.getTime() + 7 * 86400_000);
  const isLive = epochOffset === 0;
  const rangeEnd = isLive ? now : epochEnd;
  return {
    period: "weekly",
    epochOffset,
    epochStart,
    epochEnd,
    rangeEnd,
    isLive
  };
}

function getMonthlyEpochUtc(epochOffset) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const thisMonthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const epochStart = new Date(Date.UTC(y, m - epochOffset, 1, 0, 0, 0, 0));
  const epochEnd = new Date(Date.UTC(epochStart.getUTCFullYear(), epochStart.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  // If epochOffset is 0, use thisMonthStart for clarity, but the computed epochStart already matches.
  const isLive = epochOffset === 0;
  const rangeEnd = isLive ? now : epochEnd;
  return {
    period: "monthly",
    epochOffset,
    epochStart,
    epochEnd,
    rangeEnd,
    isLive
  };
}

function getEpoch(periodNorm, epochOffset) {
  if (periodNorm === "weekly") return getWeeklyEpochUtc(epochOffset);
  if (periodNorm === "monthly") return getMonthlyEpochUtc(epochOffset);
  return {
    period: "all_time",
    epochOffset: 0,
    epochStart: null,
    epochEnd: null,
    rangeEnd: null,
    isLive: false
  };
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

// ---------------------------
// Claims (signature + nonce)
// ---------------------------

function buildClaimMessage({ chainId, recipient, period, epochStart, category, rank, nonce }) {
  return [
    "MemeBattles League",
    "Action: LEAGUE_CLAIM",
    `ChainId: ${chainId}`,
    `Recipient: ${String(recipient).toLowerCase()}`,
    `Period: ${period}`,
    `EpochStart: ${epochStart}`,
    `Category: ${category}`,
    `Rank: ${rank}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

async function consumeNonce(chainId, address, nonce) {
  const { rows } = await pool.query(
    `SELECT nonce, expires_at, used_at
     FROM auth_nonces
     WHERE chain_id = $1 AND address = $2
     LIMIT 1`,
    [chainId, address]
  );
  const row = rows[0];
  if (!row) throw new Error("Nonce not found");
  if (row.used_at) throw new Error("Nonce already used");
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!exp || Date.now() > exp) throw new Error("Nonce expired");
  if (String(row.nonce) !== String(nonce)) throw new Error("Nonce mismatch");

  await pool.query(
    `UPDATE auth_nonces SET used_at = NOW() WHERE chain_id = $1 AND address = $2`,
    [chainId, address]
  );
}

function splitPotRaw(potRawBigInt) {
  const pot = BigInt(potRawBigInt);
  const payouts = PRIZE_SPLIT_BPS.map((bps) => (pot * BigInt(bps)) / 10000n);
  const sum = payouts.reduce((a, b) => a + b, 0n);
  // Push rounding dust to #1 so totals reconcile.
  payouts[0] = payouts[0] + (pot - sum);
  return payouts.map((x) => x.toString());
}

async function computeTotalLeagueFeeRawInRange(chainId, startIso, endIso, protocolFeeBps, leagueFeeBps) {
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
        AND ($3::timestamptz IS NULL OR t.block_time < $3::timestamptz)
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
    [chainId, startIso ?? null, endIso ?? null, protocolFeeBps, leagueFeeBps]
  );

  const v = rows?.[0]?.total_league_fee_raw;
  // Always return integer string.
  return String(v ?? "0");
}

async function getPrizeMeta(chainId, periodNorm, epochStartIso, rangeEndIso) {
  const eligible = prizeEligibleCategories(periodNorm);
  if (!eligible) return null;

  // Keyed by epoch start so we never bleed between epochs on warm instances.
  const key = `${chainId}:${periodNorm}:${epochStartIso ?? ""}`;
  const now = Date.now();
  const cached = prizeCache.get(key);
  if (cached && now - cached.computedAtMs < PRIZE_TTL_MS) return cached.data;

  const protocolFeeBps = readBps("PROTOCOL_FEE_BPS", DEFAULT_PROTOCOL_FEE_BPS);
  const leagueFeeBps = readBps("LEAGUE_FEE_BPS", DEFAULT_LEAGUE_FEE_BPS);

  const totalLeagueFeeRaw = await computeTotalLeagueFeeRawInRange(
    chainId,
    epochStartIso ?? null,
    rangeEndIso ?? null,
    protocolFeeBps,
    leagueFeeBps
  );
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
    cutoff: epochStartIso,
    rangeEnd: rangeEndIso,
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
  // POST = claim a finalized prize (Profile -> Rewards)
  if (req.method === "POST") {
    try {
      const b = await readJson(req);
      const action = String(b.action ?? "").toLowerCase().trim();
      if (action !== "claim") return json(res, 400, { error: "Invalid action" });

      const chainId = Number(b.chainId);
      const period = String(b.period ?? "").toLowerCase().trim();
      const epochStart = String(b.epochStart ?? "").trim();
      const category = String(b.category ?? "").toLowerCase().trim();
      const rank = Number(b.rank);
      const recipient = String(b.recipient ?? b.address ?? "").toLowerCase().trim();
      const nonce = String(b.nonce ?? "");
      const signature = String(b.signature ?? "");

      if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
      if (!isAddress(recipient)) return json(res, 400, { error: "Invalid recipient" });
      if (!(period === "weekly" || period === "monthly")) return json(res, 400, { error: "Invalid period" });
      if (!CATEGORY_SET.has(category)) return json(res, 400, { error: "Invalid category" });
      if (!Number.isFinite(rank) || rank < 1 || rank > 5) return json(res, 400, { error: "Invalid rank" });
      if (!epochStart) return json(res, 400, { error: "epochStart missing" });
      if (!nonce) return json(res, 400, { error: "Nonce missing" });
      if (!signature) return json(res, 400, { error: "Signature missing" });
      if (!pool) return json(res, 500, { error: "Server misconfigured: DATABASE_URL missing" });

      // Nonce must match the *recipient* (wallet) signing the claim.
      await consumeNonce(chainId, recipient, nonce);

      const msg = buildClaimMessage({ chainId, recipient, period, epochStart, category, rank, nonce });
      const recovered = ethers.verifyMessage(msg, signature).toLowerCase();
      if (recovered !== recipient) return json(res, 401, { error: "Invalid signature" });

      // Winner must exist, and must belong to recipient.
      const { rows: wrows } = await pool.query(
        `SELECT epoch_end AS "epochEnd", recipient_address AS "recipientAddress", amount_raw AS "amountRaw"
           FROM league_epoch_winners
          WHERE chain_id = $1
            AND period = $2
            AND epoch_start = $3::timestamptz
            AND category = $4
            AND rank = $5
          LIMIT 1`,
        [chainId, period, epochStart, category, rank]
      );
      const w = wrows[0];
      if (!w) return json(res, 404, { error: "Winner not found" });
      if (String(w.recipientAddress ?? "").toLowerCase() !== recipient) {
        return json(res, 403, { error: "Not the winner" });
      }

      // Optional safety: only allow claims after epoch end.
      const epochEndMs = w.epochEnd ? new Date(w.epochEnd).getTime() : 0;
      if (epochEndMs && Date.now() < epochEndMs) {
        return json(res, 400, { error: "Epoch not finalized" });
      }

      // Record the claim (prevents double-claim)
      await pool.query(
        `INSERT INTO league_epoch_claims (chain_id, period, epoch_start, category, rank, recipient_address, signature)
         VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7)
         ON CONFLICT (chain_id, period, epoch_start, category, rank)
         DO NOTHING`,
        [chainId, period, epochStart, category, rank, recipient, signature]
      );

      // If already claimed, the insert is ignored. Detect it.
      const { rows: crows } = await pool.query(
        `SELECT claimed_at AS "claimedAt"
           FROM league_epoch_claims
          WHERE chain_id = $1 AND period = $2 AND epoch_start = $3::timestamptz AND category = $4 AND rank = $5
          LIMIT 1`,
        [chainId, period, epochStart, category, rank]
      );
      const claimedAt = crows?.[0]?.claimedAt ? new Date(crows[0].claimedAt).toISOString() : null;

      return json(res, 200, { ok: true, claimedAt, amountRaw: w.amountRaw });
    } catch (e) {
      const msg = String(e?.message ?? "");
      const isAuth = /nonce|signature/i.test(msg);
      console.error("[api/league claim]", e);
      return json(res, isAuth ? 401 : 500, { error: isAuth ? msg : "Server error" });
    }
  }

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
    const epochOffset =
      periodNorm === "weekly"
        ? clampInt(q.epochOffset ?? 0, 0, 2, 0)
        : periodNorm === "monthly"
          ? clampInt(q.epochOffset ?? 0, 0, 1, 0)
          : 0;

    const epoch = getEpoch(periodNorm, epochOffset);
    const epochStartIso = epoch?.epochStart ? epoch.epochStart.toISOString() : null;
    const epochEndIso = epoch?.epochEnd ? epoch.epochEnd.toISOString() : null;
    const rangeEndIso = epoch?.rangeEnd ? epoch.rangeEnd.toISOString() : null;

    const limit = clampInt(q.limit ?? 10, 1, 50, 10);

    // Prize meta is computed once per chain/period per warm instance (and TTL = 1h).
    // This prevents recomputing fee totals on every category request.
    const prizeMeta = await getPrizeMeta(chainId, periodNorm, epochStartIso, rangeEndIso);
    const prizeForCategory = prizeMeta?.byCategory?.[category]
      ? {
          basis: prizeMeta.basis,
          period: prizeMeta.period,
          cutoff: prizeMeta.cutoff,
          rangeEnd: prizeMeta.rangeEnd,
          computedAt: prizeMeta.computedAt,
          totalLeagueFeeRaw: prizeMeta.totalLeagueFeeRaw,
          leagueCount: prizeMeta.leagueCount,
          winners: prizeMeta.winners,
          splitBps: prizeMeta.splitBps,
          potRaw: prizeMeta.byCategory[category].potRaw,
          payoutsRaw: prizeMeta.byCategory[category].payoutsRaw
        }
      : undefined;

    const epochMeta =
      periodNorm === "weekly" || periodNorm === "monthly"
        ? {
            period: periodNorm,
            epochOffset,
            epochStart: epochStartIso,
            epochEnd: epochEndIso,
            rangeEnd: rangeEndIso,
            status: epoch.isLive ? "live" : "finalized"
          }
        : undefined;

    // -------------------------------------------------
    // Fastest Finish
    // -------------------------------------------------
    if (category === "fastest_finish") {
      const params = [chainId, epochStartIso, rangeEndIso, limit];

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
            AND ($3::timestamptz IS NULL OR c.graduated_at_chain < $3::timestamptz)
        )
        SELECT *
        FROM grads
        WHERE unique_buyers >= 25
        ORDER BY duration_seconds ASC NULLS LAST
        LIMIT $4
        `,
        params
      );

      return json(res, 200, { items: rows, prize: prizeForCategory, epoch: epochMeta });
    }

    // -------------------------------------------------
    // Perfect Run (monthly only)
    // -------------------------------------------------
    if (category === "perfect_run") {
      // Locked rule: monthly only. If caller asks weekly/all-time, respond empty.
      if (periodNorm !== "monthly") {
        return json(res, 200, { items: [], warning: "perfect_run is monthly only", prize: prizeForCategory, epoch: epochMeta });
      }

      const params = [chainId, epochStartIso, rangeEndIso, limit];

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
            AND ($3::timestamptz IS NULL OR c.graduated_at_chain < $3::timestamptz)
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
        LIMIT $4
        `,
        params
      );

      return json(res, 200, {
        items: rows,
        warning: rows.length ? undefined : "No Perfect Run qualifiers found. Jackpot rolls over.",
        prize: prizeForCategory,
        epoch: epochMeta
      });
    }

    // -------------------------------------------------
    // Biggest Hit (largest single buy in bonding)
    // -------------------------------------------------
    if (category === "biggest_hit") {
      const params = [chainId, epochStartIso, rangeEndIso, limit];

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
          AND ($3::timestamptz IS NULL OR t.block_time < $3::timestamptz)
          -- anti-abuse exclusions
          AND t.wallet <> c.campaign_address
          AND (c.creator_address IS NULL OR t.wallet <> c.creator_address)
          AND (c.fee_recipient_address IS NULL OR t.wallet <> c.fee_recipient_address)
          -- ensure "during bonding" when we have a graduation block
          AND (c.graduated_block IS NULL OR c.graduated_block = 0 OR t.block_number <= c.graduated_block)
        ORDER BY t.bnb_amount_raw::numeric DESC NULLS LAST
        LIMIT $4
        `,
        params
      );

      return json(res, 200, { items: rows, prize: prizeForCategory, epoch: epochMeta });
    }

    // -------------------------------------------------
    // Crowd Favorite (most upvotes)
    // -------------------------------------------------
    if (category === "crowd_favorite") {
      const params = [chainId, epochStartIso, rangeEndIso, limit];

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
            AND ($3::timestamptz IS NULL OR v.block_timestamp < $3::timestamptz)
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
        LIMIT $4
        `,
        params
      );

      return json(res, 200, { items: rows, prize: prizeForCategory, epoch: epochMeta });
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

      const params = [chainId, epochStartIso, rangeEndIso, limit];

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
            AND ($3::timestamptz IS NULL OR t.block_time < $3::timestamptz)
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
        LIMIT $4
        `,
        params
      );

      return json(res, 200, { items: rows, prize: prizeForCategory, epoch: epochMeta });
    }

    return json(res, 200, { items: [], prize: prizeForCategory, epoch: epochMeta });
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
