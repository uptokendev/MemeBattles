import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

function clampInt(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
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
  return "all_time";
}

function getEpoch(periodNorm, epochOffset) {
  if (periodNorm === "weekly") return getWeeklyEpochUtc(epochOffset);
  if (periodNorm === "monthly") return getMonthlyEpochUtc(epochOffset);
  return { period: "all_time", epochOffset: 0, epochStart: null, epochEnd: null, rangeEnd: null, isLive: false };
}

function epochMeta(periodNorm, epochOffset) {
  const epoch = getEpoch(periodNorm, epochOffset);
  if (!(periodNorm === "weekly" || periodNorm === "monthly")) return undefined;
  return {
    period: periodNorm,
    epochOffset,
    epochStart: epoch.epochStart?.toISOString() || null,
    epochEnd: epoch.epochEnd?.toISOString() || null,
    rangeEnd: epoch.rangeEnd?.toISOString() || null,
    status: epoch.isLive ? "live" : "finalized",
  };
}

function firstValue(row, keys, fallback = undefined) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRecruiterRow(raw, index) {
  const row = raw?.data && typeof raw.data === "object" ? raw.data : raw || {};
  const linkedWalletCount = toNumber(firstValue(row, ["linked_wallet_count", "linkedWalletCount", "linked_wallets", "linkedWallets", "wallet_count", "wallets"]));
  const activeSquadMemberCount = toNumber(firstValue(row, ["active_squad_member_count", "activeSquadMemberCount", "squad_member_count", "squadMembers", "members"]));
  const linkedCreatorsCount = toNumber(firstValue(row, ["linked_creators_count", "linkedCreatorsCount", "creator_count", "creators"]));
  const linkedTradersCount = toNumber(firstValue(row, ["linked_traders_count", "linkedTradersCount", "trader_count", "traders"]));
  const referredVolumeUsd = toNumber(firstValue(row, ["referred_volume_usd", "referredVolumeUsd", "volume_usd", "total_volume_usd"]));
  const weightedScore = toNumber(
    firstValue(row, ["weighted_score", "weightedScore", "score", "league_score"]),
    linkedWalletCount * 10 + activeSquadMemberCount * 20 + linkedCreatorsCount * 15 + linkedTradersCount * 10 + referredVolumeUsd / 1000,
  );

  return {
    rank: toNumber(firstValue(row, ["rank", "position"]), index + 1),
    recruiterId: toNumber(firstValue(row, ["recruiter_id", "recruiterId", "id"]), undefined),
    wallet: firstValue(row, ["wallet", "wallet_address", "walletAddress", "recruiter_wallet", "address"], null),
    walletAddress: firstValue(row, ["wallet_address", "walletAddress", "wallet", "recruiter_wallet", "address"], null),
    code: firstValue(row, ["code", "recruiter_code", "recruiterCode", "ref_code"], null),
    displayName: firstValue(row, ["display_name", "displayName", "name", "handle"], null),
    isOg: Boolean(firstValue(row, ["is_og", "isOg", "og"], false)),
    status: firstValue(row, ["status", "recruiter_status"], "active"),
    linkedWalletCount,
    activeSquadMemberCount,
    linkedCreatorsCount,
    linkedTradersCount,
    referredVolumeUsd,
    latestLinkedActivityAt: firstValue(row, ["latest_linked_activity_at", "latestLinkedActivityAt", "last_linked_at", "updated_at"], null),
    weightedScore,
    estimatedPayoutUsd: toNumber(firstValue(row, ["estimated_payout_usd", "estimatedPayoutUsd", "claimable_usd", "payout_usd"])),
    claimStatus: firstValue(row, ["claim_status", "claimStatus", "settlement_status"], "Pending"),
  };
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    const scoreDiff = toNumber(b.weightedScore) - toNumber(a.weightedScore);
    if (scoreDiff) return scoreDiff;
    const walletDiff = toNumber(b.linkedWalletCount) - toNumber(a.linkedWalletCount);
    if (walletDiff) return walletDiff;
    return toNumber(b.activeSquadMemberCount) - toNumber(a.activeSquadMemberCount);
  });
}

async function loadSummaryRows(limit) {
  const { rows } = await pool.query("select to_jsonb(s) as data from public.recruiter_summaries s limit $1", [Math.max(limit, 100)]);
  return sortRows(rows.map((row, index) => normalizeRecruiterRow(row, index))).slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }));
}

async function loadJoinedRows(startIso, endIso, limit) {
  const { rows } = await pool.query(
    `select r.id,
            r.wallet_address,
            r.code,
            r.display_name,
            r.is_og,
            r.status,
            r.created_at,
            count(distinct l.wallet_address)::int as linked_wallet_count,
            count(distinct s.wallet_address)::int as active_squad_member_count,
            count(distinct s.wallet_address) filter (where s.member_role = 'creator')::int as linked_creators_count,
            count(distinct s.wallet_address) filter (where s.member_role = 'trader')::int as linked_traders_count,
            max(l.linked_at) as latest_linked_activity_at,
            (
              count(distinct l.wallet_address) * 10
              + count(distinct s.wallet_address) * 20
              + count(distinct s.wallet_address) filter (where s.member_role = 'creator') * 15
              + count(distinct s.wallet_address) filter (where s.member_role = 'trader') * 10
              + case when r.is_og then 25 else 0 end
            )::int as weighted_score
       from public.recruiters r
       left join public.wallet_recruiter_links l
         on l.recruiter_id = r.id
        and l.is_active = true
        and ($1::timestamptz is null or l.linked_at >= $1::timestamptz)
        and ($2::timestamptz is null or l.linked_at < $2::timestamptz)
       left join public.wallet_squad_memberships s
         on s.recruiter_id = r.id
        and s.is_active = true
        and ($1::timestamptz is null or s.joined_at >= $1::timestamptz)
        and ($2::timestamptz is null or s.joined_at < $2::timestamptz)
      where r.status = 'active'
      group by r.id
      order by weighted_score desc, linked_wallet_count desc, active_squad_member_count desc, r.created_at asc
      limit $3`,
    [startIso, endIso, limit],
  );
  return rows.map((row, index) => normalizeRecruiterRow(row, index));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  const enabled = envFlag("LEAGUE_RECRUITER_ENABLED", false);
  const q = getQuery(req);
  const periodRaw = String(q.period ?? "weekly").toLowerCase().trim();
  const periodNorm = normPeriod(periodRaw);
  const epochOffset =
    periodNorm === "weekly"
      ? clampInt(q.epochOffset ?? 0, 0, 2, 0)
      : periodNorm === "monthly"
        ? clampInt(q.epochOffset ?? 0, 0, 1, 0)
        : 0;
  const limit = clampInt(q.limit ?? 10, 1, 50, 10);
  const meta = epochMeta(periodNorm, epochOffset);

  if (!enabled) {
    return json(res, 200, {
      items: [],
      warning: "Recruiter League feed is disabled on this API environment.",
      epoch: meta,
      stats: { recruitersRanked: 0 },
    });
  }

  const startIso = meta?.epochStart || null;
  const endIso = meta?.rangeEnd || null;

  try {
    let rows;
    try {
      rows = await loadSummaryRows(limit);
    } catch (summaryError) {
      if (!schemaMissing(summaryError)) console.warn("[api/league recruiter summaries]", summaryError);
      rows = await loadJoinedRows(startIso, endIso, limit);
    }

    return json(res, 200, {
      items: rows,
      epoch: meta,
      stats: { recruitersRanked: rows.length },
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
