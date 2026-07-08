import { pool } from "../../../server/db.js";
import { isSolanaAddress } from "../../../server/http.js";
import { normalizeAddress } from "./auth.js";
import { awardQuestForUser } from "./profile.js";
import { ensureRecruiterReferralLink, getRecruiterApplicationForUser } from "./referrals.js";

const APPROVED_VALUES = new Set(["approved", "accepted", "active", "enabled"]);
const PENDING_VALUES = new Set(["pending", "submitted", "review", "in_review", "waitlisted"]);
const REJECTED_VALUES = new Set(["rejected", "denied", "declined", "disabled"]);
const ACCEPTED_RECRUITER_SLUG = "accepted-recruiter-program";

function normalizeRecruiterWallet(value) {
  const raw = String(value || "").trim();
  if (isSolanaAddress(raw)) return raw;
  return normalizeAddress(raw);
}

function walletLookupSql(columnExpression) {
  return `case when $2::boolean then ${columnExpression} = $1 else lower(${columnExpression}) = $1 end`;
}

function readString(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readBoolean(record, keys) {
  for (const key of keys) {
    if (typeof record?.[key] === "boolean") return record[key];
  }
  return false;
}

function hasTimestamp(record, keys) {
  return keys.some((key) => typeof record?.[key] === "string" && String(record[key]).trim());
}

function parseRecruiterState(record) {
  const statusValue = readString(record, ["status", "application_status", "review_status", "recruiter_status"]).toLowerCase();

  if (readBoolean(record, ["is_approved", "approved"]) || hasTimestamp(record, ["approved_at", "accepted_at", "activated_at"])) {
    return "approved";
  }
  if (readBoolean(record, ["is_rejected"]) || hasTimestamp(record, ["rejected_at", "denied_at"])) {
    return "rejected";
  }
  if (APPROVED_VALUES.has(statusValue)) return "approved";
  if (REJECTED_VALUES.has(statusValue)) return "rejected";
  if (PENDING_VALUES.has(statusValue)) return "pending_review";
  if (statusValue) return "pending_review";
  return null;
}

function parseReason(record) {
  return readString(record, ["rejection_reason", "reason", "denial_reason", "review_notes", "notes"]) || null;
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

async function safeQuery(text, params = []) {
  try {
    const { rows } = await pool.query(text, params);
    return rows;
  } catch (error) {
    if (schemaMissing(error)) return [];
    throw error;
  }
}

async function findCommandCenterRecruiterRecord(user) {
  const wallet = normalizeRecruiterWallet(user.wallet_address);
  const solana = isSolanaAddress(wallet);
  const rows = await safeQuery(
    `
      select *
      from public.recruiters
      where ${walletLookupSql("wallet_address")}
         or metadata #>> '{signup,solanaWalletAddress}' = $1
      order by updated_at desc nulls last, created_at desc nulls last
      limit 1
    `,
    [wallet, solana],
  );
  const record = rows[0];
  if (!record) return null;

  const status = parseRecruiterState(record);
  if (!status) return null;

  return {
    status,
    reason: parseReason(record),
    source: "command_center_recruiters",
  };
}

async function findCommandCenterWaitlistRecord(user) {
  const wallet = normalizeRecruiterWallet(user.wallet_address);
  const solana = isSolanaAddress(wallet);
  const tables = ["recruiter_waitlist", "recruiter_waitlists", "waitlist", "recruiter_applications"];

  for (const table of tables) {
    const rows = await safeQuery(
      `
        select *
        from public.${table}
        where ${walletLookupSql("coalesce(wallet_address, wallet, '')")}
           or user_id = $3
        order by created_at desc nulls last, updated_at desc nulls last
        limit 1
      `,
      [wallet, solana, user.id],
    );
    const record = rows[0];
    if (!record) continue;

    const status = parseRecruiterState(record);
    if (!status) continue;

    return {
      status,
      reason: parseReason(record),
      source: "command_center_waitlist",
    };
  }

  return null;
}

async function findLegacyWarMissionsApplication(user) {
  const application = await getRecruiterApplicationForUser(user.id).catch(() => null);
  if (!application) return null;

  const normalized = String(application.status || "").trim().toLowerCase();
  let status = "not_started";
  if (APPROVED_VALUES.has(normalized)) status = "approved";
  else if (REJECTED_VALUES.has(normalized)) status = "rejected";
  else if (normalized) status = "pending_review";

  return {
    status,
    reason: application.rejection_reason || null,
    source: "legacy_wm_recruiter_applications",
  };
}

export async function getRecruiterStatus(user) {
  const checkedAt = new Date().toISOString();

  if (user.role === "recruiter" || user.role === "admin") {
    return {
      status: "approved",
      reason: null,
      source: "wm_users_role",
      checkedAt,
    };
  }

  const recruiterRecord = await findCommandCenterRecruiterRecord(user);
  if (recruiterRecord) return { ...recruiterRecord, checkedAt };

  const waitlistRecord = await findCommandCenterWaitlistRecord(user);
  if (waitlistRecord) return { ...waitlistRecord, checkedAt };

  const legacyApplication = await findLegacyWarMissionsApplication(user);
  if (legacyApplication) return { ...legacyApplication, checkedAt };

  return {
    status: "not_started",
    reason: null,
    source: "command_center_waitlist",
    checkedAt,
  };
}

export async function syncApprovedRecruiter(user) {
  const recruiterStatus = await getRecruiterStatus(user);
  if (recruiterStatus.status !== "approved") {
    return {
      recruiterStatus,
      roleSynced: false,
      questAwarded: false,
      questAlreadyAwarded: false,
      referralLink: null,
    };
  }

  let roleSynced = false;
  if (user.role !== "recruiter" && user.role !== "admin") {
    const result = await pool.query(
      `
        update public.wm_users
        set role = 'recruiter', updated_at = now()
        where id = $1 and role not in ('recruiter', 'admin')
      `,
      [user.id],
    );
    roleSynced = result.rowCount > 0;
  }

  const referralLink = await ensureRecruiterReferralLink(user).catch(() => null);
  const awardResult = await awardQuestForUser(user.id, ACCEPTED_RECRUITER_SLUG, "recruiter_status_check", {
    recruiter_status_source: recruiterStatus.source,
    recruiter_status_checked_at: recruiterStatus.checkedAt,
  }).catch(() => ({ awarded: false, reason: "quest_award_failed" }));

  return {
    recruiterStatus,
    roleSynced,
    questAwarded: Boolean(awardResult.awarded),
    questAlreadyAwarded: awardResult.reason === "already_awarded",
    referralLink,
  };
}
