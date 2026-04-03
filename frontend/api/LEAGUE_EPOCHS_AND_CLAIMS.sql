-- League epochs (finalized snapshots) + claims
-- Safe to run multiple times.

-- Stores finalized prize meta per epoch (week/month)
CREATE TABLE IF NOT EXISTS public.league_epoch_meta (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period IN ('weekly','monthly')),
  epoch_start timestamptz NOT NULL,
  epoch_end timestamptz NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),

  protocol_fee_bps integer NOT NULL,
  league_fee_bps integer NOT NULL,
  total_league_fee_raw numeric(78,0) NOT NULL,
  league_count integer NOT NULL,
  winners integer NOT NULL,
  split_bps integer[] NOT NULL,

  PRIMARY KEY (chain_id, period, epoch_start)
);

-- Stores finalized winners per league/category for a finalized epoch.
-- payload holds the exact row the UI needs to render (campaign metadata + metric fields).
CREATE TABLE IF NOT EXISTS public.league_epoch_winners (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period IN ('weekly','monthly')),
  epoch_start timestamptz NOT NULL,
  epoch_end timestamptz NOT NULL,
  category text NOT NULL,
  rank integer NOT NULL CHECK (rank BETWEEN 1 AND 5),

  recipient_address text NOT NULL,     -- creator for campaign leagues, wallet for top_earner
  amount_raw numeric(78,0) NOT NULL,   -- payout for this rank
  payload jsonb NOT NULL,              -- UI row

  computed_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, period, epoch_start, category, rank)
);

CREATE INDEX IF NOT EXISTS league_epoch_winners_recipient_idx
  ON public.league_epoch_winners(chain_id, recipient_address, period, epoch_start DESC);

-- Claim records to prevent double-claim
CREATE TABLE IF NOT EXISTS public.league_epoch_claims (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period IN ('weekly','monthly')),
  epoch_start timestamptz NOT NULL,
  category text NOT NULL,
  rank integer NOT NULL CHECK (rank BETWEEN 1 AND 5),

  recipient_address text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  signature text,

  PRIMARY KEY (chain_id, period, epoch_start, category, rank)
);


-- Bring older/newer deployments into the same shape.
-- Some code paths read `meta`, while earlier migrations wrote the UI row into `payload`.
ALTER TABLE public.league_epoch_winners
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS meta jsonb,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS computed_at timestamptz;

UPDATE public.league_epoch_winners
   SET meta = COALESCE(meta, payload, '{}'::jsonb)
 WHERE meta IS NULL;

UPDATE public.league_epoch_winners
   SET payload = COALESCE(payload, meta, '{}'::jsonb)
 WHERE payload IS NULL;

-- Optional but useful for claims/history UI
CREATE TABLE IF NOT EXISTS public.league_epoch_payouts (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period IN ('weekly','monthly')),
  epoch_start timestamptz NOT NULL,
  category text NOT NULL,
  rank integer NOT NULL CHECK (rank BETWEEN 1 AND 5),
  recipient_address text NOT NULL,
  amount_raw numeric(78,0) NOT NULL,
  tx_hash text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, period, epoch_start, category, rank)
);

CREATE INDEX IF NOT EXISTS league_epoch_payouts_recipient_idx
  ON public.league_epoch_payouts(chain_id, recipient_address, period, epoch_start DESC);

CREATE TABLE IF NOT EXISTS public.league_rollovers (
  id bigserial PRIMARY KEY,
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period IN ('weekly','monthly')),
  epoch_start timestamptz NOT NULL,
  category text NOT NULL,
  amount_raw numeric(78,0) NOT NULL,
  source text,
  source_epoch_start timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_rollovers_epoch_idx
  ON public.league_rollovers(chain_id, period, epoch_start DESC, category);
