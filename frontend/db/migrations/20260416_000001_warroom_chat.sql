-- MemeWarzone War Room realtime chat
-- Apply this before deploying the /api/chat/* routes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'trader',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_wallet_expires
  ON chat_sessions (wallet_address, expires_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  wallet_address text NOT NULL,
  display_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'trader',
  message text NOT NULL,
  client_nonce text,
  reply_to_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  is_hidden boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_time
  ON chat_messages (chain_id, campaign_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_wallet_time
  ON chat_messages (chain_id, campaign_address, wallet_address, created_at DESC);

-- This is the server-side duplicate guard. It makes send retries idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_client_nonce
  ON chat_messages (chain_id, campaign_address, wallet_address, client_nonce);

CREATE TABLE IF NOT EXISTS chat_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  wallet_address text NOT NULL,
  muted_until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_mutes_active
  ON chat_mutes (chain_id, campaign_address, wallet_address, muted_until DESC);
