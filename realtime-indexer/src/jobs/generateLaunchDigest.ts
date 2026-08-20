import { pool } from "../db.js";
import { emitNotification } from "../notifications.js";

async function main() {
  console.log("[generateLaunchDigest] Starting...");
  try {
    // Get campaigns created in the last 4 hours
    const res = await pool.query(`
      select chain_id, campaign_address, name, symbol 
      from public.campaigns 
      where created_at >= now() - interval '4 hours'
      order by created_at desc
      limit 20
    `);

    if (res.rows.length === 0) {
      console.log("[generateLaunchDigest] No new campaigns. Exiting.");
      process.exit(0);
    }

    const solanaCampaigns = res.rows.filter(r => r.chain_id === 101 || r.chain_id === 102);
    const bnbCampaigns = res.rows.filter(r => r.chain_id === 56 || r.chain_id === 97);

    const time = new Date().toISOString();

    if (solanaCampaigns.length > 0) {
      await emitNotification(pool, {
        eventType: "campaign.launch_digest_ready",
        chain: "solana",
        dedupKey: `launch-digest:solana:${time}`,
        payload: {
          chain: "solana",
          count: solanaCampaigns.length,
          campaigns: solanaCampaigns.map(c => ({ campaign: c.campaign_address, name: c.name, symbol: c.symbol })),
          generatedAt: time
        }
      });
    }

    if (bnbCampaigns.length > 0) {
      await emitNotification(pool, {
        eventType: "campaign.launch_digest_ready",
        chain: "bnb",
        dedupKey: `launch-digest:bnb:${time}`,
        payload: {
          chain: "bnb",
          count: bnbCampaigns.length,
          campaigns: bnbCampaigns.map(c => ({ campaign: c.campaign_address, name: c.name, symbol: c.symbol })),
          generatedAt: time
        }
      });
    }
    
    console.log("[generateLaunchDigest] Done.");
    process.exit(0);
  } catch (err) {
    console.error("[generateLaunchDigest] Error:", err);
    process.exit(1);
  }
}

main();
