import { pool } from "../../../server/db.js";

export async function writeAdminAuditLog(entry) {
  await pool.query(
    `
      insert into public.wm_admin_audit_log
        (admin_user_id, action, target_type, target_id, before, after)
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    `,
    [
      entry.adminUserId || null,
      entry.action,
      entry.targetType || null,
      entry.targetId || null,
      entry.before || null,
      entry.after || null,
    ],
  );
}
