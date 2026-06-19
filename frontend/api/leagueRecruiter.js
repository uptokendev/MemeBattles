import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

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

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

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

  try {
    const startIso = meta?.epochStart || null;
    const endIso = meta?.rangeEnd || null;

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

    return json(res, 200, {
      items: rows.map((r, index) => ({
        rank: index + 1,
        recruiterId: Number(r.id),
        wallet: r.wallet_address,
        walletAddress: r.wallet_address,
        code: r.code,
        displayName: r.display_name,
        isOg: Boolean(r.is_og),
        status: r.status,
        linkedWalletCount: Number(r.linked_wallet_count || 0),
        activeSquadMemberCount: Number(r.active_squad_member_count || 0),
        linkedCreatorsCount: Number(r.linked_creators_count || 0),
        linkedTradersCount: Number(r.linked_traders_count || 0),
        latestLinkedActivityAt: r.latest_linked_activity_at || null,
        weightedScore: Number(r.weighted_score || 0),
      })),
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
