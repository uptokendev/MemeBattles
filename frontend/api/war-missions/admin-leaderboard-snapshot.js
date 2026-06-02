import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";
import { writeAdminAuditLog } from "./_lib/admin-audit.js";

const PERIOD_TYPES = new Set(["all_time", "daily", "weekly", "season"]);

function periodStart(periodType, now = new Date()) {
  if (periodType === "all_time") return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (periodType === "daily") return start;
  if (periodType === "weekly") {
    const day = start.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + mondayOffset);
    return start;
  }
  if (periodType === "season") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return null;
}

async function getCurrentLeaderboard(periodType) {
  const start = periodStart(periodType);
  const params = [];
  let periodFilter = "";
  if (start) {
    params.push(start.toISOString());
    periodFilter = `and l.created_at >= $${params.length}`;
  }

  const { rows } = await pool.query(
    `
      select u.id as "userId", u.wallet_address as "walletAddress", u.display_name as "displayName", coalesce(sum(l.amount), 0)::int as "xpTotal"
      from public.wm_xp_ledger l
      join public.wm_users u on u.id = l.user_id
      where l.status = 'active' and coalesce(u.is_banned, false) = false ${periodFilter}
      group by u.id, u.wallet_address, u.display_name
      having coalesce(sum(l.amount), 0) > 0
      order by "xpTotal" desc, u.wallet_address asc
    `,
    params,
  );

  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    walletAddress: row.walletAddress,
    displayName: row.displayName,
    xpTotal: Number(row.xpTotal || 0),
  }));
}

export default async function wmAdminLeaderboardSnapshot(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const requestedPeriod = String(req.body?.periodType || "weekly").trim();
    const periodType = PERIOD_TYPES.has(requestedPeriod) ? requestedPeriod : "weekly";
    const rows = await getCurrentLeaderboard(periodType);
    const now = new Date().toISOString();
    const inserted = [];

    for (const row of rows) {
      const result = await pool.query(
        `
          insert into public.wm_leaderboard_snapshots (period_type, user_id, xp_total, rank, metadata, published_at)
          values ($1, $2, $3, $4, $5::jsonb, $6)
          returning *
        `,
        [periodType, row.userId, row.xpTotal, row.rank, JSON.stringify({ wallet_address: row.walletAddress, display_name: row.displayName }), now],
      );
      if (result.rows[0]) inserted.push(result.rows[0]);
    }

    await writeAdminAuditLog({
      adminUserId: admin.username || null,
      action: "leaderboard.snapshot",
      targetType: "wm_leaderboard_snapshot",
      after: { period_type: periodType, rows: inserted.length },
    }).catch(() => undefined);

    return res.status(200).json({ ok: true, periodType, rows: inserted });
  } catch (error) {
    console.error("[war-missions/admin-leaderboard-snapshot] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
