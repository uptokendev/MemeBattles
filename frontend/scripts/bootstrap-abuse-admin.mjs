#!/usr/bin/env node
/**
 * Grant abuse.admin to an explicit email list.
 * Never reads DASHBOARD_ADMIN_EMAILS. Empty env is a hard failure.
 *
 *   ABUSE_ADMIN_BOOTSTRAP_EMAILS=you@example.com node --import ./api/load-local-env.mjs scripts/bootstrap-abuse-admin.mjs
 *
 * Optional: ABUSE_ADMIN_BOOTSTRAP_USER_IDS=uuid-matching-the-email-order
 */

import { pool } from "../server/db.js";

const ABUSE_ADMIN = "abuse.admin";

function csv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function lookupAuthUser(email) {
  const { rows } = await pool.query(
    `select id::text as id, lower(email) as email
       from auth.users
      where lower(email) = $1
      limit 1`,
    [email],
  );
  return rows[0] || null;
}

async function grantAdmin({ employeeId, employeeEmail }) {
  const existing = await pool.query(
    `select id
       from public.employee_permissions
      where employee_id = $1
        and permission = $2
        and revoked_at is null
      limit 1`,
    [employeeId, ABUSE_ADMIN],
  );
  if (existing.rows[0]) {
    return { granted: false, alreadyGranted: true };
  }

  await pool.query(
    `insert into public.employee_permissions
       (employee_id, employee_email, permission, granted_by, granted_by_email)
     values ($1, $2, $3, $1, $2)`,
    [employeeId, employeeEmail, ABUSE_ADMIN],
  );

  await pool.query(
    `insert into public.abuse_audit_events
       (event_type, actor_type, actor_id, actor_email, subject_id, subject_email, old_value, new_value, metadata)
     values ('PERMISSION_GRANTED', 'system', $1, $2, $1, $2, null, $3, '{"source":"bootstrap-abuse-admin"}'::jsonb)`,
    [employeeId, employeeEmail, ABUSE_ADMIN],
  );

  return { granted: true, alreadyGranted: false };
}

async function main() {
  const emails = csv("ABUSE_ADMIN_BOOTSTRAP_EMAILS").map(normalizeEmail);
  const userIds = csv("ABUSE_ADMIN_BOOTSTRAP_USER_IDS");

  if (emails.length === 0) {
    console.error("[bootstrap-abuse-admin] ABUSE_ADMIN_BOOTSTRAP_EMAILS is empty. Refusing to grant anyone.");
    process.exitCode = 1;
    return;
  }

  if (userIds.length && userIds.length !== emails.length) {
    console.error("[bootstrap-abuse-admin] ABUSE_ADMIN_BOOTSTRAP_USER_IDS must be empty or the same length as the email list.");
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (let index = 0; index < emails.length; index += 1) {
    const email = emails[index];
    let employeeId = userIds[index] || "";

    if (!employeeId) {
      try {
        const user = await lookupAuthUser(email);
        employeeId = user?.id || "";
      } catch (error) {
        console.error(`[bootstrap-abuse-admin] auth.users lookup failed for ${email}:`, error?.message || error);
        failures += 1;
        continue;
      }
    }

    if (!employeeId) {
      console.error(`[bootstrap-abuse-admin] no auth user found for ${email}. Pass ABUSE_ADMIN_BOOTSTRAP_USER_IDS or create the dashboard user first.`);
      failures += 1;
      continue;
    }

    try {
      const result = await grantAdmin({ employeeId, employeeEmail: email });
      if (result.alreadyGranted) {
        console.log(`[bootstrap-abuse-admin] already granted ${ABUSE_ADMIN} to ${email} (${employeeId})`);
      } else {
        console.log(`[bootstrap-abuse-admin] granted ${ABUSE_ADMIN} to ${email} (${employeeId})`);
      }
    } catch (error) {
      console.error(`[bootstrap-abuse-admin] grant failed for ${email}:`, error?.message || error);
      failures += 1;
    }
  }

  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[bootstrap-abuse-admin] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
