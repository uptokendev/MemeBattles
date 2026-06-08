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
  return rows.map((row, index) => ({ rank: index + 1, userId: row.userId, walletAddress: row.walletAddress, displayName: row.displayName, xpTotal: Number(row.xpTotal || 0) }));
}

export default async function wmAdminPrizes(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const [poolsResult, winnersResult] = await Promise.all([
        pool.query(`select * from public.wm_prize_pools order by created_at desc`),
        pool.query(`select * from public.wm_prize_winners order by created_at desc`),
      ]);
      return res.status(200).json({ ok: true, pools: poolsResult.rows, winners: winnersResult.rows });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    const body = req.body || {};
    const action = String(body.action || "create_pool").trim();
    let result;

    if (action === "create_pool") {
      const rows = await pool.query(
        `insert into public.wm_prize_pools (period_type,reward_asset,reward_amount,status,metadata) values ($1,$2,$3,$4,$5::jsonb) returning *`,
        [body.periodType || "weekly", body.rewardAsset || "manual", Number(body.rewardAmount || 0) || null, body.status || "draft", JSON.stringify(body.metadata || {})],
      );
      result = rows.rows;
    } else if (action === "add_winner") {
      if (!body.prizePoolId || !body.userId) return res.status(400).json({ error: "prizePoolId and userId are required." });
      const rows = await pool.query(
        `insert into public.wm_prize_winners (prize_pool_id,user_id,wallet_address,rank,reward_amount,status,reason) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
        [body.prizePoolId, body.userId, body.walletAddress || null, body.rank || null, Number(body.rewardAmount || 0) || null, body.status || "pending", body.reason || null],
      );
      result = rows.rows;
    } else if (action === "update_pool") {
      if (!body.prizePoolId) return res.status(400).json({ error: "prizePoolId is required." });
      const rows = await pool.query(
        `update public.wm_prize_pools set status=$2, metadata=$3::jsonb where id=$1 returning *`,
        [body.prizePoolId, body.status || "published", JSON.stringify(body.metadata || {})],
      );
      result = rows.rows;
    } else if (action === "update_winner") {
      if (!body.winnerId) return res.status(400).json({ error: "winnerId is required." });
      const rows = await pool.query(
        `update public.wm_prize_winners set status=$2, tx_hash=$3, reason=$4 where id=$1 returning *`,
        [body.winnerId, body.status || "approved", body.txHash || null, body.reason || null],
      );
      result = rows.rows;
    } else if (action === "draw_winners") {
      if (!body.prizePoolId) return res.status(400).json({ error: "prizePoolId is required." });
      const requestedPeriod = String(body.periodType || "weekly").trim();
      const periodType = PERIOD_TYPES.has(requestedPeriod) ? requestedPeriod : "weekly";
      const winnerCount = Math.max(1, Math.min(50, Number(body.winnerCount || 3)));
      const leaderboard = await getCurrentLeaderboard(periodType);
      const winners = [];
      for (const row of leaderboard.slice(0, winnerCount)) {
        const inserted = await pool.query(
          `insert into public.wm_prize_winners (prize_pool_id,user_id,wallet_address,rank,reward_amount,status,reason) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
          [body.prizePoolId, row.userId, row.walletAddress, row.rank, Number(body.rewardAmount || 0) || null, body.status || "pending", body.reason || `Top ${winnerCount} ${periodType} leaderboard draw`],
        );
        if (inserted.rows[0]) winners.push(inserted.rows[0]);
      }
      await pool.query(
        `update public.wm_prize_pools set status=$2, metadata=$3::jsonb where id=$1`,
        [body.prizePoolId, body.status === "approved" ? "published" : "drawing", JSON.stringify({ ...(body.metadata || {}), draw_period_type: periodType, winner_count: winnerCount })],
      );
      result = winners;
    } else {
      return res.status(400).json({ error: "Unsupported prize action." });
    }

    await writeAdminAuditLog({
      adminUserId: admin.username || null,
      action: `prize.${action}`,
      targetType: "wm_prize",
      targetId: body.prizePoolId || body.winnerId || null,
      after: { ...body },
    }).catch(() => undefined);

    return res.status(200).json({ ok: true, action, result });
  } catch (error) {
    console.error("[war-missions/admin-prizes] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
