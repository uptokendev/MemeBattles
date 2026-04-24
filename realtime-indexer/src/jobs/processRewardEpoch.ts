import { processEndedWeeklyRewardEpochs } from "../rewards/ledger.js";
import { ENV } from "../env.js";

function parseChainIds(): number[] {
  return String(process.env.REWARD_CHAINS || process.env.LEAGUE_CHAINS || "97")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

async function main() {
  if (!ENV.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const chainIds = parseChainIds();
  const results = await processEndedWeeklyRewardEpochs(chainIds, new Date());
  console.log(`[processRewardEpoch] chains=${chainIds.join(",")} processed=${results.length}`);
  for (const item of results) {
    console.log(`[processRewardEpoch] chainId=${item.chainId} epochId=${item.epochId} status=${item.status} materialized=${item.materializedCount} claimable=${item.claimableCount}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("processRewardEpoch failed", e);
    process.exit(1);
  });
