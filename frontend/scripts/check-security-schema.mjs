import { pool } from "../server/db.js";

const requiredTables = [
  "creator_profiles",
  "creator_tier_history",
  "wallet_risk_profiles",
  "wallet_clusters",
  "cluster_members",
  "manual_review_queue",
  "security_actions",
  "contract_sync_jobs",
  "campaign_security_states",
  "mass_deployer_flags",
  "route_authorization_log",
  "recruiter_accounts",
  "recruiter_payout_wallets",
  "recruiter_reward_ledger",
  "recruiter_reward_claims",
  "recruiter_payout_reconciliation_runs",
  "reward_ledger",
  "reward_batches",
  "reward_batch_items",
  "reward_audit_logs",
  "reward_alerts",
];

const requiredColumns = {
  creator_profiles: ["creator_wallet", "tier", "live_bonding_count", "last_launch_at", "restricted", "manual_review_required", "cluster_id"],
  wallet_risk_profiles: ["wallet_address", "risk_level", "restricted", "cluster_id"],
  wallet_clusters: ["cluster_id", "wallet_count", "risk_level", "restricted", "primary_signals"],
  manual_review_queue: ["id", "creator_wallet", "reason", "priority", "status"],
  security_actions: ["id", "admin_email", "action", "target", "old_value", "new_value", "reason", "tx_hash", "created_at"],
  contract_sync_jobs: ["id", "chain", "job_type", "target", "status", "tx_hash", "error", "created_at", "updated_at"],
  campaign_security_states: ["campaign_address", "paused", "buy_paused", "sell_paused", "graduation_paused"],
  recruiter_reward_ledger: ["id", "recruiter_id", "chain", "token", "amount_raw", "status", "claim_id"],
  recruiter_reward_claims: ["id", "recruiter_id", "chain", "token", "amount_raw", "payout_wallet", "status", "tx_hash", "error"],
  reward_ledger: ["id", "reward_type", "source_id", "source_label", "wallet_address", "chain", "token_symbol", "amount", "status", "claim_batch_id", "claim_tx_hash", "claim_error", "metadata", "claimable_at", "claimed_at", "expires_at"],
  reward_batches: ["id", "reward_type", "chain", "token_symbol", "status", "total_amount", "recipient_count", "claimable_count", "claimed_count", "failed_count", "source", "metadata", "published_at", "closed_at"],
  reward_batch_items: ["id", "batch_id", "reward_ledger_id", "wallet_address", "amount", "status", "metadata", "created_at"],
  reward_audit_logs: ["id", "batch_id", "reward_ledger_id", "actor_type", "actor_id", "action", "old_value", "new_value", "reason", "tx_hash", "metadata", "created_at"],
  reward_alerts: ["id", "severity", "reward_type", "batch_id", "title", "message", "status", "metadata", "created_at", "resolved_at", "resolved_by"],
};

async function main() {
  const tableResult = await pool.query(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [requiredTables],
  );
  const foundTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !foundTables.has(table));

  const columnResult = await pool.query(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])`,
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
    console.error("[security-schema] missing tables:", missingTables.length ? missingTables.join(", ") : "none");
    console.error("[security-schema] missing columns:", missingColumns.length ? missingColumns.join(", ") : "none");
    process.exitCode = 1;
    return;
  }

  console.log(`[security-schema] OK (${requiredTables.length} tables checked)`);
}

main()
  .catch((error) => {
    console.error("[security-schema] check failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });