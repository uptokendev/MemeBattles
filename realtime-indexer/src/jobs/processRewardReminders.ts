import { processClaimReminders } from "../rewards/reminders.js";
import { ENV } from "../env.js";

async function main() {
  if (!ENV.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const result = await processClaimReminders(new Date());
  console.log(
    `[processRewardReminders] synced=${result.syncedCount} cancelled=${result.cancelledCount} sent=${result.sentCount} failed=${result.failedCount} skipped=${result.skippedCount}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("processRewardReminders failed", e);
    process.exit(1);
  });
