CREATE TABLE IF NOT EXISTS public.chat_sessions (
  token_hash text PRIMARY KEY,
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  wallet_address text NOT NULL,
  display_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'trader',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id bigserial PRIMARY KEY,
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  wallet_address text NOT NULL,
  display_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'trader',
  message text NOT NULL,
  client_nonce text,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_mutes (
  id bigserial PRIMARY KEY,
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  wallet_address text NOT NULL,
  muted_until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_time ON public.chat_messages(chain_id, campaign_address, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_room_wallet ON public.chat_sessions(chain_id, campaign_address, wallet_address);
CREATE INDEX IF NOT EXISTS idx_chat_mutes_room_wallet ON public.chat_mutes(chain_id, campaign_address, wallet_address);
CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_messages_room_wallet_nonce
  ON public.chat_messages(chain_id, campaign_address, wallet_address, client_nonce)
  WHERE client_nonce IS NOT NULL;
