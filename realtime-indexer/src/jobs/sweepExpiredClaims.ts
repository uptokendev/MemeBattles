import { pool } from "../db.js";
import { ENV } from "../env.js";

// Designed to be run as a cron-style one-off process.
// Sweeps expired, unclaimed league winners into the next epoch rollover pool.
//
// Usage (Railway cron):
//   npm run cron:sweep-expired-claims

async function main() {
  const chainIds = String(process.env.LEAGUE_CHAINS || "97,56")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  if (!ENV.DATABASE_URL) throw new Error("DATABASE_URL missing");

  let totalSwept = 0;
  for (const chainId of chainIds) {
    const r = await pool.query(`select public.league_sweep_expired_unclaimed($1) as swept`, [chainId]);
    const swept = Number(r.rows?.[0]?.swept ?? 0);
    totalSwept += swept;
    console.log(`[sweepExpiredClaims] chainId=${chainId} swept=${swept}`);
  }

  console.log(`[sweepExpiredClaims] done totalSwept=${totalSwept}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("sweepExpiredClaims failed", e);
    process.exit(1);
  });
