import { processRewardEligibilityForEpoch } from "../rewards/eligibility.js";
import { ENV } from "../env.js";

function parseEpochId(): number {
  const raw = String(process.env.REWARD_EPOCH_ID || "").trim();
  const epochId = Number(raw);
  if (!Number.isFinite(epochId) || epochId <= 0) {
    throw new Error("REWARD_EPOCH_ID missing or invalid");
  }
  return epochId;
}

async function main() {
  if (!ENV.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const epochId = parseEpochId();
  const result = await processRewardEligibilityForEpoch(epochId);
  console.log(`[processRewardEligibility] epochId=${epochId} wallets=${result.walletCount} results=${result.resultCount} eligible=${JSON.stringify(result.eligibleCounts)} review=${result.reviewCount} hard=${result.hardFlaggedCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("processRewardEligibility failed", e);
    process.exit(1);
  });
