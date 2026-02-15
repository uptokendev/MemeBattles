import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const ENV = {
  DATABASE_URL: req("DATABASE_URL"),
  ABLY_API_KEY: req("ABLY_API_KEY"),

  BSC_RPC_HTTP_97: req("BSC_RPC_HTTP_97"),
  BSC_RPC_HTTP_56: process.env.BSC_RPC_HTTP_56 || "",

  FACTORY_ADDRESS_97: process.env.FACTORY_ADDRESS_97 || "",
  FACTORY_ADDRESS_56: process.env.FACTORY_ADDRESS_56 || "",

  // UPVoteTreasury addresses (optional; if not set, vote indexing is disabled for that chain)
  VOTE_TREASURY_ADDRESS_97: process.env.VOTE_TREASURY_ADDRESS_97 || "",
  VOTE_TREASURY_ADDRESS_56: process.env.VOTE_TREASURY_ADDRESS_56 || "",

  // Indexing window controls
  // Set FACTORY_START_BLOCK_97 to the factory deployment block (BSC testnet: 83444786 in your current deployment).
  FACTORY_START_BLOCK_97: Number(process.env.FACTORY_START_BLOCK_97 || 0),
  FACTORY_START_BLOCK_56: Number(process.env.FACTORY_START_BLOCK_56 || 0),

  // VoteTreasury start blocks (optional; if not set, fallback to latest - LOOKBACK)
  VOTE_TREASURY_START_BLOCK_97: Number(process.env.VOTE_TREASURY_START_BLOCK_97 || 0),
  VOTE_TREASURY_START_BLOCK_56: Number(process.env.VOTE_TREASURY_START_BLOCK_56 || 0),
  // If FACTORY_START_BLOCK_* is not set, we fallback to (latest - FACTORY_LOOKBACK_BLOCKS)
  FACTORY_LOOKBACK_BLOCKS: Number(process.env.FACTORY_LOOKBACK_BLOCKS || 250000),

  // Log scanning chunk sizes
  LOG_CHUNK_SIZE: Number(process.env.LOG_CHUNK_SIZE || "2000"),
  // When we need to split ranges due to public RPC limits, don't split below this span.
  MIN_LOG_CHUNK_SIZE: Number(process.env.MIN_LOG_CHUNK_SIZE || "250"),

  // Optional daily repair job settings
  REPAIR_LOOKBACK_BLOCKS: Number(process.env.REPAIR_LOOKBACK_BLOCKS || 20000),
  REPAIR_REWIND_BLOCKS: Number(process.env.REPAIR_REWIND_BLOCKS || 200),

  // Poll interval for the always-on indexer loop in server.ts
  // NOTE: Testnet UX benefits from lower latency; tune up for mainnet.
  INDEXER_INTERVAL_MS: Number(process.env.INDEXER_INTERVAL_MS || 5000),

  // Lower default confirmations for faster UI updates (especially on testnet).
  CONFIRMATIONS: Number(process.env.CONFIRMATIONS || "1"),

  // Optional telemetry (recommended). If not set, telemetry is disabled.
  TELEMETRY_INGEST_URL: process.env.TELEMETRY_INGEST_URL || "https://memebattles-telemetry-production.up.railway.app/ingest",
  TELEMETRY_TOKEN: process.env.TELEMETRY_TOKEN || "datraadjetochnooit1234!!",
  TELEMETRY_INTERVAL_MS: Number(process.env.TELEMETRY_INTERVAL_MS || "15000"),

  PORT: Number(process.env.PORT || "3000")
};
