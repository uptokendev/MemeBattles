BEGIN;

CREATE TABLE IF NOT EXISTS public.eligibility_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  epoch_id BIGINT NOT NULL REFERENCES public.epochs(id) ON DELETE RESTRICT,
  wallet_address TEXT NOT NULL,
  program TEXT NOT NULL,
  is_eligible BOOLEAN NOT NULL,
  score NUMERIC(78,0) NOT NULL DEFAULT 0,
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT eligibility_results_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT eligibility_results_program_chk CHECK (program IN ('recruiter', 'airdrop_trader', 'airdrop_creator', 'squad')),
  CONSTRAINT eligibility_results_score_chk CHECK (score >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS eligibility_results_epoch_wallet_program_uidx
  ON public.eligibility_results (epoch_id, wallet_address, program);

CREATE INDEX IF NOT EXISTS eligibility_results_wallet_idx
  ON public.eligibility_results (wallet_address, program, computed_at DESC);

CREATE INDEX IF NOT EXISTS eligibility_results_epoch_eligibility_idx
  ON public.eligibility_results (epoch_id, program, is_eligible, score DESC, wallet_address);

CREATE TABLE IF NOT EXISTS public.exclusion_flags (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  epoch_id BIGINT NULL REFERENCES public.epochs(id) ON DELETE RESTRICT,
  program TEXT NULL,
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL,
  resolved_by TEXT NULL,
  resolution_note TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exclusion_flags_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT exclusion_flags_program_chk CHECK (program IS NULL OR program IN ('recruiter', 'airdrop_trader', 'airdrop_creator', 'squad')),
  CONSTRAINT exclusion_flags_severity_chk CHECK (severity IN ('hard', 'review')),
  CONSTRAINT exclusion_flags_resolved_by_lowercase CHECK (resolved_by IS NULL OR resolved_by = lower(resolved_by))
);

CREATE INDEX IF NOT EXISTS exclusion_flags_wallet_idx
  ON public.exclusion_flags (wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS exclusion_flags_open_idx
  ON public.exclusion_flags (severity, epoch_id, program, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS exclusion_flags_flag_type_idx
  ON public.exclusion_flags (flag_type, severity, created_at DESC);

CREATE OR REPLACE VIEW public.wallet_latest_eligibility_results AS
WITH ranked AS (
  SELECT
    er.*,
    e.chain_id,
    e.epoch_type,
    e.start_at,
    e.end_at,
    row_number() OVER (
      PARTITION BY er.wallet_address, er.program
      ORDER BY e.end_at DESC, er.computed_at DESC, er.id DESC
    ) AS rn
  FROM public.eligibility_results er
  JOIN public.epochs e ON e.id = er.epoch_id
)
SELECT
  id,
  epoch_id,
  chain_id,
  epoch_type,
  start_at,
  end_at,
  wallet_address,
  program,
  is_eligible,
  score,
  reason_codes,
  metadata,
  computed_at,
  created_at,
  updated_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW public.reward_exclusion_open_flags AS
SELECT
  f.id,
  f.wallet_address,
  f.epoch_id,
  f.program,
  f.flag_type,
  f.severity,
  f.details_json,
  f.created_at,
  f.metadata,
  e.chain_id,
  e.epoch_type,
  e.start_at,
  e.end_at
FROM public.exclusion_flags f
LEFT JOIN public.epochs e ON e.id = f.epoch_id
WHERE f.resolved_at IS NULL;

COMMIT;
