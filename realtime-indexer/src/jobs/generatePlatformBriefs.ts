import { pool } from "../db.js";
import { emitNotification } from "../notifications.js";

async function main() {
  console.log("[generatePlatformBriefs] Starting...");
  try {
    const time = new Date().toISOString();

    await emitNotification(pool, {
      eventType: "platform.daily_brief_ready",
      chain: "solana",
      dedupKey: `platform-brief:solana:${time}`,
      payload: { chain: "solana", generatedAt: time }
    });

    await emitNotification(pool, {
      eventType: "platform.daily_brief_ready",
      chain: "bnb",
      dedupKey: `platform-brief:bnb:${time}`,
      payload: { chain: "bnb", generatedAt: time }
    });
    
    console.log("[generatePlatformBriefs] Done.");
    process.exit(0);
  } catch (err) {
    console.error("[generatePlatformBriefs] Error:", err);
    process.exit(1);
  }
}

main();
