import { pool } from "../../../server/db.js";

export async function writeAdminAuditLog({ adminUserId, action, targetType, targetId, before, after, metadata } = {}) {
  try {
    const payload = {
      before: before ?? null,
      after: after ?? null,
      metadata: metadata ?? null,
    };

    const { rows } = await pool.query(
      `
        insert into public.wm_admin_audit_log
          (admin_user_id, action, target_type, target_id, payload)
        values ($1, $2, $3, $4, $5::jsonb)
        returning *
      `,
      [
        adminUserId || null,
        String(action || "admin.action"),
        targetType || null,
        targetId || null,
        JSON.stringify(payload),
      ],
    );
    return rows[0] || null;
  } catch (error) {
    console.error("[war-missions/admin-audit] write failed", error?.message || error);
    return null;
  }
}
