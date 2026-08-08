import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

/**
 * Recruiter League for weekly/monthly epochs.
 *
 * STRICT epoch windows only (no all-time recruiter_summaries).
 * Otherwise permanent big recruiters win every board.
 *
 * Score weights align with indexer recruiterLeaderboard defaults:
 *   linked wallets 1, creators 3, traders 2,
 *   referred volume BNB * 0.05, epoch earned BNB * 1
 * (override via RECRUITER_LEADERBOARD_WEIGHT_* env on frontend-api).
 */

function clampInt(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function getWeeklyEpochUtc(epochOffset) {
  const now = new Date();
  const today0 = startOfUtcDay(now);
  const dow = today0.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday0 = new Date(today0.getTime() - daysSinceMonday * 86400_000);
  const epochStart = new Date(thisMonday0.getTime() - epochOffset * 7 * 86400_000);
  const epochEnd = new Date(epochStart.getTime() + 7 * 86400_000);
  const isLive = epochOffset === 0;
  return { period: "weekly", epochOffset, epochStart, epochEnd, rangeEnd: isLive ? now : epochEnd, isLive };
}

function getMonthlyEpochUtc(epochOffset) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const epochStart = new Date(Date.UTC(y, m - epochOffset, 1, 0, 0, 0, 0));
  const epochEnd = new Date(Date.UTC(epochStart.getUTCFullYear(), epochStart.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  const isLive = epochOffset === 0;
  return { period: "monthly", epochOffset, epochStart, epochEnd, rangeEnd: isLive ? now : epochEnd, isLive };
}

function normPeriod(periodRaw) {
  const p = String(periodRaw || "weekly").toLowerCase().trim();
  if (p === "weekly") return "weekly";
  if (p === "monthly") return "monthly";
  return "weekly";
}

function epochMeta(periodNorm, epochOffset) {
  const epoch = periodNorm === "monthly" ? getMonthlyEpochUtc(epochOffset) : getWeeklyEpochUtc(epochOffset);
  return {
    period: periodNorm,
    epochOffset,
    epochStart: epoch.epochStart?.toISOString() || null,
    epochEnd: epoch.epochEnd?.toISOString() || null,
    rangeEnd: epoch.rangeEnd?.toISOString() || null,
    status: epoch.isLive ? "live" : "finalized",
  };
}

function weightNum(envKey, fallback) {
  const n = Number(process.env[envKey] || fallback);
  return Number.isFinite(n) ? n : fallback;
}

function getWeights() {
  return {
    linkedWallets: weightNum("RECRUITER_LEADERBOARD_WEIGHT_LINKED_WALLETS", 1),
    linkedCreators: weightNum("RECRUITER_LEADERBOARD_WEIGHT_LINKED_CREATORS", 3),
    linkedTraders: weightNum("RECRUITER_LEADERBOARD_WEIGHT_LINKED_TRADERS", 2),
    routedVolumeBnb: weightNum("RECRUITER_LEADERBOARD_WEIGHT_ROUTED_VOLUME_BNB", 0.05),
    totalEarnedBnb: weightNum("RECRUITER_LEADERBOARD_WEIGHT_TOTAL_EARNED_BNB", 1),
  };
}

function weiToBnb(raw) {
  try {
    const s = String(raw ?? "0");
    if (!s || s === "0") return 0;
    // avoid floating huge ints: use Number on ether string via split
    const neg = s.startsWith("-");
    const digits = neg ? s.slice(1) : s;
    if (!/^\d+$/.test(digits)) return 0;
    const pad = digits.padStart(19, "0");
    const whole = pad.slice(0, -18) || "0";
    const frac = pad.slice(-18);
    const n = Number(`${whole}.${frac}`);
    return Number.isFinite(n) ? (neg ? -n : n) : 0;
  } catch {
    return 0;
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Epoch-scoped recruiter board.
 * Links / squad joins counted only when linked_at / joined_at fall in [start, end).
 * Referred volume + recruiter earnings from reward_events in the same window
 * where the wallet was actively linked at event time.
 */
async function loadEpochRecruiterRows(startIso, endIso, limit) {
  const weights = getWeights();
  const { rows } = await pool.query(
    `
    WITH epoch_links AS (
      SELECT
        l.recruiter_id,
        l.wallet_address,
        l.linked_at,
        l.detached_at
      FROM public.wallet_recruiter_links l
      WHERE l.is_active = true
        AND l.linked_at >= $1::timestamptz
        AND l.linked_at < $2::timestamptz
    ),
    epoch_squad AS (
      SELECT
        s.recruiter_id,
        s.wallet_address,
        s.member_role,
        s.joined_at
      FROM public.wallet_squad_memberships s
      WHERE s.is_active = true
        AND s.joined_at >= $1::timestamptz
        AND s.joined_at < $2::timestamptz
    ),
    link_stats AS (
      SELECT
        el.recruiter_id,
        count(DISTINCT el.wallet_address)::int AS linked_wallet_count,
        count(DISTINCT el.wallet_address) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.campaigns c
             WHERE lower(c.creator_address) = lower(el.wallet_address)
          )
        )::int AS linked_creators_count,
        count(DISTINCT el.wallet_address) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM public.campaigns c
             WHERE lower(c.creator_address) = lower(el.wallet_address)
          )
        )::int AS linked_traders_count,
        max(el.linked_at) AS latest_linked_activity_at
      FROM epoch_links el
      GROUP BY el.recruiter_id
    ),
    squad_stats AS (
      SELECT
        es.recruiter_id,
        count(DISTINCT es.wallet_address)::int AS active_squad_member_count
      FROM epoch_squad es
      GROUP BY es.recruiter_id
    ),
    event_matches AS (
      -- Trades by wallets that were linked at event time (epoch window on event)
      SELECT
        l.recruiter_id,
        re.raw_amount,
        re.recruiter_amount,
        re.occurred_at
      FROM public.reward_events re
      JOIN public.wallet_recruiter_links l
        ON re.route_kind = 'trade'
       AND re.wallet_address IS NOT NULL
       AND l.wallet_address = re.wallet_address
       AND l.linked_at <= re.occurred_at
       AND (l.detached_at IS NULL OR l.detached_at > re.occurred_at)
      WHERE re.occurred_at >= $1::timestamptz
        AND re.occurred_at < $2::timestamptz
      UNION ALL
      -- Finalize volume attributed to campaign creator's recruiter link
      SELECT
        l.recruiter_id,
        re.raw_amount,
        re.recruiter_amount,
        re.occurred_at
      FROM public.reward_events re
      JOIN public.campaigns c
        ON re.route_kind = 'finalize'
       AND c.chain_id = re.chain_id
       AND c.campaign_address = re.campaign_address
      JOIN public.wallet_recruiter_links l
        ON l.wallet_address = lower(c.creator_address)
       AND l.linked_at <= re.occurred_at
       AND (l.detached_at IS NULL OR l.detached_at > re.occurred_at)
      WHERE re.occurred_at >= $1::timestamptz
        AND re.occurred_at < $2::timestamptz
    ),
    event_totals AS (
      SELECT
        recruiter_id,
        coalesce(sum(raw_amount), 0)::numeric AS referred_volume_raw,
        coalesce(sum(recruiter_amount), 0)::numeric AS epoch_earned_raw,
        max(occurred_at) AS last_referred_event_at
      FROM event_matches
      GROUP BY recruiter_id
    ),
    recruiter_ids AS (
      SELECT recruiter_id FROM link_stats
      UNION
      SELECT recruiter_id FROM squad_stats
      UNION
      SELECT recruiter_id FROM event_totals
    )
    SELECT
      r.id AS recruiter_id,
      r.wallet_address,
      r.code,
      r.display_name,
      r.is_og,
      r.status,
      coalesce(ls.linked_wallet_count, 0) AS linked_wallet_count,
      coalesce(ss.active_squad_member_count, 0) AS active_squad_member_count,
      coalesce(ls.linked_creators_count, 0) AS linked_creators_count,
      coalesce(ls.linked_traders_count, 0) AS linked_traders_count,
      coalesce(et.referred_volume_raw, 0)::text AS referred_volume_raw,
      coalesce(et.epoch_earned_raw, 0)::text AS epoch_earned_raw,
      coalesce(ls.latest_linked_activity_at, et.last_referred_event_at) AS latest_linked_activity_at
    FROM recruiter_ids ids
    JOIN public.recruiters r ON r.id = ids.recruiter_id
    LEFT JOIN link_stats ls ON ls.recruiter_id = r.id
    LEFT JOIN squad_stats ss ON ss.recruiter_id = r.id
    LEFT JOIN event_totals et ON et.recruiter_id = r.id
    WHERE r.status = 'active'
    `,
    [startIso, endIso],
  );

  const scored = rows.map((row) => {
    const linkedWalletCount = toNumber(row.linked_wallet_count);
    const linkedCreatorsCount = toNumber(row.linked_creators_count);
    const linkedTradersCount = toNumber(row.linked_traders_count);
    const activeSquadMemberCount = toNumber(row.active_squad_member_count);
    const volumeBnb = weiToBnb(row.referred_volume_raw);
    const earnedBnb = weiToBnb(row.epoch_earned_raw);
    const weightedScore =
      linkedWalletCount * weights.linkedWallets +
      linkedCreatorsCount * weights.linkedCreators +
      linkedTradersCount * weights.linkedTraders +
      volumeBnb * weights.routedVolumeBnb +
      earnedBnb * weights.totalEarnedBnb;

    return {
      recruiterId: toNumber(row.recruiter_id),
      wallet: row.wallet_address ? String(row.wallet_address).toLowerCase() : null,
      walletAddress: row.wallet_address ? String(row.wallet_address).toLowerCase() : null,
      code: row.code || null,
      displayName: row.display_name || null,
      isOg: Boolean(row.is_og),
      status: row.status || "active",
      linkedWalletCount,
      activeSquadMemberCount,
      linkedCreatorsCount,
      linkedTradersCount,
      referredVolumeRaw: String(row.referred_volume_raw || "0"),
      referredVolumeBnb: volumeBnb,
      referredVolumeUsd: 0, // filled by summary when BNB/USD known
      epochEarnedRaw: String(row.epoch_earned_raw || "0"),
      epochEarnedBnb: earnedBnb,
      latestLinkedActivityAt: row.latest_linked_activity_at || null,
      weightedScore,
      claimStatus: "Pending",
      estimatedPayoutUsd: 0,
      scoreBasis: "epoch_window",
    };
  });

  scored.sort((a, b) => {
    if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
    if (b.referredVolumeBnb !== a.referredVolumeBnb) return b.referredVolumeBnb - a.referredVolumeBnb;
    if (b.linkedWalletCount !== a.linkedWalletCount) return b.linkedWalletCount - a.linkedWalletCount;
    return (a.recruiterId || 0) - (b.recruiterId || 0);
  });

  return scored.slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Links-only fallback when reward_events table is missing. */
async function loadEpochLinksOnly(startIso, endIso, limit) {
  const weights = getWeights();
  const { rows } = await pool.query(
    `
    SELECT
      r.id AS recruiter_id,
      r.wallet_address,
      r.code,
      r.display_name,
      r.is_og,
      r.status,
      count(DISTINCT l.wallet_address)::int AS linked_wallet_count,
      count(DISTINCT s.wallet_address)::int AS active_squad_member_count,
      count(DISTINCT l.wallet_address) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.campaigns c
           WHERE lower(c.creator_address) = lower(l.wallet_address)
        )
      )::int AS linked_creators_count,
      count(DISTINCT l.wallet_address) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM public.campaigns c
           WHERE lower(c.creator_address) = lower(l.wallet_address)
        )
      )::int AS linked_traders_count,
      max(l.linked_at) AS latest_linked_activity_at
    FROM public.recruiters r
    LEFT JOIN public.wallet_recruiter_links l
      ON l.recruiter_id = r.id
     AND l.is_active = true
     AND l.linked_at >= $1::timestamptz
     AND l.linked_at < $2::timestamptz
    LEFT JOIN public.wallet_squad_memberships s
      ON s.recruiter_id = r.id
     AND s.is_active = true
     AND s.joined_at >= $1::timestamptz
     AND s.joined_at < $2::timestamptz
    WHERE r.status = 'active'
    GROUP BY r.id
    HAVING count(DISTINCT l.wallet_address) > 0
        OR count(DISTINCT s.wallet_address) > 0
    ORDER BY linked_wallet_count DESC, active_squad_member_count DESC, r.id ASC
    LIMIT $3
    `,
    [startIso, endIso, limit],
  );

  return rows.map((row, index) => {
    const linkedWalletCount = toNumber(row.linked_wallet_count);
    const linkedCreatorsCount = toNumber(row.linked_creators_count);
    const linkedTradersCount = toNumber(row.linked_traders_count);
    const activeSquadMemberCount = toNumber(row.active_squad_member_count);
    const weightedScore =
      linkedWalletCount * weights.linkedWallets +
      linkedCreatorsCount * weights.linkedCreators +
      linkedTradersCount * weights.linkedTraders;

    return {
      rank: index + 1,
      recruiterId: toNumber(row.recruiter_id),
      wallet: row.wallet_address ? String(row.wallet_address).toLowerCase() : null,
      walletAddress: row.wallet_address ? String(row.wallet_address).toLowerCase() : null,
      code: row.code || null,
      displayName: row.display_name || null,
      isOg: Boolean(row.is_og),
      status: row.status || "active",
      linkedWalletCount,
      activeSquadMemberCount,
      linkedCreatorsCount,
      linkedTradersCount,
      referredVolumeRaw: "0",
      referredVolumeBnb: 0,
      referredVolumeUsd: 0,
      epochEarnedRaw: "0",
      epochEarnedBnb: 0,
      latestLinkedActivityAt: row.latest_linked_activity_at || null,
      weightedScore,
      claimStatus: "Pending",
      estimatedPayoutUsd: 0,
      scoreBasis: "epoch_links_only",
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  const q = getQuery(req);
  const periodNorm = normPeriod(q.period);
  const epochOffset =
    periodNorm === "monthly" ? clampInt(q.epochOffset ?? 0, 0, 12, 0) : clampInt(q.epochOffset ?? 0, 0, 12, 0);
  const limit = clampInt(q.limit ?? 10, 1, 50, 10);
  const meta = epochMeta(periodNorm, epochOffset);
  const startIso = meta.epochStart;
  const endIso = meta.rangeEnd;
  const weights = getWeights();

  try {
    let rows;
    let warning;
    try {
      rows = await loadEpochRecruiterRows(startIso, endIso, limit);
    } catch (error) {
      if (!schemaMissing(error)) throw error;
      console.warn("[api/league recruiter] reward_events path unavailable; links-only epoch board", error?.message || error);
      rows = await loadEpochLinksOnly(startIso, endIso, limit);
      warning =
        "Epoch recruiter volume table unavailable; board ranks links/squad joins in this epoch only (not all-time).";
    }

    if (!rows.length) {
      warning =
        warning ||
        "No recruiter activity in this epoch yet (new links, squad joins, or referred volume). All-time history does not count.";
    }

    return json(res, 200, {
      items: rows,
      epoch: meta,
      stats: {
        recruitersRanked: rows.length,
        scoreBasis: rows[0]?.scoreBasis || "epoch_window",
        period: periodNorm,
        weights,
      },
      warning,
    });
  } catch (error) {
    console.error("[api/league recruiter]", error);
    if (schemaMissing(error)) {
      return json(res, 200, {
        items: [],
        warning: "Recruiter League schema has not been applied yet.",
        epoch: meta,
        stats: { recruitersRanked: 0 },
      });
    }
    return json(res, 500, { error: "Server error" });
  }
}
