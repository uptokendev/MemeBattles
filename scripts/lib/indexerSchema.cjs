const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = 1;

const INDEXER_TABLES = [
  {
    name: "indexer_meta",
    sql: `CREATE TABLE IF NOT EXISTS indexer_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);`,
  },
  {
    name: "contracts",
    sql: `CREATE TABLE IF NOT EXISTS contracts (
  chain_id INTEGER NOT NULL,
  contract_name TEXT NOT NULL,
  address TEXT NOT NULL,
  deployment_block INTEGER,
  first_seen_block INTEGER,
  PRIMARY KEY (chain_id, contract_name)
);`,
  },
  {
    name: "event_cursors",
    sql: `CREATE TABLE IF NOT EXISTS event_cursors (
  chain_id INTEGER NOT NULL,
  contract_name TEXT NOT NULL,
  address TEXT NOT NULL,
  event_signature TEXT NOT NULL,
  last_scanned_block INTEGER NOT NULL DEFAULT 0,
  last_scanned_log_index INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chain_id, contract_name, event_signature)
);`,
  },
  {
    name: "campaigns",
    sql: `CREATE TABLE IF NOT EXISTS campaigns (
  chain_id INTEGER NOT NULL,
  campaign_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  creator_address TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  logo_uri TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  created_block INTEGER NOT NULL,
  created_tx_hash TEXT NOT NULL,
  created_log_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'bonding',
  finalized_block INTEGER,
  finalized_tx_hash TEXT,
  dex_pair TEXT,
  PRIMARY KEY (chain_id, campaign_address),
  UNIQUE (chain_id, token_address)
);`,
  },
  {
    name: "trades",
    sql: `CREATE TABLE IF NOT EXISTS trades (
  chain_id INTEGER NOT NULL,
  campaign_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  trader_address TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  token_amount_wei TEXT NOT NULL,
  native_amount_wei TEXT NOT NULL,
  PRIMARY KEY (chain_id, tx_hash, log_index)
);`,
  },
  {
    name: "graduations",
    sql: `CREATE TABLE IF NOT EXISTS graduations (
  chain_id INTEGER NOT NULL,
  campaign_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  pair_address TEXT NOT NULL,
  graduation_balance_wei TEXT NOT NULL,
  graduation_overshoot_wei TEXT NOT NULL,
  liquidity_tokens_wei TEXT NOT NULL,
  liquidity_bnb_wei TEXT NOT NULL,
  liquidity_lp_wei TEXT NOT NULL,
  protocol_fee_wei TEXT NOT NULL,
  creator_payout_wei TEXT NOT NULL,
  burned_unsold_tokens_wei TEXT NOT NULL,
  burned_unused_lp_tokens_wei TEXT NOT NULL,
  final_curve_price_wei TEXT NOT NULL,
  initial_dex_price_wei TEXT NOT NULL,
  post_burn_total_supply_wei TEXT NOT NULL,
  PRIMARY KEY (chain_id, campaign_address)
);`,
  },
  {
    name: "route_executions",
    sql: `CREATE TABLE IF NOT EXISTS route_executions (
  chain_id INTEGER NOT NULL,
  router_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  route_kind INTEGER NOT NULL,
  route_profile INTEGER NOT NULL,
  amount_in_wei TEXT NOT NULL,
  league_amount_wei TEXT NOT NULL,
  recruiter_amount_wei TEXT NOT NULL,
  airdrop_amount_wei TEXT NOT NULL,
  squad_amount_wei TEXT NOT NULL,
  protocol_amount_wei TEXT NOT NULL,
  PRIMARY KEY (chain_id, tx_hash, log_index)
);`,
  },
  {
    name: "lp_locks",
    sql: `CREATE TABLE IF NOT EXISTS lp_locks (
  chain_id INTEGER NOT NULL,
  locker_address TEXT NOT NULL,
  lp_token_address TEXT NOT NULL,
  depositor_address TEXT,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  amount_wei TEXT,
  total_locked_wei TEXT,
  action TEXT NOT NULL CHECK (action IN ('registered', 'locked')),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);`,
  },
  {
    name: "creator_registry_events",
    sql: `CREATE TABLE IF NOT EXISTS creator_registry_events (
  chain_id INTEGER NOT NULL,
  registry_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  creator_address TEXT,
  event_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (chain_id, tx_hash, log_index)
);`,
  },
  {
    name: "risk_registry_events",
    sql: `CREATE TABLE IF NOT EXISTS risk_registry_events (
  chain_id INTEGER NOT NULL,
  registry_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  wallet_address TEXT,
  cluster_id TEXT,
  event_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (chain_id, tx_hash, log_index)
);`,
  },
  {
    name: "treasury_movements",
    sql: `CREATE TABLE IF NOT EXISTS treasury_movements (
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  to_address TEXT,
  from_address TEXT,
  amount_wei TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (chain_id, tx_hash, log_index)
);`,
  },
];

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_campaigns_creator ON campaigns (chain_id, creator_address, created_block);",
  "CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (chain_id, status, created_block);",
  "CREATE INDEX IF NOT EXISTS idx_trades_campaign_block ON trades (chain_id, campaign_address, block_number);",
  "CREATE INDEX IF NOT EXISTS idx_trades_trader_block ON trades (chain_id, trader_address, block_number);",
  "CREATE INDEX IF NOT EXISTS idx_route_executions_block ON route_executions (chain_id, block_number);",
  "CREATE INDEX IF NOT EXISTS idx_lp_locks_token_block ON lp_locks (chain_id, lp_token_address, block_number);",
  "CREATE INDEX IF NOT EXISTS idx_creator_registry_events_creator ON creator_registry_events (chain_id, creator_address, block_number);",
  "CREATE INDEX IF NOT EXISTS idx_risk_registry_events_wallet ON risk_registry_events (chain_id, wallet_address, block_number);",
  "CREATE INDEX IF NOT EXISTS idx_treasury_movements_contract_block ON treasury_movements (chain_id, contract_address, block_number);",
];

function buildIndexerSchemaSql() {
  const statements = [
    "-- MemeWarzone indexer schema",
    `-- schemaVersion=${SCHEMA_VERSION}`,
    "PRAGMA foreign_keys = ON;",
    ...INDEXER_TABLES.map((table) => table.sql),
    ...INDEXES,
    `INSERT OR REPLACE INTO indexer_meta (key, value, updated_at) VALUES ('schemaVersion', '${SCHEMA_VERSION}', strftime('%s','now'));`,
  ];

  return `${statements.join("\n\n")}\n`;
}

function tableNames() {
  return INDEXER_TABLES.map((table) => table.name);
}

function writeIndexerSchema(outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buildIndexerSchemaSql());
  return { schemaVersion: SCHEMA_VERSION, tables: tableNames(), outFile };
}

module.exports = {
  INDEXER_TABLES,
  INDEXES,
  SCHEMA_VERSION,
  buildIndexerSchemaSql,
  tableNames,
  writeIndexerSchema,
};
