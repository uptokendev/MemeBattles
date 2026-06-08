import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";
import { writeAdminAuditLog } from "./_lib/admin-audit.js";
import { normalizeAddress } from "./_lib/auth.js";

async function findUser(body) {
  if (body.userId) {
    const { rows } = await pool.query(`select * from public.wm_users where id = $1 limit 1`, [body.userId]);
    return rows[0] || null;
  }
  const walletAddress = normalizeAddress(body.walletAddress || "");
  if (!walletAddress) return null;
  const { rows } = await pool.query(`select * from public.wm_users where lower(wallet_address) = $1 limit 1`, [walletAddress]);
  return rows[0] || null;
}

export default async function wmAdminUserAction(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const action = String(req.body?.action || "ban").trim();
    const reason = String(req.body?.reason || "").trim();
    if (action !== "ban" && action !== "unban") return res.status(400).json({ error: "Unsupported action." });
    if (!reason) return res.status(400).json({ error: "Provide a reason." });

    const user = await findUser(req.body || {});
    if (!user) return res.status(404).json({ error: "User was not found." });

    const { rows } = await pool.query(
      `update public.wm_users set is_banned = $2, updated_at = now() where id = $1 returning *`,
      [user.id, action === "ban"],
    );

    await writeAdminAuditLog({
      adminUserId: admin.username || null,
      action: `user.${action}`,
      targetType: "wm_user",
      targetId: user.id,
      before: { is_banned: user.is_banned },
      after: { is_banned: action === "ban", reason },
    }).catch(() => undefined);

    return res.status(200).json({ ok: true, user: rows[0] || user });
  } catch (error) {
    console.error("[war-missions/admin-user-action] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
