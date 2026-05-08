BEGIN;

CREATE TABLE IF NOT EXISTS public.reward_ledger_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  epoch_id BIGINT NOT NULL REFERENCES public.epochs(id) ON DELETE RESTRICT,
  wallet_address TEXT NOT NULL,
  program TEXT NOT NULL,
  sub_program TEXT NOT NULL DEFAULT '',
  gross_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  net_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  source_reference JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimable_at TIMESTAMPTZ NULL,
  claim_deadline_at TIMESTAMPTZ NULL,
  claimed_at TIMESTAMPTZ NULL,
  expired_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_ledger_entries_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT reward_ledger_entries_program_chk CHECK (program IN ('recruiter', 'airdrop_trader', 'airdrop_creator', 'squad')),
  CONSTRAINT reward_ledger_entries_status_chk CHECK (status IN ('pending', 'claimable', 'claimed', 'expired', 'rolled_over', 'cancelled')),
  CONSTRAINT reward_ledger_entries_amounts_chk CHECK (gross_amount >= 0 AND net_amount >= 0 AND gross_amount >= net_amount)
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_ledger_entries_wallet_program_uidx
  ON public.reward_ledger_entries (epoch_id, wallet_address, program, sub_program);

CREATE INDEX IF NOT EXISTS reward_ledger_entries_epoch_status_idx
  ON public.reward_ledger_entries (epoch_id, status, program, created_at DESC);

CREATE INDEX IF NOT EXISTS reward_ledger_entries_wallet_status_idx
  ON public.reward_ledger_entries (wallet_address, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.claims (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  epoch_id BIGINT NOT NULL REFERENCES public.epochs(id) ON DELETE RESTRICT,
  program TEXT NOT NULL,
  claimed_amount NUMERIC(78,0) NOT NULL,
  claim_tx_hash TEXT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT claims_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT claims_program_chk CHECK (program IN ('recruiter', 'airdrop_trader', 'airdrop_creator', 'squad')),
  CONSTRAINT claims_status_chk CHECK (status IN ('recorded', 'cancelled')),
  CONSTRAINT claims_txhash_lowercase CHECK (claim_tx_hash IS NULL OR claim_tx_hash = lower(claim_tx_hash)),
  CONSTRAINT claims_amount_chk CHECK (claimed_amount >= 0)
);

CREATE INDEX IF NOT EXISTS claims_wallet_program_idx
  ON public.claims (wallet_address, program, claimed_at DESC);

CREATE INDEX IF NOT EXISTS claims_epoch_program_idx
  ON public.claims (epoch_id, program, claimed_at DESC);

CREATE TABLE IF NOT EXISTS public.claim_rollovers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_ledger_entry_id BIGINT NOT NULL REFERENCES public.reward_ledger_entries(id) ON DELETE RESTRICT,
  to_ledger_entry_id BIGINT NULL REFERENCES public.reward_ledger_entries(id) ON DELETE RESTRICT,
  program TEXT NOT NULL,
  amount NUMERIC(78,0) NOT NULL,
  reason TEXT NOT NULL,
  destination_kind TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT claim_rollovers_program_chk CHECK (program IN ('recruiter', 'airdrop_trader', 'airdrop_creator', 'squad')),
  CONSTRAINT claim_rollovers_amount_chk CHECK (amount >= 0),
  CONSTRAINT claim_rollovers_destination_chk CHECK (destination_kind IN ('squad_pool', 'squad_pool_same', 'airdrop_treasury', 'next_epoch_wallet_claim'))
);

CREATE UNIQUE INDEX IF NOT EXISTS claim_rollovers_from_reason_uidx
  ON public.claim_rollovers (from_ledger_entry_id, reason);

CREATE INDEX IF NOT EXISTS claim_rollovers_program_executed_idx
  ON public.claim_rollovers (program, executed_at DESC);

CREATE OR REPLACE VIEW public.reward_claimable_summaries AS
SELECT
  l.wallet_address,
  l.program,
  count(*)::bigint AS entry_count,
  coalesce(sum(l.net_amount), 0)::numeric(78,0) AS total_amount,
  min(l.claimable_at) AS first_claimable_at,
  max(l.claim_deadline_at) AS last_claim_deadline_at,
  max(e.end_at) AS latest_epoch_end_at
FROM public.reward_ledger_entries l
JOIN public.epochs e ON e.id = l.epoch_id
WHERE l.status = 'claimable'
GROUP BY l.wallet_address, l.program;

COMMIT;
