-- db/migrations/20260704_000003_solana_launchpad_ops.sql
--
-- Operator-facing audit trail for Solana launchpad actions. The server records
-- pause/unpause and safety operations as intents/status changes; wallet or vault
-- executors can attach transaction signatures once on-chain execution occurs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.solana_launchpad_admin_actions (
  id              BIGSERIAL PRIMARY KEY,
  chain_id        INTEGER NOT NULL DEFAULT 101,
  action_type     TEXT NOT NULL,
  target_kind     TEXT NOT NULL DEFAULT 'global',
  target_address  TEXT,
  status          TEXT NOT NULL DEFAULT 'requested',
  requested_by    TEXT,
  reason          TEXT,
  tx_signature    TEXT,
  requested_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT solana_launchpad_admin_actions_chain_chk CHECK (chain_id = 101),
  CONSTRAINT solana_launchpad_admin_actions_action_chk
    CHECK (action_type IN ('global_pause', 'campaign_pause', 'payout_status', 'safety_note')),
  CONSTRAINT solana_launchpad_admin_actions_target_chk
    CHECK (target_kind IN ('global', 'campaign', 'payout_intent', 'program')),
  CONSTRAINT solana_launchpad_admin_actions_status_chk
    CHECK (status IN ('requested', 'submitted', 'confirmed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_solana_launchpad_admin_actions_status
  ON public.solana_launchpad_admin_actions (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_solana_launchpad_admin_actions_target
  ON public.solana_launchpad_admin_actions (target_kind, target_address, updated_at DESC);

COMMIT;
