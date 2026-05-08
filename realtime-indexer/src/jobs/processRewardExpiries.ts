import { processRewardExpiries } from "../rewards/ledger.js";
import { ENV } from "../env.js";

async function main() {
  if (!ENV.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const result = await processRewardExpiries(new Date());
  console.log(`[processRewardExpiries] expired=${result.expiredCount} rolledOver=${result.rolledOverCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("processRewardExpiries failed", e);
    process.exit(1);
  });
