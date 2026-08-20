import { pool } from "../db.js";
import { emitNotification } from "../notifications.js";

async function main() {
  console.log("[generateTrendingDigest] Starting...");
  try {
    const time = new Date().toISOString();

    for (const chain of ["solana", "bnb"]) {
      const chainIds = chain === "solana" ? "101, 102" : "56, 97";
      const res = await pool.query(`
        select chain_id, campaign_address, name, symbol, marketcap_bnb
        from public.campaigns c
        left join public.token_stats ts on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
        where c.chain_id in (${chainIds})
          and c.is_active = true
        order by coalesce(ts.marketcap_bnb, 0) desc
        limit 10
      `);

      if (res.rows.length > 0) {
        await emitNotification(pool, {
          eventType: "campaign.trending_digest_ready",
          chain: chain,
          dedupKey: `trending-digest:${chain}:${time}`,
          payload: {
            chain: chain,
            campaigns: res.rows.map(c => ({ campaign: c.campaign_address, name: c.name, symbol: c.symbol, marketcapBnb: c.marketcap_bnb })),
            generatedAt: time
          }
        });
      }
    }
    
    console.log("[generateTrendingDigest] Done.");
    process.exit(0);
  } catch (err) {
    console.error("[generateTrendingDigest] Error:", err);
    process.exit(1);
  }
}

main();
