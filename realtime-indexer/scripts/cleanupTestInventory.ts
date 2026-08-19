/**
 * Guarded test-inventory cleanup.
 * Preserves campaign_drafts and ticker_reservations with draft_id IS NOT NULL.
 *
 * Usage from realtime-indexer/:
 *   npx tsx scripts/cleanupTestInventory.ts --scope bsc-testnet --dry-run
 *   npx tsx scripts/cleanupTestInventory.ts --scope bsc-testnet,solana-devnet --execute --confirm DELETE-TEST-INVENTORY
 */
import "dotenv/config";
import pg from "pg";

const EXECUTE = process.argv.includes("--execute");
const DRY_RUN = !EXECUTE;
const CONFIRM = readArg("--confirm") || "";
const SCOPE = String(readArg("--scope") || "bsc-testnet")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const EXPECTED_CAMPAIGNS = optionalInt("--expected-campaign-count");
const EXPECTED_RESERVATIONS = optionalInt("--expected-nondraft-reservation-count");

const ALLOWED_SCOPES = new Set(["bsc-testnet", "solana-devnet", "solana-testnet"]);

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function optionalInt(name: string) {
  const raw = readArg(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

for (const scope of SCOPE) {
  if (!ALLOWED_SCOPES.has(scope)) fail(`Unsupported scope ${scope}`);
}

const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is required");
if (EXECUTE && CONFIRM !== "DELETE-TEST-INVENTORY") {
  fail("Refusing --execute without --confirm DELETE-TEST-INVENTORY");
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  max: 2,
});

async function tableExists(client: pg.PoolClient | pg.Pool, name: string) {
  const result = await client.query(
    `select 1 from information_schema.tables where table_schema='public' and table_name=$1 limit 1`,
    [name],
  );
  return (result.rowCount ?? 0) > 0;
}

async function checksumDrafts(client: pg.PoolClient | pg.Pool) {
  if (!(await tableExists(client, "campaign_drafts"))) return { count: 0, checksum: "missing" };
  const result = await client.query(
    `select count(*)::int as n,
            md5(coalesce(string_agg(id::text, ',' order by id), '')) as checksum
       from public.campaign_drafts`,
  );
  return { count: Number(result.rows[0]?.n || 0), checksum: String(result.rows[0]?.checksum || "") };
}

async function main() {
  const evmChains = SCOPE.includes("bsc-testnet") ? [97] : [];
  const solanaClusters = [
    ...(SCOPE.includes("solana-devnet") ? ["solana-devnet"] : []),
    ...(SCOPE.includes("solana-testnet") ? ["solana-testnet"] : []),
  ];

  const campaignWhere = evmChains.length
    ? `chain_id = any($1::int[])`
    : "false";
  const reservationWhere = `
    draft_id is null
    and (
      (chain_id = 97 and cluster = 'bsc-testnet' and $2::bool)
      or (cluster = any($3::text[]))
    )
  `;

  const campaigns = evmChains.length
    ? await pool.query(
        `select campaign_address, token_address, name, symbol, chain_id
           from public.campaigns
          where ${campaignWhere}
          order by updated_at desc nulls last`,
        [evmChains],
      )
    : { rowCount: 0, rows: [] as any[] };

  const reservations = (await tableExists(pool, "ticker_reservations"))
    ? await pool.query(
        `select id, ticker, chain_id, cluster, draft_id
           from public.ticker_reservations
          where ${reservationWhere}`,
        [evmChains, SCOPE.includes("bsc-testnet"), solanaClusters],
      )
    : { rowCount: 0, rows: [] as any[] };

  const draftsBefore = await checksumDrafts(pool);
  console.log(JSON.stringify({
    mode: EXECUTE ? "EXECUTE" : "DRY_RUN",
    scope: SCOPE,
    campaigns: campaigns.rowCount,
    nondraftReservations: reservations.rowCount,
    draftsBefore,
    campaignSample: campaigns.rows.slice(0, 20),
    reservationSample: reservations.rows.slice(0, 20),
  }, null, 2));

  if (EXPECTED_CAMPAIGNS != null && EXPECTED_CAMPAIGNS !== Number(campaigns.rowCount || 0)) {
    fail(`Campaign count ${campaigns.rowCount} != expected ${EXPECTED_CAMPAIGNS}`);
  }
  if (EXPECTED_RESERVATIONS != null && EXPECTED_RESERVATIONS !== Number(reservations.rowCount || 0)) {
    fail(`Reservation count ${reservations.rowCount} != expected ${EXPECTED_RESERVATIONS}`);
  }
  if (reservations.rows.some((row) => row.draft_id)) fail("ABORT: draft-linked ticker selected");

  if (DRY_RUN) {
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '10min'");

    if (await tableExists(client, "ticker_reservation_events") && Number(reservations.rowCount || 0) > 0) {
      await client.query(
        `delete from public.ticker_reservation_events e
          using public.ticker_reservations r
          where e.reservation_id = r.id
            and r.draft_id is null
            and (
              (r.chain_id = 97 and r.cluster = 'bsc-testnet' and $1::bool)
              or (r.cluster = any($2::text[]))
            )`,
        [SCOPE.includes("bsc-testnet"), solanaClusters],
      );
    }
    if (await tableExists(client, "ticker_reservations")) {
      await client.query(
        `delete from public.ticker_reservations
          where draft_id is null
            and (
              (chain_id = 97 and cluster = 'bsc-testnet' and $1::bool)
              or (cluster = any($2::text[]))
            )`,
        [SCOPE.includes("bsc-testnet"), solanaClusters],
      );
    }

    if (evmChains.length) {
      await client.query(`delete from public.campaigns where chain_id = any($1::int[])`, [evmChains]);
    }

    const draftsAfter = await checksumDrafts(client);
    if (draftsAfter.count !== draftsBefore.count || draftsAfter.checksum !== draftsBefore.checksum) {
      throw new Error(`Draft invariant failed: before=${JSON.stringify(draftsBefore)} after=${JSON.stringify(draftsAfter)}`);
    }

    await client.query("commit");
    console.log(JSON.stringify({ ok: true, draftsAfter }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
