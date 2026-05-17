import { pool } from "../../server/db.js";

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

  if (periodType === "season") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  return null;
}

export default async function wmLeaderboardCurrent(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const rawPeriod = String(req.query?.period || "all_time");
  const periodType = PERIOD_TYPES.has(rawPeriod) ? rawPeriod : "all_time";
  const start = periodStart(periodType);

  try {
    const params = [];
    let periodFilter = "";
    if (start) {
      params.push(start.toISOString());
      periodFilter = `and l.created_at >= $${params.length}`;
    }

    const { rows } = await pool.query(
      `
        select
          u.id as "userId",
          u.wallet_address as "walletAddress",
          u.display_name as "displayName",
          u.avatar_url as "avatarUrl",
          coalesce(sum(l.amount), 0)::int as "xpTotal"
        from public.wm_xp_ledger l
        join public.wm_users u on u.id = l.user_id
        where l.status = 'active'
          and coalesce(u.is_banned, false) = false
          ${periodFilter}
        group by u.id, u.wallet_address, u.display_name, u.avatar_url
        having coalesce(sum(l.amount), 0) > 0
        order by "xpTotal" desc, u.wallet_address asc
      `,
      params,
    );

    const ranked = rows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      walletAddress: row.walletAddress,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      xpTotal: Number(row.xpTotal || 0),
      periodType,
    }));

    return res.status(200).json({ ok: true, periodType, rows: ranked });
  } catch (error) {
    console.error("[war-missions/leaderboard-current] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
