import { pool } from "../../server/db.js";

export default async function wmPrizesPublic(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const [poolsResult, winnersResult] = await Promise.all([
      pool.query(
        `
          select *
          from public.wm_prize_pools
          where status = any($1::text[])
          order by created_at desc
        `,
        [["active", "drawing", "published", "paid"]],
      ),
      pool.query(
        `
          select *
          from public.wm_prize_winners
          where status = any($1::text[])
          order by created_at desc
        `,
        [["approved", "paid"]],
      ),
    ]);

    return res.status(200).json({ ok: true, pools: poolsResult.rows, winners: winnersResult.rows });
  } catch (error) {
    console.error("[war-missions/prizes-public] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
