BEGIN;

CREATE TABLE IF NOT EXISTS public.airdrop_draws (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  epoch_id BIGINT NOT NULL REFERENCES public.epochs(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL,
  program TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  seed TEXT NOT NULL,
  pool_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  eligible_candidate_count INTEGER NOT NULL DEFAULT 0,
  winner_count INTEGER NOT NULL DEFAULT 0,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  audit_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT airdrop_draws_program_chk CHECK (program IN ('airdrop_trader', 'airdrop_creator')),
  CONSTRAINT airdrop_draws_status_chk CHECK (status IN ('draft', 'published', 'superseded', 'cancelled')),
  CONSTRAINT airdrop_draws_pool_amount_chk CHECK (pool_amount >= 0),
  CONSTRAINT airdrop_draws_candidate_counts_chk CHECK (
    candidate_count >= 0
    AND eligible_candidate_count >= 0
    AND eligible_candidate_count <= candidate_count
    AND winner_count >= 0
    AND winner_count <= eligible_candidate_count
  )
);

CREATE INDEX IF NOT EXISTS airdrop_draws_epoch_program_idx
  ON public.airdrop_draws (epoch_id, program, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS airdrop_draws_epoch_program_published_uidx
  ON public.airdrop_draws (epoch_id, program)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.airdrop_winners (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draw_id BIGINT NOT NULL REFERENCES public.airdrop_draws(id) ON DELETE CASCADE,
  epoch_id BIGINT NOT NULL REFERENCES public.epochs(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL,
  program TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  winner_rank INTEGER NOT NULL,
  weight_tier INTEGER NOT NULL DEFAULT 1,
  weight_value INTEGER NOT NULL DEFAULT 1,
  activity_score NUMERIC(78,0) NOT NULL DEFAULT 0,
  payout_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT airdrop_winners_program_chk CHECK (program IN ('airdrop_trader', 'airdrop_creator')),
  CONSTRAINT airdrop_winners_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT airdrop_winners_rank_chk CHECK (winner_rank > 0),
  CONSTRAINT airdrop_winners_weights_chk CHECK (weight_tier > 0 AND weight_value > 0),
  CONSTRAINT airdrop_winners_amounts_chk CHECK (activity_score >= 0 AND payout_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS airdrop_winners_draw_rank_uidx
  ON public.airdrop_winners (draw_id, winner_rank);

CREATE UNIQUE INDEX IF NOT EXISTS airdrop_winners_draw_wallet_uidx
  ON public.airdrop_winners (draw_id, wallet_address);

CREATE INDEX IF NOT EXISTS airdrop_winners_epoch_program_idx
  ON public.airdrop_winners (epoch_id, program, winner_rank, wallet_address);

CREATE TABLE IF NOT EXISTS public.reward_pool_carryovers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_epoch_id BIGINT NOT NULL REFERENCES public.epochs(id) ON DELETE CASCADE,
  target_epoch_id BIGINT NOT NULL REFERENCES public.epochs(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL,
  program TEXT NOT NULL,
  source_ledger_entry_id BIGINT NULL REFERENCES public.reward_ledger_entries(id) ON DELETE SET NULL,
  amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_pool_carryovers_program_chk CHECK (program IN ('squad')),
  CONSTRAINT reward_pool_carryovers_amount_chk CHECK (amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_pool_carryovers_epoch_reason_uidx
  ON public.reward_pool_carryovers (source_epoch_id, target_epoch_id, program, reason)
  WHERE source_ledger_entry_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reward_pool_carryovers_ledger_reason_uidx
  ON public.reward_pool_carryovers (source_ledger_entry_id, reason)
  WHERE source_ledger_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reward_pool_carryovers_target_program_idx
  ON public.reward_pool_carryovers (target_epoch_id, program, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reward_publication_states (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL DEFAULT 'default',
  is_published BOOLEAN NOT NULL DEFAULT true,
  changed_by TEXT NULL,
  reason TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ NULL,
  unpublished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_publication_states_type_chk CHECK (
    resource_type IN ('airdrop_winners', 'recruiter_leaderboard', 'squad_leaderboard')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_publication_states_resource_uidx
  ON public.reward_publication_states (resource_type, resource_key);

CREATE TABLE IF NOT EXISTS public.reward_admin_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL DEFAULT '',
  acted_by TEXT NULL,
  reason TEXT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_admin_actions_type_chk CHECK (
    action_type IN (
      'draw_run',
      'draw_publish',
      'publication_change',
      'exclusion_create',
      'exclusion_resolve'
    )
  ),
  CONSTRAINT reward_admin_actions_resource_type_chk CHECK (
    resource_type IN (
      'airdrop_draw',
      'airdrop_winners',
      'recruiter_leaderboard',
      'squad_leaderboard',
      'exclusion_flag'
    )
  )
);

CREATE INDEX IF NOT EXISTS reward_admin_actions_created_idx
  ON public.reward_admin_actions (created_at DESC);

CREATE INDEX IF NOT EXISTS reward_admin_actions_resource_idx
  ON public.reward_admin_actions (resource_type, resource_key, created_at DESC);

CREATE OR REPLACE VIEW public.airdrop_winner_history AS
SELECT
  w.id,
  w.draw_id,
  w.epoch_id,
  d.chain_id,
  d.status AS draw_status,
  d.published_at,
  e.epoch_type,
  e.start_at,
  e.end_at,
  w.program,
  w.wallet_address,
  w.winner_rank,
  w.weight_tier,
  w.weight_value,
  w.activity_score,
  w.payout_amount,
  c.id AS claim_id,
  c.claimed_amount,
  c.claim_tx_hash,
  c.claimed_at,
  c.status AS claim_status,
  l.id AS ledger_entry_id,
  l.status AS ledger_status,
  l.claimable_at,
  l.claim_deadline_at,
  l.expired_at,
  w.metadata_json,
  w.created_at,
  w.updated_at
FROM public.airdrop_winners w
JOIN public.airdrop_draws d ON d.id = w.draw_id
JOIN public.epochs e ON e.id = w.epoch_id
LEFT JOIN public.claims c
  ON c.wallet_address = w.wallet_address
 AND c.epoch_id = w.epoch_id
 AND c.program = w.program
 AND c.status = 'recorded'
LEFT JOIN public.reward_ledger_entries l
  ON l.wallet_address = w.wallet_address
 AND l.epoch_id = w.epoch_id
 AND l.program = w.program;

COMMIT;
