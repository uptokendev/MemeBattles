BEGIN;

CREATE TABLE IF NOT EXISTS public.recruiter_admin_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recruiter_id BIGINT NULL REFERENCES public.recruiters(id) ON DELETE SET NULL,
  wallet_address TEXT NULL,
  action_type TEXT NOT NULL,
  acted_by TEXT NULL,
  reason TEXT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recruiter_admin_actions_wallet_lowercase CHECK (
    wallet_address IS NULL OR wallet_address = lower(wallet_address)
  ),
  CONSTRAINT recruiter_admin_actions_type_chk CHECK (
    action_type IN (
      'recruiter_upsert',
      'og_tag_update',
      'status_change',
      'dispute_override',
      'settlement_export'
    )
  )
);

CREATE INDEX IF NOT EXISTS recruiter_admin_actions_recruiter_idx
  ON public.recruiter_admin_actions (recruiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_admin_actions_wallet_idx
  ON public.recruiter_admin_actions (wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_admin_actions_type_idx
  ON public.recruiter_admin_actions (action_type, created_at DESC);

CREATE OR REPLACE VIEW public.recruiter_claimable_settlements AS
WITH claimable_entries AS (
  SELECT
    l.epoch_id,
    e.chain_id,
    e.epoch_type,
    e.start_at,
    e.end_at,
    l.wallet_address,
    count(*)::bigint AS claimable_entry_count,
    coalesce(sum(l.net_amount), 0)::numeric(78,0) AS claimable_amount,
    min(l.claimable_at) AS first_claimable_at,
    max(l.claim_deadline_at) AS claim_deadline_at,
    array_agg(l.id ORDER BY l.id) AS ledger_entry_ids
  FROM public.reward_ledger_entries l
  JOIN public.epochs e ON e.id = l.epoch_id
  WHERE l.program = 'recruiter'
    AND l.status = 'claimable'
  GROUP BY
    l.epoch_id,
    e.chain_id,
    e.epoch_type,
    e.start_at,
    e.end_at,
    l.wallet_address
)
SELECT
  ce.epoch_id,
  ce.chain_id,
  ce.epoch_type,
  ce.start_at,
  ce.end_at,
  r.id AS recruiter_id,
  r.wallet_address AS recruiter_wallet_address,
  r.code AS recruiter_code,
  r.display_name AS recruiter_display_name,
  r.is_og AS recruiter_is_og,
  r.status AS recruiter_status,
  r.closed_at AS recruiter_closed_at,
  ce.wallet_address,
  ce.claimable_entry_count,
  ce.claimable_amount,
  ce.first_claimable_at,
  ce.claim_deadline_at,
  ce.ledger_entry_ids,
  now() AS materialized_at
FROM claimable_entries ce
LEFT JOIN public.recruiters r
  ON r.wallet_address = ce.wallet_address;

COMMIT;
