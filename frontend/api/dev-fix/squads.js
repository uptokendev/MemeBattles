import { pool } from "../../server/db.js";
import { badMethod, getQuery, json } from "../../server/http.js";

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function parseLimit(value, fallback = 50, max = 250) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function summaryFromRows(recruiter, rows) {
  const activeRows = rows.filter((row) => row.is_active !== false);
  return {
    recruiterId: Number(recruiter.id),
    recruiterWalletAddress: recruiter.wallet_address,
    recruiterCode: recruiter.code,
    recruiterDisplayName: recruiter.display_name || null,
    recruiterIsOg: Boolean(recruiter.is_og),
    recruiterStatus: recruiter.status || "active",
    activeMemberCount: activeRows.length,
    eligibleMemberCount: activeRows.filter((row) => row.member_role === "creator" || row.member_role === "trader").length,
    creators: activeRows.filter((row) => row.member_role === "creator").length,
    traders: activeRows.filter((row) => row.member_role === "trader").length,
    pending: activeRows.filter((row) => row.member_role !== "creator" && row.member_role !== "trader").length,
    inactiveLinks: rows.filter((row) => row.is_active === false).length,
    totalEligibleScore: "0",
    routedEventCount: 0,
    routedSquadAmountTotal: "0",
    currentEpochRoutedSquadAmount: "0",
    estimatedPendingPoolAmount: "0",
    lastRoutedAt: null,
    currentEpochId: null,
    currentEpochStartAt: null,
    currentEpochEndAt: null,
    materializedAt: new Date().toISOString(),
  };
}

async function findRecruiterByCode(code) {
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, is_og, status, created_at, updated_at
       from public.recruiters
      where lower(code) = lower($1)
      limit 1`,
    [code],
  );
  return rows[0] || null;
}

async function loadSquadRows({ recruiterId, recruiterCode, limit = 250 }) {
  const { rows } = await pool.query(
    `select s.wallet_address,
            s.recruiter_id,
            r.code as recruiter_code,
            coalesce(nullif(s.member_role, ''), 'member') as member_role,
            coalesce(nullif(s.link_source, ''), 'recruiter') as source,
            coalesce(s.joined_at, s.created_at) as created_at,
            s.updated_at,
            coalesce(s.is_active, true) as is_active
       from public.wallet_squad_memberships s
       join public.recruiters r on r.id = s.recruiter_id
      where ($1::bigint is null or s.recruiter_id = $1::bigint)
        and ($2::text is null or lower(r.code) = lower($2::text))
      order by coalesce(s.joined_at, s.created_at) desc nulls last
      limit $3`,
    [recruiterId || null, recruiterCode || null, limit],
  );
  return rows;
}

export async function squadSummary(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const code = normalizeCode(req.params?.code);
    if (!code) return json(res, 400, { error: "Missing recruiter code" });

    const recruiter = await findRecruiterByCode(code);
    if (!recruiter) return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });

    const rows = await loadSquadRows({ recruiterId: recruiter.id, recruiterCode: recruiter.code });
    return json(res, 200, {
      squad: summaryFromRows(recruiter, rows),
      recruiterCode: recruiter.code,
      exists: true,
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/squads summary]", error);
    if (schemaMissing(error)) return json(res, 200, { squad: null, exists: false, warning: "Recruiter squad schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function squadMembers(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const q = getQuery(req);
    const recruiterCode = normalizeCode(q.recruiterCode || req.params?.code);
    const limit = parseLimit(q.limit, 50, 250);
    const rows = await loadSquadRows({ recruiterId: null, recruiterCode: recruiterCode || null, limit });

    return json(res, 200, {
      items: rows.map((row) => ({
        wallet: row.wallet_address,
        walletAddress: row.wallet_address,
        recruiterId: Number(row.recruiter_id),
        recruiterCode: row.recruiter_code,
        memberRole: row.member_role,
        linkStatus: row.is_active ? "active" : "inactive",
        source: row.source || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      })),
      recruiterCode: recruiterCode || null,
      walletAddress: q.walletAddress || null,
      epochId: q.epochId ? Number(q.epochId) : null,
      limit,
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/squads members]", error);
    if (schemaMissing(error)) return json(res, 200, { items: [], warning: "Recruiter squad schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function squadsLeaderboard(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const q = getQuery(req);
    const limit = parseLimit(q.limit, 100, 250);
    const { rows } = await pool.query(
      `select r.id,
              r.wallet_address,
              r.code,
              r.display_name,
              r.is_og,
              r.status,
              count(s.wallet_address) filter (where coalesce(s.is_active, true) = true)::int as active_member_count,
              count(s.wallet_address) filter (where coalesce(s.is_active, true) = true and s.member_role = 'creator')::int as creators,
              count(s.wallet_address) filter (where coalesce(s.is_active, true) = true and s.member_role = 'trader')::int as traders,
              count(s.wallet_address) filter (where coalesce(s.is_active, true) = true and coalesce(nullif(s.member_role, ''), 'member') not in ('creator', 'trader'))::int as pending
         from public.recruiters r
         left join public.wallet_squad_memberships s on s.recruiter_id = r.id
        where r.status = 'active'
        group by r.id
        order by active_member_count desc, r.created_at asc
        limit $1`,
      [limit],
    );

    return json(res, 200, {
      items: rows.map((row) => ({
        recruiterId: Number(row.id),
        recruiterWalletAddress: row.wallet_address,
        recruiterCode: row.code,
        recruiterDisplayName: row.display_name || null,
        recruiterIsOg: Boolean(row.is_og),
        recruiterStatus: row.status,
        activeMemberCount: Number(row.active_member_count || 0),
        creators: Number(row.creators || 0),
        traders: Number(row.traders || 0),
        pending: Number(row.pending || 0),
      })),
      currentEpochId: q.epochId ? Number(q.epochId) : null,
      currentEpochStartAt: null,
      currentEpochEndAt: null,
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/squads leaderboard]", error);
    if (schemaMissing(error)) return json(res, 200, { items: [], warning: "Recruiter squad schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}
