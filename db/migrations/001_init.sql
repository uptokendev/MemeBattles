-- db/migrations/001_init.sql

BEGIN;

-- 1) Stores normalized on-chain events we can render as Activity items
CREATE TABLE IF NOT EXISTS activity_events (
  id                BIGSERIAL PRIMARY KEY,

  chain_id          INTEGER NOT NULL,
  event_type        TEXT NOT NULL, -- e.g. CREATE_CAMPAIGN, BUY, SELL, FINALIZE

  tx_hash           TEXT NOT NULL,
  log_index         INTEGER NOT NULL,
  block_number      BIGINT NOT NULL,
  block_time        TIMESTAMPTZ NOT NULL,

  actor_address     TEXT NOT NULL, -- buyer/seller/creator/finalizer
  campaign_address  TEXT,          -- bonding campaign (LaunchCampaign)
  token_address     TEXT,          -- token address (if known/emitted)

  -- amounts in raw wei for lossless accounting
  amount_in_wei     NUMERIC(78, 0),
  amount_out_wei    NUMERIC(78, 0),
  cost_wei          NUMERIC(78, 0),
  payout_wei        NUMERIC(78, 0),

  meta              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT activity_events_uniq_log UNIQUE (chain_id, tx_hash, log_index)
);

-- Indexes for common feed queries
CREATE INDEX IF NOT EXISTS idx_activity_events_actor_time
  ON activity_events (chain_id, actor_address, block_number DESC, log_index DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_campaign_time
  ON activity_events (chain_id, campaign_address, block_number DESC, log_index DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_token_time
  ON activity_events (chain_id, token_address, block_number DESC, log_index DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_block_time
  ON activity_events (chain_id, block_number DESC, log_index DESC);


-- 2) Relationship graph: which campaigns/tokens matter to a wallet (created/bought)
CREATE TABLE IF NOT EXISTS user_coin_edges (
  chain_id          INTEGER NOT NULL,
  user_address      TEXT NOT NULL,
  campaign_address  TEXT NOT NULL,
  token_address     TEXT,
  reason            TEXT NOT NULL, -- CREATED | BOUGHT_BONDING

  first_seen_block  BIGINT,
  first_seen_time   TIMESTAMPTZ,
  last_seen_block   BIGINT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, user_address, campaign_address, reason)
);

CREATE INDEX IF NOT EXISTS idx_user_coin_edges_user
  ON user_coin_edges (chain_id, user_address);

CREATE INDEX IF NOT EXISTS idx_user_coin_edges_campaign
  ON user_coin_edges (chain_id, campaign_address);


-- 3) Indexer checkpoints: where the cron job left off
CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  chain_id              INTEGER NOT NULL,
  checkpoint_key        TEXT NOT NULL,   -- e.g. FACTORY:<addr> or CAMPAIGN:<addr>
  contract_address      TEXT NOT NULL,
  last_processed_block  BIGINT NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, checkpoint_key)
);

COMMIT;