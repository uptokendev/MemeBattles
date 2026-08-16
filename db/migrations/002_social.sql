BEGIN;

-- =========================================================
-- 1) User profiles (wallet address -> display name + avatar)
-- =========================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  chain_id      INTEGER NOT NULL,
  address       TEXT NOT NULL,               -- wallet address (store lowercase)
  display_name  TEXT,                        -- optional
  avatar_url    TEXT,                        -- optional (URL)
  bio           TEXT,                        -- optional

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, address)
  -- Do not CHECK address = lower(address). Solana pubkeys are case-sensitive base58.
);

-- Optional: enforce unique display names per chain (case-insensitive) when provided
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_profiles_display_name_ci
  ON user_profiles (chain_id, lower(display_name))
  WHERE display_name IS NOT NULL AND length(trim(display_name)) > 0;

CREATE INDEX IF NOT EXISTS idx_user_profiles_chain
  ON user_profiles (chain_id);


-- =========================================================
-- 2) Campaign registry (campaign -> creator), needed for:
--    "comments on my campaigns show in my profile replies"
-- =========================================================
CREATE TABLE IF NOT EXISTS campaigns (
  chain_id         INTEGER NOT NULL,
  campaign_address TEXT NOT NULL,            -- LaunchCampaign address (lowercase)
  token_address    TEXT,                     -- token address (optional/known later)
  creator_address  TEXT NOT NULL,            -- wallet that created it (lowercase)

  name             TEXT,
  symbol           TEXT,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, campaign_address),
  CONSTRAINT campaigns_campaign_lowercase CHECK (campaign_address = lower(campaign_address)),
  CONSTRAINT campaigns_creator_lowercase  CHECK (creator_address = lower(creator_address)),
  CONSTRAINT campaigns_token_lowercase    CHECK (token_address IS NULL OR token_address = lower(token_address))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_creator
  ON campaigns (chain_id, creator_address);

CREATE INDEX IF NOT EXISTS idx_campaigns_token
  ON campaigns (chain_id, token_address);


-- =========================================================
-- 3) Auth nonces (for SIWE-like "sign this nonce" auth)
--    One active nonce per (chain_id, address).
-- =========================================================
CREATE TABLE IF NOT EXISTS auth_nonces (
  chain_id     INTEGER NOT NULL,
  address      TEXT NOT NULL,                -- lowercase
  nonce        TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,

  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, address),
  CONSTRAINT auth_nonces_address_lowercase CHECK (address = lower(address))
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires
  ON auth_nonces (expires_at);


-- =========================================================
-- 4) Token comments (per campaign; optional token address)
-- =========================================================
CREATE TABLE IF NOT EXISTS token_comments (
  id              BIGSERIAL PRIMARY KEY,

  chain_id         INTEGER NOT NULL,
  campaign_address TEXT NOT NULL,            -- lowercase
  token_address    TEXT,                     -- lowercase (optional)

  author_address   TEXT NOT NULL,            -- lowercase
  body             TEXT NOT NULL,

  parent_id        BIGINT,                   -- for replies (optional)
  status           SMALLINT NOT NULL DEFAULT 0,  -- 0=active, 1=hidden, 2=deleted

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT token_comments_campaign_lowercase CHECK (campaign_address = lower(campaign_address)),
  CONSTRAINT token_comments_author_lowercase   CHECK (author_address = lower(author_address)),
  CONSTRAINT token_comments_token_lowercase    CHECK (token_address IS NULL OR token_address = lower(token_address)),
  CONSTRAINT token_comments_status_valid       CHECK (status IN (0,1,2)),
  CONSTRAINT token_comments_parent_fk          FOREIGN KEY (parent_id)
    REFERENCES token_comments(id) ON DELETE CASCADE
);

-- Feed-style queries: newest comments per campaign
CREATE INDEX IF NOT EXISTS idx_token_comments_campaign_time
  ON token_comments (chain_id, campaign_address, created_at DESC);

-- Profile/recent activity: newest comments by author
CREATE INDEX IF NOT EXISTS idx_token_comments_author_time
  ON token_comments (chain_id, author_address, created_at DESC);

-- Optional query: filter by token if you render comments post-graduation by token
CREATE INDEX IF NOT EXISTS idx_token_comments_token_time
  ON token_comments (chain_id, token_address, created_at DESC)
  WHERE token_address IS NOT NULL;

COMMIT;
