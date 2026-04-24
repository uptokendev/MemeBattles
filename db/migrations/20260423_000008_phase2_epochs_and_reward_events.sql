BEGIN;

CREATE TABLE IF NOT EXISTS public.epochs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  epoch_type TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ NULL,
  CONSTRAINT epochs_type_chk CHECK (epoch_type IN ('weekly')),
  CONSTRAINT epochs_status_chk CHECK (status IN ('open', 'processing', 'finalized', 'published', 'expired')),
  CONSTRAINT epochs_bounds_chk CHECK (end_at > start_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS epochs_chain_type_start_uidx
  ON public.epochs (chain_id, epoch_type, start_at);

CREATE INDEX IF NOT EXISTS epochs_chain_type_status_idx
  ON public.epochs (chain_id, epoch_type, status, start_at DESC);

CREATE INDEX IF NOT EXISTS epochs_chain_time_idx
  ON public.epochs (chain_id, start_at DESC, end_at DESC);

CREATE TABLE IF NOT EXISTS public.reward_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  epoch_id BIGINT NOT NULL REFERENCES public.epochs(id) ON DELETE RESTRICT,
  wallet_address TEXT NULL,
  campaign_address TEXT NULL,
  route_kind TEXT NOT NULL,
  route_profile TEXT NOT NULL,
  league_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  recruiter_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  airdrop_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  squad_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  protocol_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  raw_amount NUMERIC(78,0) NOT NULL,
  source_contract TEXT NOT NULL,
  source_event TEXT NOT NULL DEFAULT 'RouteExecuted',
  matched_activity_source TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_events_txhash_lowercase CHECK (tx_hash = lower(tx_hash)),
  CONSTRAINT reward_events_wallet_lowercase CHECK (wallet_address IS NULL OR wallet_address = lower(wallet_address)),
  CONSTRAINT reward_events_campaign_lowercase CHECK (campaign_address IS NULL OR campaign_address = lower(campaign_address)),
  CONSTRAINT reward_events_source_contract_lowercase CHECK (source_contract = lower(source_contract)),
  CONSTRAINT reward_events_route_kind_chk CHECK (route_kind IN ('trade', 'finalize')),
  CONSTRAINT reward_events_route_profile_chk CHECK (route_profile IN ('standard_linked', 'standard_unlinked', 'og_linked')),
  CONSTRAINT reward_events_nonnegative_chk CHECK (
    league_amount >= 0 AND recruiter_amount >= 0 AND airdrop_amount >= 0 AND squad_amount >= 0 AND protocol_amount >= 0 AND raw_amount >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_events_chain_tx_log_uidx
  ON public.reward_events (chain_id, tx_hash, log_index);

CREATE INDEX IF NOT EXISTS reward_events_epoch_idx
  ON public.reward_events (epoch_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS reward_events_wallet_idx
  ON public.reward_events (wallet_address, occurred_at DESC)
  WHERE wallet_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS reward_events_campaign_idx
  ON public.reward_events (campaign_address, occurred_at DESC)
  WHERE campaign_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS reward_events_kind_profile_idx
  ON public.reward_events (chain_id, route_kind, route_profile, occurred_at DESC);

CREATE OR REPLACE VIEW public.reward_event_epoch_summaries AS
SELECT
  e.id AS epoch_id,
  e.chain_id,
  e.epoch_type,
  e.start_at,
  e.end_at,
  e.status,
  count(r.id)::bigint AS reward_event_count,
  coalesce(sum(r.raw_amount), 0)::numeric(78,0) AS raw_amount_total,
  coalesce(sum(r.league_amount), 0)::numeric(78,0) AS league_amount_total,
  coalesce(sum(r.recruiter_amount), 0)::numeric(78,0) AS recruiter_amount_total,
  coalesce(sum(r.airdrop_amount), 0)::numeric(78,0) AS airdrop_amount_total,
  coalesce(sum(r.squad_amount), 0)::numeric(78,0) AS squad_amount_total,
  coalesce(sum(r.protocol_amount), 0)::numeric(78,0) AS protocol_amount_total,
  min(r.occurred_at) AS first_reward_event_at,
  max(r.occurred_at) AS last_reward_event_at
FROM public.epochs e
LEFT JOIN public.reward_events r
  ON r.epoch_id = e.id
GROUP BY e.id, e.chain_id, e.epoch_type, e.start_at, e.end_at, e.status;

COMMIT;
