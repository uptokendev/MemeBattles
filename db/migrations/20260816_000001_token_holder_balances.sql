-- ERC-20 holder census for bonding tokens.
-- Balances are replayed from Transfer logs starting at campaigns.created_block.

BEGIN;

CREATE TABLE IF NOT EXISTS public.token_holder_balances (
  chain_id       INTEGER NOT NULL,
  token_address  TEXT NOT NULL,
  wallet         TEXT NOT NULL,
  balance_raw    NUMERIC(78, 0) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_address, wallet)
);

CREATE INDEX IF NOT EXISTS token_holder_balances_positive_idx
  ON public.token_holder_balances (chain_id, token_address, balance_raw DESC)
  WHERE balance_raw > 0;

CREATE TABLE IF NOT EXISTS public.token_holder_sync (
  chain_id           INTEGER NOT NULL,
  token_address      TEXT NOT NULL,
  campaign_address   TEXT NOT NULL,
  last_block         BIGINT NOT NULL DEFAULT 0,
  saw_mint           BOOLEAN NOT NULL DEFAULT false,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_address)
);

COMMIT;
