import { pool } from "../db.js";
import { runGraduationReconcilerOnce } from "../graduationReconciler.js";

async function main() {
  const result = await runGraduationReconcilerOnce();
  const states = await pool.query(
    `select
       cms.chain_id,
       cms.campaign_address,
       cms.token_address,
       cms.market_stage,
       cms.dex_pair_address,
       cms.pool_verified,
       cms.last_error,
       cms.graduation_block,
       cms.graduation_tx_hash
     from public.campaign_market_state cms
     where cms.market_stage in ('TOPAZ_PENDING','TOPAZ_ACTIVE','TOPAZ_DEGRADED')
     order by cms.graduation_time desc nulls last,cms.updated_at desc
     limit 20`,
  );

  console.log(JSON.stringify({
    ok: result.errors === 0,
    reconciliation: result,
    graduatedMarkets: states.rows,
  }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
