import { pool } from "../../../server/db.js";
import { normalizeAddress } from "./auth.js";

export const WAR_MISSIONS_REFERRAL_COOKIE = "mwz_wm_referral";
const REFERRAL_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_WAR_MISSIONS_PUBLIC_BASE_URL = "https://quests.memewar.zone";

const KNOWN_RECRUITER_MILESTONES = [
  { match: "assemble-a-fireteam", titleMatch: "assemble a fireteam", target: 2, metric: "verifiedRecruits" },
  { match: "form-a-full-squad", titleMatch: "form a full squad", target: 4, metric: "verifiedRecruits" },
  { match: "expand-the-vanguard", titleMatch: "expand the vanguard", target: 6, metric: "verifiedRecruits" },
  { match: "build-the-platoon", titleMatch: "build the platoon", target: 8, metric: "verifiedRecruits" },
  { match: "deploy-a-strike-force", titleMatch: "deploy a strike force", target: 10, metric: "verifiedRecruits" },
  { match: "lead-a-battalion", titleMatch: "lead a battalion", target: 20, metric: "verifiedRecruits" },
  { match: "mobilize-a-brigade", titleMatch: "mobilize a brigade", target: 30, metric: "verifiedRecruits" },
  { match: "activate-the-warband", titleMatch: "activate the warband", target: 5, metric: "startHereRecruits" },
];

function parseCookies(raw) {
  return String(raw || "")
    .split(";")
    .reduce((acc, pair) => {
      const index = pair.indexOf("=");
      if (index === -1) return acc;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!key) return acc;
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getSecureCookieFlag(req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || "");
  const host = String(req.headers?.host || "");
  if (/localhost|127\.0\.0\.1/i.test(host)) return false;
  return proto ? proto === "https" : process.env.NODE_ENV === "production";
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure !== false) parts.push("Secure");
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join("; ");
}

function warMissionsCookieDomain() {
  return String(process.env.WAR_MISSIONS_COOKIE_DOMAIN || "").trim() || undefined;
}

function numberFromMetadata(metadata, keys) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      const parsed = Number(value);
      if (parsed > 0) return Math.trunc(parsed);
    }
  }
  return null;
}

export function normalizeReferralCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function referralBaseUrl() {
  return String(
    process.env.WAR_MISSIONS_PUBLIC_BASE_URL ||
      process.env.QUESTS_PUBLIC_BASE_URL ||
      DEFAULT_WAR_MISSIONS_PUBLIC_BASE_URL,
  )
    .trim()
    .replace(/\/+$/, "");
}

function buildReferralUrl(code) {
  return `${referralBaseUrl()}/recruiter/apply?ref=${encodeURIComponent(code)}`;
}

function suffixValue() {
  return Math.random().toString(36).slice(2, 6);
}

function inferRecruiterMilestoneTemplate(template) {
  const metadata = template?.metadata || {};
  const slug = normalizeReferralCode(template?.slug || "");
  const title = String(template?.title || "").trim().toLowerCase();
  const verificationType = String(template?.verification_type || "").trim().toLowerCase();

  const explicitMetric = String(
    metadata.progress_metric || metadata.recruiter_metric || metadata.requirement_metric || metadata.metric || "",
  )
    .trim()
    .toLowerCase();

  let metric = null;
  if (explicitMetric) {
    metric = /start|onboard|warband|activity/.test(explicitMetric) ? "startHereRecruits" : "verifiedRecruits";
  } else if (/start_here|onboarding|warband|activity/.test(verificationType)) {
    metric = "startHereRecruits";
  } else if (/referral|recruit/.test(verificationType)) {
    metric = "verifiedRecruits";
  }

  const metadataTarget = numberFromMetadata(metadata, [
    "required_verified_recruits",
    "required_recruits",
    "required_count",
    "recruit_count",
    "verified_recruits",
    "target_recruits",
    "min_referrals",
    "threshold",
  ]);

  if (metadataTarget) {
    return {
      slug: template.slug,
      title: template.title,
      target: metadataTarget,
      metric: metric || "verifiedRecruits",
    };
  }

  const known = KNOWN_RECRUITER_MILESTONES.find((item) => slug === item.match || title.includes(item.titleMatch));
  if (!known) return null;

  return {
    slug: template.slug,
    title: template.title,
    target: known.target,
    metric: known.metric,
  };
}

