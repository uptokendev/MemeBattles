import "dotenv/config";
import { pool } from "../db.js";
import { backfillSolanaTradeCurveState } from "../solanaIndexer.js";

const rawLimit = Number(process.argv[2] || 500);
const limit =
  Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.floor(rawLimit)
    : 500;

try {
  const result = await backfillSolanaTradeCurveState(limit);
  console.log("[solana-backfill] complete", result);

  if (result.failed > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    "[solana-backfill] fatal",
    error instanceof Error ? error.stack || error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
