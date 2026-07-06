import { pool } from "../server/db.js";

const requiredTables = [
  "airdrop_epochs",
  "airdrop_candidates",
  "airdrop_winners",
  "airdrop_claims",
  "airdrop_admin_reviews",
];

const requiredColumns = {
  airdrop_epochs: ["id", "epoch_label", "chain_id", "token_symbol", "prize_pool_amount", "status", "next_drop_at", "merkle_root", "contract_address"],
  airdrop_candidates: ["id", "epoch_id", "wallet_address", "role", "is_eligible", "reason_codes", "activity_score"],
  airdrop_winners: ["id", "epoch_id", "wallet_address", "role", "winner_rank", "amount_raw", "merkle_index", "merkle_proof"],
  airdrop_claims: ["id", "winner_id", "wallet_address", "chain_id", "status", "tx_hash", "claim_payload", "claimed_at"],
  airdrop_admin_reviews: ["id", "epoch_id", "admin_email", "action", "target", "old_value", "new_value", "reason", "tx_hash"],
};

async function main() {
  const tableResult = await pool.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
    [requiredTables],
  );
  const foundTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !foundTables.has(table));

  const columnResult = await pool.query(
    `select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name = any($1::text[])`,
    [Object.keys(requiredColumns)],
  );
  const columnsByTable = new Map();
  for (const row of columnResult.rows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
    columnsByTable.get(row.table_name).add(row.column_name);
  }

  const missingColumns = [];
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const found = columnsByTable.get(table) || new Set();
    for (const column of columns) {
      if (!found.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }

  if (missingTables.length || missingColumns.length) {
    console.error("[airdrop-schema] missing tables:", missingTables.length ? missingTables.join(", ") : "none");
    console.error("[airdrop-schema] missing columns:", missingColumns.length ? missingColumns.join(", ") : "none");
    process.exitCode = 1;
    return;
  }

  console.log(`[airdrop-schema] OK (${requiredTables.length} tables checked)`);
}

main()
  .catch((error) => {
    console.error("[airdrop-schema] check failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
