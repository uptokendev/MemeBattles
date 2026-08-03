/**
 * TESTNET cleanup: keep only campaigns from one or more LaunchFactories.
 *
 * Dual-test defaults (chain 97):
 *   - 0xA2B19f… previous / support-only
 *   - 0x8d4937… new dual-test / creation
 *
 * Usage (from realtime-indexer/, with DATABASE_URL set):
 *   npx tsx scripts/cleanupKeepFactory.ts --dry-run
 *   npx tsx scripts/cleanupKeepFactory.ts --execute
 *
 * Env:
 *   KEEP_FACTORY_ADDRESSES  comma-separated (preferred)
 *   KEEP_FACTORY_ADDRESS    single factory (legacy; used if ADDRESSES unset)
 *   KEEP_CHAIN_ID           default 97
 */
import "dotenv/config";
import pg from "pg";

const DEFAULT_KEEP = [
  "0xA2B19f194826b6D930D18F3fBCad662FaDC9459E",
  "0x8d4937D3BEe8A750411c0a24f888C0088754D3eD",
];

function parseKeepFactories(): string[] {
  const multi = String(process.env.KEEP_FACTORY_ADDRESSES || "").trim();
  const single = String(process.env.KEEP_FACTORY_ADDRESS || "").trim();
  const raw = multi
    ? multi.split(",")
    : single
      ? [single]
      : DEFAULT_KEEP;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const addr = String(item || "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(addr)) continue;
    if (seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
  }
  return out;
}

const KEEP_FACTORIES = parseKeepFactories();
const CHAIN_ID = Number(process.env.KEEP_CHAIN_ID || 97);
const EXECUTE = process.argv.includes("--execute");

if (!KEEP_FACTORIES.length) {
  console.error("No valid KEEP_FACTORY_ADDRESSES / KEEP_FACTORY_ADDRESS");
  process.exit(1);
}
if (!Number.isInteger(CHAIN_ID) || CHAIN_ID <= 0) {
  console.error("Invalid KEEP_CHAIN_ID");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  max: 2,
});

async function tableExists(name: string): Promise<boolean> {
  const r = await pool.query(
    `select 1 from information_schema.tables
     where table_schema='public' and table_name=$1 limit 1`,
    [name],
  );
  return (r.rowCount ?? 0) > 0;
}

async function main() {
  console.log(
    JSON.stringify(
      { mode: EXECUTE ? "EXECUTE" : "DRY_RUN", chainId: CHAIN_ID, keepFactories: KEEP_FACTORIES },
      null,
      2,
    ),
  );

  const byFactory = await pool.query(
    `select lower(coalesce(factory_address,'')) as factory,
            count(*)::int as campaigns
     from public.campaigns
     where chain_id=$1
     group by 1
     order by campaigns desc`,
    [CHAIN_ID],
  );
  console.log("\nCampaigns by factory:");
  console.log(JSON.stringify(byFactory.rows, null, 2));

  const keep = await pool.query(
    `select campaign_address, token_address, name, symbol, factory_address, created_block, is_active
     from public.campaigns
     where chain_id=$1 and lower(coalesce(factory_address,'')) = any($2::text[])
     order by lower(coalesce(factory_address,'')), coalesce(created_at_chain, updated_at) desc nulls last`,
    [CHAIN_ID, KEEP_FACTORIES],
  );
  console.log(`\nKEEP (${keep.rowCount} campaigns):`);
  console.log(JSON.stringify(keep.rows, null, 2));

  const drop = await pool.query(
    `select campaign_address, token_address, name, symbol, factory_address, created_block
     from public.campaigns
     where chain_id=$1 and lower(coalesce(factory_address,'')) <> all($2::text[])
     order by coalesce(created_at_chain, updated_at) desc nulls last`,
    [CHAIN_ID, KEEP_FACTORIES],
  );
  console.log(`\nDROP (${drop.rowCount} campaigns):`);
  console.log(JSON.stringify(drop.rows, null, 2));

  if (!EXECUTE) {
    console.log("\nDry-run only. Re-run with --execute to delete DROP set (+ related rows).");
    await pool.end();
    return;
  }

  if (drop.rowCount === 0) {
    console.log("\nNothing to delete.");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const campaignTables = [
      "curve_trades",
      "token_candles",
      "token_stats",
      "token_comments",
      "campaign_activity",
      "campaign_follows",
      "campaign_market_state",
      "market_stats",
      "dex_trades",
      "dex_pools",
      "votes",
      "vote_aggregates",
      "user_coin_edges",
      "chat_messages",
      "chat_mutes",
      "activity_events",
    ];

    for (const table of campaignTables) {
      if (!(await tableExists(table))) {
        console.log(`skip missing table ${table}`);
        continue;
      }
      const col = await client.query(
        `select 1 from information_schema.columns
         where table_schema='public' and table_name=$1 and column_name='campaign_address' limit 1`,
        [table],
      );
      if ((col.rowCount ?? 0) === 0) {
        console.log(`skip ${table} (no campaign_address)`);
        continue;
      }
      const r = await client.query(
        `delete from public.${table} t
         using public.campaigns c
         where c.chain_id=$1
           and c.campaign_address=t.campaign_address
           and t.chain_id=c.chain_id
           and lower(coalesce(c.factory_address,'')) <> all($2::text[])`,
        [CHAIN_ID, KEEP_FACTORIES],
      );
      console.log(`deleted ${r.rowCount ?? 0} from ${table}`);
    }

    const cursors = await client.query(
      `delete from public.indexer_state s
       using public.campaigns c
       where s.chain_id=$1
         and s.cursor = 'campaign:' || c.campaign_address
         and c.chain_id=$1
         and lower(coalesce(c.factory_address,'')) <> all($2::text[])`,
      [CHAIN_ID, KEEP_FACTORIES],
    );
    console.log(`deleted ${cursors.rowCount ?? 0} campaign indexer cursors`);

    const keepFactoryCursors = KEEP_FACTORIES.map((f) => `factory:${f}`);
    const factoryCursors = await client.query(
      `delete from public.indexer_state
       where chain_id=$1
         and cursor like 'factory:%'
         and cursor <> all($2::text[])`,
      [CHAIN_ID, keepFactoryCursors],
    );
    console.log(`deleted ${factoryCursors.rowCount ?? 0} non-keep factory cursors`);

    const campaignsDeleted = await client.query(
      `delete from public.campaigns
       where chain_id=$1 and lower(coalesce(factory_address,'')) <> all($2::text[])`,
      [CHAIN_ID, KEEP_FACTORIES],
    );
    console.log(`deleted ${campaignsDeleted.rowCount ?? 0} campaigns`);

    await client.query("commit");
    console.log("\nEXECUTE complete. Keep-factory campaigns remain.");
  } catch (error) {
    await client.query("rollback");
    console.error("ROLLBACK", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
