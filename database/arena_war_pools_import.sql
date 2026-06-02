-- MemeBattles Arena War Pool database import
-- Run in Supabase SQL Editor or psql against the MemeBattles Postgres database.
-- This makes War Pool support entries and settlement state durable.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.arena_war_pools (
  battle_id text PRIMARY KEY,
  state text NOT NULL DEFAULT 'open',
  cutoff_at timestamptz NOT NULL DEFAULT (NOW() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT arena_war_pools_state_check CHECK (state IN ('open', 'locked', 'settling', 'paid'))
);

DROP TRIGGER IF EXISTS set_arena_war_pools_updated_at ON public.arena_war_pools;
CREATE TRIGGER set_arena_war_pools_updated_at
BEFORE UPDATE ON public.arena_war_pools
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.arena_war_pool_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id text NOT NULL REFERENCES public.arena_war_pools(battle_id) ON DELETE CASCADE,
  side_token_id text NOT NULL,
  amount_usd numeric NOT NULL,
  supporter_address text,
  entered_at timestamptz NOT NULL DEFAULT NOW(),
  payout_eligible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT arena_war_pool_entries_amount_check CHECK (amount_usd > 0),
  CONSTRAINT arena_war_pool_entries_side_length CHECK (char_length(side_token_id) <= 160),
  CONSTRAINT arena_war_pool_entries_supporter_length CHECK (supporter_address IS NULL OR char_length(supporter_address) <= 160)
);

DROP TRIGGER IF EXISTS set_arena_war_pool_entries_updated_at ON public.arena_war_pool_entries;
CREATE TRIGGER set_arena_war_pool_entries_updated_at
BEFORE UPDATE ON public.arena_war_pool_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS arena_war_pools_state_idx
  ON public.arena_war_pools (state, updated_at DESC);

CREATE INDEX IF NOT EXISTS arena_war_pool_entries_battle_idx
  ON public.arena_war_pool_entries (battle_id, entered_at ASC);

CREATE INDEX IF NOT EXISTS arena_war_pool_entries_side_idx
  ON public.arena_war_pool_entries (battle_id, side_token_id);

CREATE INDEX IF NOT EXISTS arena_war_pool_entries_supporter_idx
  ON public.arena_war_pool_entries (supporter_address, entered_at DESC);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.arena_war_pools TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.arena_war_pool_entries TO anon, authenticated;

-- Keep RLS disabled for the current build path. Later we should move War Pool
-- writes behind authenticated/server-side endpoints and enable policies.
ALTER TABLE public.arena_war_pools DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_war_pool_entries DISABLE ROW LEVEL SECURITY;

COMMIT;
