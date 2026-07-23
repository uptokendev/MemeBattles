import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const v = String(process.env[name] || "").trim();
    if (v) return v;
  }
  return "";
}

export const ENV = {
  DATABASE_URL: req("DATABASE_URL"),
  ABLY_API_KEY: req("ABLY_API_KEY"),

  BSC_RPC_HTTP_97: req("BSC_RPC_HTTP_97"),
  BSC_RPC_HTTP_56: process.env.BSC_RPC_HTTP_56 || "",

  FACTORY_ADDRESS_97: firstEnv("FACTORY_ADDRESS_97", "VITE_FACTORY_ADDRESS_97", "FACTORY_ADDRESS", "VITE_FACTORY_ADDRESS"),
  FACTORY_ADDRESS_56: firstEnv("FACTORY_ADDRESS_56", "VITE_FACTORY_ADDRESS_56", "FACTORY_ADDRESS", "VITE_FACTORY_ADDRESS"),

  SOLANA_RPC_HTTP: process.env.SOLANA_RPC_HTTP || "",
  SOLANA_LAUNCHPAD_PROGRAM_ID: process.env.SOLANA_LAUNCHPAD_PROGRAM_ID || "",
  SOLANA_START_SLOT: Number(process.env.SOLANA_START_SLOT || 0),
  SOLANA_LOOKBACK_SLOTS: Number(process.env.SOLANA_LOOKBACK_SLOTS || 50_000),
  SOLANA_SIGNATURE_LIMIT: Number(process.env.SOLANA_SIGNATURE_LIMIT || 500),
  SOLANA_SIGNATURE_PAGE_LIMIT: Number(process.env.SOLANA_SIGNATURE_PAGE_LIMIT || 5),
  SOLANA_INDEXER_INTERVAL_MS: Number(process.env.SOLANA_INDEXER_INTERVAL_MS || 10_000),

  // UPVoteTreasury addresses (optional; if not set, vote indexing is disabled for that chain)
  VOTE_TREASURY_ADDRESS_97: firstEnv("VOTE_TREASURY_ADDRESS_97", "VITE_VOTE_TREASURY_ADDRESS_97", "VOTE_TREASURY_ADDRESS", "VITE_VOTE_TREASURY_ADDRESS"),
  VOTE_TREASURY_ADDRESS_56: firstEnv("VOTE_TREASURY_ADDRESS_56", "VITE_VOTE_TREASURY_ADDRESS_56", "VOTE_TREASURY_ADDRESS", "VITE_VOTE_TREASURY_ADDRESS"),

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

  RANK_EVENTS_TOKEN: process.env.RANK_EVENTS_TOKEN || "",
  REWARD_REMINDER_WEBHOOK_URL: process.env.REWARD_REMINDER_WEBHOOK_URL || "",
  REWARD_REMINDER_RETRY_BACKOFF_MS: Number(process.env.REWARD_REMINDER_RETRY_BACKOFF_MS || "3600000"),
  ROUTE_AUTHORITY_PRIVATE_KEY: process.env.ROUTE_AUTHORITY_PRIVATE_KEY || "",
  ROUTE_AUTH_SIGNATURE_TTL_SECONDS: Number(process.env.ROUTE_AUTH_SIGNATURE_TTL_SECONDS || "300"),
  RECRUITER_LEADERBOARD_WEIGHT_LINKED_WALLETS: Number(process.env.RECRUITER_LEADERBOARD_WEIGHT_LINKED_WALLETS || "1"),
  RECRUITER_LEADERBOARD_WEIGHT_LINKED_CREATORS: Number(process.env.RECRUITER_LEADERBOARD_WEIGHT_LINKED_CREATORS || "3"),
  RECRUITER_LEADERBOARD_WEIGHT_LINKED_TRADERS: Number(process.env.RECRUITER_LEADERBOARD_WEIGHT_LINKED_TRADERS || "2"),
  RECRUITER_LEADERBOARD_WEIGHT_ROUTED_VOLUME_BNB: Number(process.env.RECRUITER_LEADERBOARD_WEIGHT_ROUTED_VOLUME_BNB || "0.05"),
  RECRUITER_LEADERBOARD_WEIGHT_TOTAL_EARNED_BNB: Number(process.env.RECRUITER_LEADERBOARD_WEIGHT_TOTAL_EARNED_BNB || "1"),
  AIRDROP_DRAW_SEED_SALT: process.env.AIRDROP_DRAW_SEED_SALT || "memewarzone-airdrops",
  AIRDROP_BASE_WINNER_COUNT: Number(process.env.AIRDROP_BASE_WINNER_COUNT || "1"),
  AIRDROP_WINNER_COUNT_PER_BNB: Number(process.env.AIRDROP_WINNER_COUNT_PER_BNB || "1"),
  AIRDROP_MAX_WINNER_COUNT: Number(process.env.AIRDROP_MAX_WINNER_COUNT || "25"),
  AIRDROP_WEIGHT_TIER_STEP_BNB: Number(process.env.AIRDROP_WEIGHT_TIER_STEP_BNB || "1"),
  AIRDROP_MAX_WEIGHT_TIER: Number(process.env.AIRDROP_MAX_WEIGHT_TIER || "25"),

  PORT: Number(process.env.PORT || "3000")
};
