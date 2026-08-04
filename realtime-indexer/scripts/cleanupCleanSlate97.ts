/**
 * TESTNET clean slate for chain 97:
 *   - DELETE all public.campaigns + related market/trade/indexer rows
 *   - NEVER touch public.campaign_drafts or draft_* tables
 *
 * Usage (from realtime-indexer/):
 *   npx tsx scripts/cleanupCleanSlate97.ts --dry-run
 *   npx tsx scripts/cleanupCleanSlate97.ts --execute
 */
import "dotenv/config";
import pg from "pg";

const CHAIN_ID = Number(process.env.CLEAN_CHAIN_ID || 97);
const EXECUTE = process.argv.includes("--execute");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!Number.isInteger(CHAIN_ID) || CHAIN_ID <= 0) {
  console.error("Invalid CLEAN_CHAIN_ID");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  max: 2,
});

async function tableExists(client: pg.PoolClient | pg.Pool, name: string): Promise<boolean> {
  const r = await client.query(
    `select 1 from information_schema.tables
     where table_schema='public' and table_name=$1 limit 1`,
    [name],
  );
  return (r.rowCount ?? 0) > 0;
}

async function hasColumn(
  client: pg.PoolClient | pg.Pool,
  table: string,
  column: string,
): Promise<boolean> {
  const r = await client.query(
    `select 1 from information_schema.columns
     where table_schema='public' and table_name=$1 and column_name=$2 limit 1`,
    [table, column],
  );
  return (r.rowCount ?? 0) > 0;
}

async function main() {
  console.log(JSON.stringify({ mode: EXECUTE ? "EXECUTE" : "DRY_RUN", chainId: CHAIN_ID }, null, 2));

  const camps = await pool.query(
    `select campaign_address, token_address, name, symbol, factory_address, is_active
     from public.campaigns where chain_id=$1
     order by coalesce(created_at_chain, updated_at) desc nulls last`,
    [CHAIN_ID],
  );
  console.log(`\nCampaigns to remove (${camps.rowCount}):`);
  console.log(JSON.stringify(camps.rows, null, 2));

  if (await tableExists(pool, "campaign_drafts")) {
    const drafts = await pool.query(
      `select status, count(*)::int as n
       from public.campaign_drafts
       where chain_id=$1
       group by 1 order by 1`,
      [CHAIN_ID],
    );
    console.log("\nDrafts PRESERVED (counts by status):");
    console.log(JSON.stringify(drafts.rows, null, 2));
  }

  if (!EXECUTE) {
    console.log("\nDry-run only. Re-run with --execute to wipe all campaigns (drafts stay).");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    // Tables keyed by campaign_address + chain_id (delete for ALL chain campaigns).
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
      if (!(await tableExists(client, table))) {
        console.log(`skip missing ${table}`);
        continue;
      }
      if (!(await hasColumn(client, table, "campaign_address"))) {
        console.log(`skip ${table} (no campaign_address)`);
        continue;
      }
      if (await hasColumn(client, table, "chain_id")) {
        const r = await client.query(
          `delete from public.${table} t
           using public.campaigns c
           where c.chain_id=$1
             and t.chain_id=c.chain_id
             and t.campaign_address=c.campaign_address`,
          [CHAIN_ID],
        );
        console.log(`deleted ${r.rowCount ?? 0} from ${table}`);
      } else {
        const r = await client.query(
          `delete from public.${table} t
           using public.campaigns c
           where c.chain_id=$1
             and t.campaign_address=c.campaign_address`,
          [CHAIN_ID],
        );
        console.log(`deleted ${r.rowCount ?? 0} from ${table}`);
      }
    }

    // Campaign indexer cursors
    const cursors = await client.query(
      `delete from public.indexer_state
       where chain_id=$1
         and (
           cursor like 'campaign:%'
           or cursor like 'factory:%'
         )`,
      [CHAIN_ID],
    );
    console.log(`deleted ${cursors.rowCount ?? 0} campaign/factory indexer cursors`);

    // Orphan trades (no campaign row) — belt and suspenders for chain 97
    if (await tableExists(client, "curve_trades")) {
      const orphan = await client.query(`delete from public.curve_trades where chain_id=$1`, [CHAIN_ID]);
      console.log(`deleted ${orphan.rowCount ?? 0} curve_trades (full chain wipe)`);
    }
    if (await tableExists(client, "token_candles")) {
      const r = await client.query(`delete from public.token_candles where chain_id=$1`, [CHAIN_ID]);
      console.log(`deleted ${r.rowCount ?? 0} token_candles (full chain wipe)`);
    }
    if (await tableExists(client, "token_stats")) {
      const r = await client.query(`delete from public.token_stats where chain_id=$1`, [CHAIN_ID]);
      console.log(`deleted ${r.rowCount ?? 0} token_stats (full chain wipe)`);
    }
    if (await tableExists(client, "campaign_market_state")) {
      const r = await client.query(`delete from public.campaign_market_state where chain_id=$1`, [CHAIN_ID]);
      console.log(`deleted ${r.rowCount ?? 0} campaign_market_state (full chain wipe)`);
    }
    if (await tableExists(client, "dex_trades")) {
      const r = await client.query(`delete from public.dex_trades where chain_id=$1`, [CHAIN_ID]);
      console.log(`deleted ${r.rowCount ?? 0} dex_trades (full chain wipe)`);
    }
    if (await tableExists(client, "dex_pools")) {
      const r = await client.query(`delete from public.dex_pools where chain_id=$1`, [CHAIN_ID]);
      console.log(`deleted ${r.rowCount ?? 0} dex_pools (full chain wipe)`);
    }

    const campaignsDeleted = await client.query(`delete from public.campaigns where chain_id=$1`, [CHAIN_ID]);
    console.log(`deleted ${campaignsDeleted.rowCount ?? 0} campaigns`);

    // Sanity: drafts still there
    if (await tableExists(client, "campaign_drafts")) {
      const left = await client.query(
        `select count(*)::int as n from public.campaign_drafts where chain_id=$1`,
        [CHAIN_ID],
      );
      console.log(`drafts remaining: ${left.rows[0]?.n}`);
    }

    await client.query("commit");
    console.log("\nCLEAN SLATE complete. campaign_drafts untouched.");
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
