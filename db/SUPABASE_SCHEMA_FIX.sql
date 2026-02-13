-- MemeBattles Supabase schema fix (League + profiles/comments)
-- Safe to run multiple times.

-- ---------------------------
-- campaigns
-- ---------------------------
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS logo_uri text,
  ADD COLUMN IF NOT EXISTS created_at_chain timestamptz,
  ADD COLUMN IF NOT EXISTS graduated_at_chain timestamptz,
  ADD COLUMN IF NOT EXISTS graduated_block bigint,
  ADD COLUMN IF NOT EXISTS fee_recipient_address text;

CREATE INDEX IF NOT EXISTS campaigns_chain_created_block_idx
  ON public.campaigns(chain_id, created_block);

CREATE INDEX IF NOT EXISTS campaigns_chain_graduated_at_idx
  ON public.campaigns(chain_id, graduated_at_chain DESC);

-- ---------------------------
-- curve_trades: ensure log_index exists for stable UI keys
-- ---------------------------
ALTER TABLE public.curve_trades
  ADD COLUMN IF NOT EXISTS log_index integer;

CREATE INDEX IF NOT EXISTS curve_trades_chain_campaign_side_time_idx
  ON public.curve_trades(chain_id, campaign_address, side, block_time DESC);

-- ---------------------------
-- user_profiles
-- ---------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  chain_id integer NOT NULL,
  address text NOT NULL,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, address)
);

-- Ensure expected columns exist (if table was created earlier with a different shape)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- ---------------------------
-- auth_nonces (used for profile/comment signatures)
-- ---------------------------
CREATE TABLE IF NOT EXISTS public.auth_nonces (
  chain_id integer NOT NULL,
  address text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, address)
);

ALTER TABLE public.auth_nonces
  ADD COLUMN IF NOT EXISTS nonce text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- ---------------------------
-- token_comments
-- ---------------------------
CREATE TABLE IF NOT EXISTS public.token_comments (
  id bigserial PRIMARY KEY,
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  token_address text,
  author_address text NOT NULL,
  body text NOT NULL,
  parent_id bigint,
  status integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.token_comments
  ADD COLUMN IF NOT EXISTS token_address text,
  ADD COLUMN IF NOT EXISTS parent_id bigint,
  ADD COLUMN IF NOT EXISTS status integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE INDEX IF NOT EXISTS token_comments_chain_campaign_id_idx
  ON public.token_comments(chain_id, campaign_address, id DESC);

-- Note: if you use RLS on these tables, ensure your server-side DB user (DATABASE_URL)
-- has permissions, or disable RLS for these tables (since Vercel/Railway access via Postgres).
