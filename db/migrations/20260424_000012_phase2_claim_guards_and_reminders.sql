BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS claims_wallet_epoch_program_recorded_uidx
  ON public.claims (wallet_address, epoch_id, program)
  WHERE status = 'recorded';

CREATE TABLE IF NOT EXISTS public.claim_reminder_states (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  reminder_kind TEXT NOT NULL,
  basis_at TIMESTAMPTZ NOT NULL,
  first_claimable_at TIMESTAMPTZ NOT NULL,
  last_claimed_at TIMESTAMPTZ NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  target_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT claim_reminder_states_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT claim_reminder_states_kind_chk CHECK (reminder_kind IN ('claim_inactive_30d', 'claim_inactive_60d')),
  CONSTRAINT claim_reminder_states_status_chk CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  CONSTRAINT claim_reminder_states_attempt_count_chk CHECK (attempt_count >= 0),
  CONSTRAINT claim_reminder_states_due_bounds_chk CHECK (due_at >= basis_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS claim_reminder_states_wallet_kind_basis_uidx
  ON public.claim_reminder_states (wallet_address, reminder_kind, basis_at);

CREATE INDEX IF NOT EXISTS claim_reminder_states_status_due_idx
  ON public.claim_reminder_states (status, due_at, next_attempt_at, id);

CREATE INDEX IF NOT EXISTS claim_reminder_states_wallet_idx
  ON public.claim_reminder_states (wallet_address, created_at DESC);

CREATE TABLE IF NOT EXISTS public.claim_reminder_deliveries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reminder_state_id BIGINT NOT NULL REFERENCES public.claim_reminder_states(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  reminder_kind TEXT NOT NULL,
  delivery_channel TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL,
  response_status INTEGER NULL,
  response_body TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT claim_reminder_deliveries_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT claim_reminder_deliveries_kind_chk CHECK (reminder_kind IN ('claim_inactive_30d', 'claim_inactive_60d')),
  CONSTRAINT claim_reminder_deliveries_channel_chk CHECK (delivery_channel IN ('outbox', 'webhook')),
  CONSTRAINT claim_reminder_deliveries_status_chk CHECK (status IN ('sent', 'failed')),
  CONSTRAINT claim_reminder_deliveries_attempt_chk CHECK (attempt_number > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS claim_reminder_deliveries_state_attempt_uidx
  ON public.claim_reminder_deliveries (reminder_state_id, attempt_number);

CREATE INDEX IF NOT EXISTS claim_reminder_deliveries_wallet_idx
  ON public.claim_reminder_deliveries (wallet_address, attempted_at DESC);

CREATE OR REPLACE VIEW public.claim_reminder_candidates AS
WITH unclaimed_entries AS (
  SELECT
    l.id AS ledger_entry_id,
    l.wallet_address,
    l.epoch_id,
    l.program,
    l.status,
    l.claimable_at,
    l.claim_deadline_at,
    l.net_amount
  FROM public.reward_ledger_entries l
  WHERE l.status IN ('claimable', 'expired', 'rolled_over')
    AND NOT EXISTS (
      SELECT 1
      FROM public.claims c
      WHERE c.wallet_address = l.wallet_address
        AND c.epoch_id = l.epoch_id
        AND c.program = l.program
        AND c.status = 'recorded'
    )
), outstanding_wallets AS (
  SELECT
    wallet_address,
    min(claimable_at) FILTER (WHERE claimable_at IS NOT NULL) AS first_claimable_at,
    max(claimable_at) FILTER (WHERE claimable_at IS NOT NULL) AS last_claimable_at,
    count(*)::bigint AS outstanding_entry_count,
    coalesce(sum(net_amount), 0)::numeric(78,0) AS outstanding_amount,
    jsonb_agg(
      jsonb_build_object(
        'ledgerEntryId', ledger_entry_id,
        'epochId', epoch_id,
        'program', program,
        'status', status,
        'claimableAt', claimable_at,
        'claimDeadlineAt', claim_deadline_at,
        'netAmount', net_amount
      )
      ORDER BY claimable_at NULLS FIRST, ledger_entry_id ASC
    ) AS outstanding_entries
  FROM unclaimed_entries
  GROUP BY wallet_address
), claim_activity AS (
  SELECT
    wallet_address,
    max(claimed_at) FILTER (WHERE status = 'recorded') AS last_claimed_at
  FROM public.claims
  GROUP BY wallet_address
)
SELECT
  ow.wallet_address,
  ow.first_claimable_at,
  ow.last_claimable_at,
  ca.last_claimed_at,
  greatest(coalesce(ca.last_claimed_at, ow.first_claimable_at), ow.first_claimable_at) AS basis_at,
  ow.outstanding_entry_count,
  ow.outstanding_amount,
  ow.outstanding_entries,
  now() AS materialized_at
FROM outstanding_wallets ow
LEFT JOIN claim_activity ca
  ON ca.wallet_address = ow.wallet_address
WHERE ow.first_claimable_at IS NOT NULL;

COMMIT;
