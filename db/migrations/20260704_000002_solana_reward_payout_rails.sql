-- db/migrations/20260704_000002_solana_reward_payout_rails.sql
--
-- Adds the lightweight persistence layer for Solana native reward payout rails:
-- wallet ownership verification challenges and payout intent lifecycle tracking.

BEGIN;

CREATE TABLE IF NOT EXISTS public.solana_wallet_verifications (
  wallet_address    TEXT PRIMARY KEY,
  nonce             TEXT NOT NULL,
  message           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  signature         TEXT,
  nonce_expires_at  TIMESTAMPTZ NOT NULL,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT solana_wallet_verifications_status_chk
    CHECK (status IN ('pending', 'verified', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_solana_wallet_verifications_status
  ON public.solana_wallet_verifications (status, nonce_expires_at DESC);

CREATE TABLE IF NOT EXISTS public.solana_reward_payout_intents (
  id                BIGSERIAL PRIMARY KEY,
  chain_id          INTEGER NOT NULL DEFAULT 101,
  wallet_address    TEXT NOT NULL,
  epoch_id          BIGINT NOT NULL,
  program           TEXT NOT NULL,
  amount_lamports   NUMERIC(78, 0) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued',
  payout_signature  TEXT,
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  error_message     TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT solana_reward_payout_intents_chain_chk CHECK (chain_id = 101),
  CONSTRAINT solana_reward_payout_intents_status_chk
    CHECK (status IN ('queued', 'submitted', 'confirmed', 'failed', 'cancelled')),
  CONSTRAINT solana_reward_payout_intents_program_chk
    CHECK (program IN ('recruiter', 'airdrop_trader', 'airdrop_creator', 'squad')),
  CONSTRAINT solana_reward_payout_intents_unique_claim
    UNIQUE (chain_id, wallet_address, epoch_id, program)
);

CREATE INDEX IF NOT EXISTS idx_solana_reward_payout_intents_status
  ON public.solana_reward_payout_intents (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_solana_reward_payout_intents_wallet
  ON public.solana_reward_payout_intents (wallet_address, epoch_id DESC);

COMMIT;
