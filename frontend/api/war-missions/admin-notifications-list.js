import { requireAdmin } from "./_lib/admin-auth.js";
import { writeAdminAuditLog } from "./_lib/admin-audit.js";

const ALLOWED_STATUS = new Set(["open", "assigned", "resolved", "dismissed"]);

export default async function wmAdminNotificationsList(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const status = String(req.query?.status || "").trim();
      const params = [];
      let filter = "";
      if (status) {
        params.push(status);
        filter = ` where status = $${params.length}`;
      }
      const { rows } = await (await import("../../server/db.js")).pool.query(
        `select * from public.wm_admin_notifications${filter} order by created_at desc`,
        params,
      );
      return res.status(200).json({ ok: true, rows });
    }

    if (req.method === "PATCH") {
      const id = String(req.body?.id || "").trim();
      const status = String(req.body?.status || "resolved").trim();
      if (!id) return res.status(400).json({ error: "Provide id." });
      if (!ALLOWED_STATUS.has(status)) return res.status(400).json({ error: "Unsupported status." });

      const resolvedAt = status === "resolved" || status === "dismissed" ? new Date().toISOString() : null;
      const assignedTo = status === "assigned" ? admin.username || "admin" : null;
      const { rows } = await (await import("../../server/db.js")).pool.query(
        `
          update public.wm_admin_notifications
          set status = $2,
              resolved_at = $3,
              assigned_to = $4
          where id = $1
          returning *
        `,
        [id, status, resolvedAt, assignedTo],
      );

      await writeAdminAuditLog({
        adminUserId: admin.username || null,
        action: `notification.${status}`,
        targetType: "wm_admin_notification",
        targetId: id,
        after: { status },
      }).catch(() => undefined);

      return res.status(200).json({ ok: true, rows });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("[war-missions/admin-notifications-list] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