export function createReferralCookie(req, code) {
  return buildCookie(WAR_MISSIONS_REFERRAL_COOKIE, normalizeReferralCode(code), {
    maxAge: REFERRAL_COOKIE_TTL_SECONDS,
    httpOnly: true,
    secure: getSecureCookieFlag(req),
    sameSite: "Lax",
    path: "/",
    domain: warMissionsCookieDomain(),
  });
}

export function clearReferralCookie(req) {
  return buildCookie(WAR_MISSIONS_REFERRAL_COOKIE, "", {
    maxAge: 0,
    httpOnly: true,
    secure: getSecureCookieFlag(req),
    sameSite: "Lax",
    path: "/",
    domain: warMissionsCookieDomain(),
  });
}

export function readReferralCode(req) {
  const cookies = parseCookies(req.headers?.cookie || req.headers?.Cookie);
  return normalizeReferralCode(cookies[WAR_MISSIONS_REFERRAL_COOKIE] || "");
}

export async function getActiveReferralLinkByCode(code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const { rows } = await pool.query(
    `
      select id, recruiter_user_id, code, url, active, created_at
      from public.wm_referral_links
      where code = $1 and active = true
      limit 1
    `,
    [normalized],
  );
  return rows[0] || null;
}

export async function getReferralLinkForRecruiter(userId) {
  const { rows } = await pool.query(
    `
      select id, recruiter_user_id, code, url, active, created_at
      from public.wm_referral_links
      where recruiter_user_id = $1 and active = true
      order by created_at asc
      limit 1
    `,
    [userId],
  );
  return rows[0] || null;
}

async function referralCodeExists(code) {
  const { rows } = await pool.query(`select 1 from public.wm_referral_links where code = $1 limit 1`, [code]);
  return Boolean(rows[0]);
}

export async function generateUniqueReferralCode(seed) {
  const base = normalizeReferralCode(seed) || `recruit-${suffixValue()}`;
  for (let index = 0; index < 12; index += 1) {
    const code = index === 0 ? base : `${base}-${index + 1}`;
    if (!(await referralCodeExists(code))) return code;
  }

  while (true) {
    const code = normalizeReferralCode(`${base}-${suffixValue()}`);
    if (code && !(await referralCodeExists(code))) return code;
  }
}

export async function ensureRecruiterReferralLink(user) {
  const existing = await getReferralLinkForRecruiter(user.id);
  if (existing) return existing;

  const walletFragment = normalizeAddress(user.wallet_address).slice(2, 8) || suffixValue();
  const displaySeed = normalizeReferralCode(user.display_name || "");
  const code = await generateUniqueReferralCode(displaySeed || `recruit-${walletFragment}`);
  const { rows } = await pool.query(
    `
      insert into public.wm_referral_links
        (recruiter_user_id, code, url, active)
      values ($1, $2, $3, true)
      returning id, recruiter_user_id, code, url, active, created_at
    `,
    [user.id, code, buildReferralUrl(code)],
  );
  return rows[0] || null;
}

export async function getRecruiterApplicationForUser(userId) {
  const { rows } = await pool.query(
    `
      select *
      from public.wm_recruiter_applications
      where user_id = $1
      order by created_at desc
      limit 1
    `,
    [userId],
  );
  return rows[0] || null;
}

export async function getRecruiterQuestTemplateByVerificationType(verificationType) {
  const { rows } = await pool.query(
    `
      select slug, title
      from public.wm_quest_templates
      where verification_type = $1 and active = true
      order by created_at asc
      limit 1
    `,
    [verificationType],
  );
  return rows[0] || null;
}

export async function getRecruiterMilestoneQuestTargets() {
  const { rows } = await pool.query(
    `
      select slug, title, verification_type, metadata
      from public.wm_quest_templates
      where active = true
      order by created_at asc
    `,
  );

  return rows
    .map((row) => inferRecruiterMilestoneTemplate(row))
    .filter(Boolean)
    .sort((left, right) => left.target - right.target);
}

export async function getRecruiterProgressCounts(recruiterUserId) {
  const { rows } = await pool.query(
    `
      select
        count(*) filter (where status = 'verified')::int as verified_total
      from public.wm_referral_attributions
      where recruiter_user_id = $1
    `,
    [recruiterUserId],
  );

  const verifiedTotal = Number(rows[0]?.verified_total || 0);
  return {
    verifiedRecruits: verifiedTotal,
    startHereRecruits: verifiedTotal,
  };
}

