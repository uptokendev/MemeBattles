#!/usr/bin/env node
import pg from "pg";

const { Pool } = pg;
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

function fail(message) {
  throw new Error(`[solana-cert-db] ${message}`);
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `select exists (select 1 from information_schema.tables where table_schema='public' and table_name=$1) as exists`,
    [table],
  );
  return Boolean(rows[0]?.exists);
}

async function columns(client, table) {
  const { rows } = await client.query(
    `select column_name, data_type, udt_name, is_nullable
       from information_schema.columns
      where table_schema='public' and table_name=$1
      order by ordinal_position`,
    [table],
  );
  return rows;
}

function has(cols, name) {
  return cols.some((column) => column.column_name === name);
}

async function aggregate(client, sql, params = []) {
  try {
    return (await client.query(sql, params)).rows;
  } catch (error) {
    return [{ error: error?.message || String(error) }];
  }
}

async function main() {
  if (!DATABASE_URL) fail("DATABASE_URL is required");
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const tables = [
      "recruiter_reward_ledger",
      "reward_ledger",
      "league_epoch_winners",
      "weekly_reward_epochs",
      "solana_reward_lane_batches",
      "solana_reward_lane_entitlements",
      "squad_member_weekly_payouts",
    ];
    const result = { ok: true, tables: {} };
    for (const table of tables) {
      const exists = await tableExists(client, table);
      result.tables[table] = { exists, columns: exists ? await columns(client, table) : [] };
    }

    const recruiterCols = result.tables.recruiter_reward_ledger.columns;
    if (result.tables.recruiter_reward_ledger.exists) {
      const selectors = ["chain", "chain_id", "network", "status", "token_symbol"].filter((name) => has(recruiterCols, name));
      if (selectors.length) {
        const group = selectors.join(", ");
        result.recruiterAggregates = await aggregate(
          client,
          `select ${group}, count(*)::int as row_count from public.recruiter_reward_ledger group by ${group} order by row_count desc limit 50`,
        );
      }
      if (has(recruiterCols, "metadata")) {
        result.recruiterMetadataChainIds = await aggregate(
          client,
          `select coalesce(metadata->>'chainId', metadata->>'chain_id', '<missing>') as metadata_chain_id,
                  count(*)::int as row_count
             from public.recruiter_reward_ledger
            where lower(coalesce(chain,''))='solana'
            group by 1 order by row_count desc limit 20`,
        );
      }
    }

    const rewardCols = result.tables.reward_ledger.columns;
    if (result.tables.reward_ledger.exists && has(rewardCols, "chain")) {
      const statusExpr = has(rewardCols, "status") ? ", status" : "";
      result.rewardLedgerAggregates = await aggregate(
        client,
        `select chain${statusExpr}, count(*)::int as row_count from public.reward_ledger group by chain${statusExpr} order by row_count desc limit 50`,
      );
    }

    const leagueCols = result.tables.league_epoch_winners.columns;
    if (result.tables.league_epoch_winners.exists && has(leagueCols, "chain_id")) {
      result.leagueWinnerCounts = await aggregate(
        client,
        `select chain_id, period, count(*)::int as row_count, max(epoch_start) as latest_epoch_start, max(epoch_end) as latest_epoch_end
           from public.league_epoch_winners group by chain_id, period order by chain_id, period`,
      );
    }

    const epochCols = result.tables.weekly_reward_epochs.columns;
    if (result.tables.weekly_reward_epochs.exists && has(epochCols, "chain_id")) {
      result.weeklyEpochCounts = await aggregate(
        client,
        `select chain_id, status, count(*)::int as row_count, max(id) as latest_id, max(end_at) as latest_end_at
           from public.weekly_reward_epochs group by chain_id, status order by chain_id, status`,
      );
    }

    const laneCols = result.tables.solana_reward_lane_batches.columns;
    if (result.tables.solana_reward_lane_batches.exists && has(laneCols, "chain_id")) {
      result.laneBatchCounts = await aggregate(
        client,
        `select chain_id, lane, status, count(*)::int as row_count, max(epoch_id) as latest_epoch_id
           from public.solana_reward_lane_batches group by chain_id, lane, status order by chain_id, lane, status`,
      );
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
