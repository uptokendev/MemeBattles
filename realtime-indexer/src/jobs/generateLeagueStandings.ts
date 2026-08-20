
import { pool } from "../db.js";
import { emitNotification } from "../notifications.js";

async function main() {
  console.log("[generateLeagueStandings] Starting...");
  try {
    const time = new Date().toISOString();

    for (const chain of ["solana", "bnb"]) {
      const chainIds = chain === "solana" ? "101, 102" : "56, 97";
      const res = await pool.query(`
        select address, current_rank, rank_points
        from public.user_rank_state
        where chain_id in (${chainIds})
        order by current_rank asc nulls last
        limit 10
      `);

      if (res.rows.length > 0) {
        await emitNotification(pool, {
          eventType: "league.weekly_standings_ready",
          chain: chain,
          dedupKey: `league-standings:${chain}:${time}`,
          payload: {
            chain: chain,
            standings: res.rows.map(r => ({ address: r.address, rank: r.current_rank, points: r.rank_points })),
            generatedAt: time
          }
        });
      }
    }

    console.log("[generateLeagueStandings] Done.");
    process.exit(0);
  } catch (err) {
    console.error("[generateLeagueStandings] Error:", err);
    process.exit(1);
  }
}

main();
