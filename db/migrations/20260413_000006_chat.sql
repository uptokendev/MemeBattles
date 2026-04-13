BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'trader',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_sessions_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT chat_sessions_role_valid CHECK (role IN ('trader', 'creator', 'recruiter', 'mod'))
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_wallet_expires
  ON public.chat_sessions (wallet_address, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  campaign_address TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'trader',
  message TEXT NOT NULL,
  reply_to_id BIGINT NULL REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  client_nonce TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chat_messages_campaign_lowercase CHECK (campaign_address = lower(campaign_address)),
  CONSTRAINT chat_messages_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT chat_messages_role_valid CHECK (role IN ('trader', 'creator', 'recruiter', 'mod')),
  CONSTRAINT chat_messages_message_len CHECK (length(trim(message)) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_time
  ON public.chat_messages (chain_id, campaign_address, id DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_wallet_time
  ON public.chat_messages (wallet_address, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_messages_room_nonce
  ON public.chat_messages (chain_id, campaign_address, wallet_address, client_nonce);

COMMIT;