export async function createRecruiterAdminNotification(input) {
  await pool.query(
    `
      insert into public.wm_admin_notifications
        (type, title, message, priority, status, related_user_id, related_application_id)
      values ($1, $2, $3, $4, 'open', $5, $6)
    `,
    [
      input.type,
      input.title,
      input.message || null,
      input.priority || "normal",
      input.relatedUserId || null,
      input.relatedApplicationId || null,
    ],
  );
}

export async function linkReferralToUser({ recruiterUserId, referredUserId, referralCode }) {
  if (!recruiterUserId || !referredUserId) return { linked: false, reason: "missing_user" };
  if (recruiterUserId === referredUserId) return { linked: false, reason: "self_referral_blocked" };

  const normalizedCode = normalizeReferralCode(referralCode);
  const { rows } = await pool.query(
    `
      select *
      from public.wm_referral_attributions
      where referred_user_id = $1
      order by first_seen_at asc nulls last
      limit 1
    `,
    [referredUserId],
  );
  const existing = rows[0] || null;

  if (existing) {
    if (existing.recruiter_user_id && existing.recruiter_user_id !== recruiterUserId && ["verified", "locked"].includes(existing.status)) {
      return { linked: false, reason: "recruiter_locked", attribution: existing };
    }

    const { rows: updatedRows } = await pool.query(
      `
        update public.wm_referral_attributions
        set
          recruiter_user_id = $2,
          referral_code = $3,
          status = case when status in ('verified', 'locked') then status else 'linked' end,
          wallet_connected_at = coalesce(wallet_connected_at, now())
        where id = $1
        returning *
      `,
      [existing.id, recruiterUserId, normalizedCode || existing.referral_code],
    );
    return { linked: true, reason: "updated", attribution: updatedRows[0] || existing };
  }

  const { rows: insertedRows } = await pool.query(
    `
      insert into public.wm_referral_attributions
        (recruiter_user_id, referred_user_id, referral_code, status, wallet_connected_at)
      values ($1, $2, $3, 'linked', now())
      returning *
    `,
    [recruiterUserId, referredUserId, normalizedCode || null],
  );
  return { linked: true, reason: "created", attribution: insertedRows[0] || null };
}

export async function getRecruiterStats(userId) {
  const [application, referralLink, summaryRows, recruitRows] = await Promise.all([
    getRecruiterApplicationForUser(userId),
    getReferralLinkForRecruiter(userId),
    pool.query(
      `
        select
          count(*)::int as total,
          count(*) filter (where status = 'pending')::int as pending,
          count(*) filter (where status = 'linked')::int as linked,
          count(*) filter (where status = 'verified')::int as verified,
          count(*) filter (where status = 'locked')::int as locked,
          count(*) filter (where status = 'rejected')::int as rejected
        from public.wm_referral_attributions
        where recruiter_user_id = $1
      `,
      [userId],
    ),
    pool.query(
      `
        select
          ra.id,
          ra.status,
          ra.referral_code,
          ra.first_seen_at,
          ra.wallet_connected_at,
          ra.verified_at,
          u.id as user_id,
          u.wallet_address,
          u.display_name,
          u.role,
          u.is_banned
        from public.wm_referral_attributions ra
        left join public.wm_users u on u.id = ra.referred_user_id
        where ra.recruiter_user_id = $1
        order by
          case ra.status when 'verified' then 0 when 'linked' then 1 when 'pending' then 2 else 9 end,
          coalesce(ra.verified_at, ra.wallet_connected_at, ra.first_seen_at) desc nulls last
        limit 100
      `,
      [userId],
    ),
  ]);

  const summary = summaryRows.rows[0] || {};
  return {
    application,
    referralLink,
    summary: {
      total: Number(summary.total || 0),
      pending: Number(summary.pending || 0),
      linked: Number(summary.linked || 0),
      verified: Number(summary.verified || 0),
      locked: Number(summary.locked || 0),
      rejected: Number(summary.rejected || 0),
    },
    recruits: recruitRows.rows.map((row) => ({
      id: row.id,
      status: row.status,
      referralCode: row.referral_code || null,
      firstSeenAt: row.first_seen_at || null,
      walletConnectedAt: row.wallet_connected_at || null,
      verifiedAt: row.verified_at || null,
      user: row.user_id
        ? {
            id: row.user_id,
            walletAddress: row.wallet_address,
            displayName: row.display_name || null,
            role: row.role || "user",
            isBanned: Boolean(row.is_banned),
          }
        : null,
    })),
  };
}
