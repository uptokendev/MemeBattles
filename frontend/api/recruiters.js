import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../server/http.js";

const VALID_ROLES = new Set(["creator", "trader"]);

function normalizeCode(input) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\/r\//i, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeWallet(input) {
  return String(input ?? "").trim().toLowerCase();
}

function mapRecruiter(row) {
  if (!row) return null;
  return {
    id: row.id,
    wallet: row.wallet,
    code: row.code,
    displayName: row.display_name ?? null,
    status: row.status ?? "active",
    source: row.source ?? "unknown",
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function findRecruiter({ wallet, code }) {
  if (code) {
    const { rows } = await pool.query(
      `SELECT id, wallet, code, display_name, status, source, created_at, updated_at
         FROM public.recruiters
        WHERE lower(code) = $1
        LIMIT 1`,
      [code]
    );
    return rows[0] ?? null;
  }

  if (wallet) {
    const { rows } = await pool.query(
      `SELECT id, wallet, code, display_name, status, source, created_at, updated_at
         FROM public.recruiters
        WHERE lower(wallet) = $1
        LIMIT 1`,
      [wallet]
    );
    return rows[0] ?? null;
  }

  return null;
}

async function loadSquadSummary(recruiterId, recruiterCode) {
  const { rows } = await pool.query(
    `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE COALESCE(link_status, status, 'active') = 'active')::int AS active,
        COUNT(*) FILTER (WHERE member_role = 'creator')::int AS creators,
        COUNT(*) FILTER (WHERE member_role = 'trader')::int AS traders,
        COUNT(*) FILTER (WHERE member_role IS NULL OR member_role NOT IN ('creator', 'trader'))::int AS pending,
        COUNT(*) FILTER (WHERE COALESCE(link_status, status, 'active') <> 'active')::int AS inactive_links
       FROM public.wallet_recruiter_links
      WHERE recruiter_id = $1 OR lower(COALESCE(recruiter_code, '')) = $2`,
    [recruiterId, String(recruiterCode ?? "").toLowerCase()]
  );

  const row = rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    active: Number(row.active ?? 0),
    creators: Number(row.creators ?? 0),
    traders: Number(row.traders ?? 0),
    pending: Number(row.pending ?? 0),
    inactiveLinks: Number(row.inactive_links ?? 0),
  };
}

async function listSquadMembers(recruiterId, recruiterCode) {
  const { rows } = await pool.query(
    `SELECT wallet,
            recruiter_id AS "recruiterId",
            COALESCE(recruiter_code, $2) AS "recruiterCode",
            member_role AS "memberRole",
            COALESCE(link_status, status, 'active') AS "linkStatus",
            source,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM public.wallet_recruiter_links
      WHERE recruiter_id = $1 OR lower(COALESCE(recruiter_code, '')) = $3
      ORDER BY created_at DESC NULLS LAST`,
    [recruiterId, recruiterCode, String(recruiterCode ?? "").toLowerCase()]
  );
  return rows;
}

async function handleSignup(req, res) {
  if (req.method !== "POST") return badMethod(res);

  const body = await readJson(req);
  const wallet = normalizeWallet(body.wallet ?? body.address);
  const code = normalizeCode(body.code ?? body.recruiterCode);
  const displayName = String(body.displayName ?? "").trim().slice(0, 80) || null;

  if (!isAddress(wallet)) return json(res, 400, { ok: false, error: "Invalid wallet" });
  if (!code) return json(res, 400, { ok: false, error: "Recruiter code is required" });

  const existingByCode = await findRecruiter({ code });
  if (existingByCode && normalizeWallet(existingByCode.wallet) !== wallet) {
    return json(res, 409, { ok: false, error: "Recruiter code is already in use" });
  }

  const existingByWallet = await findRecruiter({ wallet });
  if (existingByWallet) {
    const { rows } = await pool.query(
      `UPDATE public.recruiters
          SET code = $2,
              display_name = COALESCE($3, display_name),
              status = COALESCE(status, 'active'),
              source = COALESCE(source, 'command_center'),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, wallet, code, display_name, status, source, created_at, updated_at`,
      [existingByWallet.id, code, displayName]
    );
    return json(res, 200, { ok: true, recruiter: mapRecruiter(rows[0]), redirectTo: `/profile/${wallet}/command/recruiter` });
  }

  const { rows } = await pool.query(
    `INSERT INTO public.recruiters (wallet, code, display_name, status, source, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', 'command_center', NOW(), NOW())
     RETURNING id, wallet, code, display_name, status, source, created_at, updated_at`,
    [wallet, code, displayName]
  );

  return json(res, 201, { ok: true, recruiter: mapRecruiter(rows[0]), redirectTo: `/profile/${wallet}/command/recruiter` });
}

async function handleAttribution(req, res) {
  if (req.method !== "POST") return badMethod(res);

  const body = await readJson(req);
  const wallet = normalizeWallet(body.wallet ?? body.address);
  const recruiterCode = normalizeCode(body.recruiterCode ?? body.code);
  const memberRole = String(body.memberRole ?? body.role ?? "").trim().toLowerCase();

  if (!isAddress(wallet)) return json(res, 400, { ok: false, linked: false, error: "Invalid wallet" });
  if (!recruiterCode) return json(res, 400, { ok: false, linked: false, error: "Recruiter code is required" });
  if (!VALID_ROLES.has(memberRole)) {
    return json(res, 409, {
      ok: false,
      linked: false,
      needsRoleSelection: true,
      recruiterCode,
      reason: "memberRole must be creator or trader before attribution can be finalized",
    });
  }

  const recruiter = await findRecruiter({ code: recruiterCode });
  if (!recruiter) return json(res, 404, { ok: false, linked: false, error: "Recruiter not found" });

  await pool.query(
    `INSERT INTO public.wallet_recruiter_links (wallet, recruiter_id, recruiter_code, member_role, link_status, source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', 'referral_link', NOW(), NOW())
     ON CONFLICT (wallet, recruiter_id)
     DO UPDATE SET member_role = EXCLUDED.member_role,
                   link_status = 'active',
                   source = COALESCE(public.wallet_recruiter_links.source, 'referral_link'),
                   updated_at = NOW()`,
    [wallet, recruiter.id, recruiter.code, memberRole]
  );

  await pool.query(
    `INSERT INTO public.wallet_squad_memberships (wallet, recruiter_id, recruiter_code, member_role, status, source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', 'referral_link', NOW(), NOW())
     ON CONFLICT (wallet, recruiter_id)
     DO UPDATE SET member_role = EXCLUDED.member_role,
                   status = 'active',
                   source = COALESCE(public.wallet_squad_memberships.source, 'referral_link'),
                   updated_at = NOW()`,
    [wallet, recruiter.id, recruiter.code, memberRole]
  );

  return json(res, 200, { ok: true, linked: true, recruiterCode: recruiter.code, memberRole });
}

async function handleRecruiter(req, res) {
  if (req.method !== "GET") return badMethod(res);
  const q = getQuery(req);
  const code = normalizeCode(q.code);
  const wallet = normalizeWallet(q.wallet);
  const recruiter = await findRecruiter({ code, wallet: isAddress(wallet) ? wallet : "" });
  if (!recruiter) return json(res, 404, { ok: false, error: "Recruiter not found" });

  const squad = await loadSquadSummary(recruiter.id, recruiter.code);
  return json(res, 200, { ok: true, recruiter: mapRecruiter(recruiter), squad, inviteUrl: `/r/${recruiter.code}` });
}

async function handleSquadSummary(req, res) {
  if (req.method !== "GET") return badMethod(res);
  const q = getQuery(req);
  const code = normalizeCode(q.code ?? req.params?.code);
  const recruiter = await findRecruiter({ code });
  if (!recruiter) return json(res, 404, { ok: false, error: "Recruiter not found" });
  const squad = await loadSquadSummary(recruiter.id, recruiter.code);
  return json(res, 200, {
    ok: true,
    summary: {
      recruiterId: recruiter.id,
      recruiterCode: recruiter.code,
      displayName: recruiter.display_name ?? null,
      status: recruiter.status ?? "active",
      totalMembers: squad.total,
      activeMembers: squad.active,
      creators: squad.creators,
      traders: squad.traders,
      pending: squad.pending,
    },
  });
}

async function handleSquadMembers(req, res) {
  if (req.method !== "GET") return badMethod(res);
  const q = getQuery(req);
  const code = normalizeCode(q.code ?? req.params?.code);
  const recruiter = await findRecruiter({ code });
  if (!recruiter) return json(res, 404, { ok: false, error: "Recruiter not found" });
  const members = await listSquadMembers(recruiter.id, recruiter.code);
  return json(res, 200, { ok: true, members });
}

export async function recruiterSignup(req, res) {
  try {
    return await handleSignup(req, res);
  } catch (e) {
    console.error("[api/recruiter-signup]", e);
    return json(res, 500, { ok: false, error: "Server error" });
  }
}

export async function recruiterAttribution(req, res) {
  try {
    return await handleAttribution(req, res);
  } catch (e) {
    console.error("[api/recruiter-attribution]", e);
    return json(res, 500, { ok: false, linked: false, error: "Server error" });
  }
}

export async function recruiterPortal(req, res) {
  try {
    return await handleRecruiter(req, res);
  } catch (e) {
    console.error("[api/recruiter]", e);
    return json(res, 500, { ok: false, error: "Server error" });
  }
}

export async function squadSummary(req, res) {
  try {
    return await handleSquadSummary(req, res);
  } catch (e) {
    console.error("[api/squads/summary]", e);
    return json(res, 500, { ok: false, error: "Server error" });
  }
}

export async function squadMembers(req, res) {
  try {
    return await handleSquadMembers(req, res);
  } catch (e) {
    console.error("[api/squads/members]", e);
    return json(res, 500, { ok: false, error: "Server error" });
  }
}
