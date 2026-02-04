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