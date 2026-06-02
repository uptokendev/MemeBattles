-- MemeBattles Arena battle queue database import
-- Run in Supabase SQL Editor or psql against the MemeBattles Postgres database.
-- This makes Command Center battle opt-in durable instead of process-memory only.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.arena_battles (
  id text PRIMARY KEY,
  chain_id integer NOT NULL DEFAULT 97,
  state text NOT NULL DEFAULT 'open_for_battle',
  format text NOT NULL DEFAULT 'duel',
  primary_campaign_address text,
  primary_token_address text,
  creator_address text,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  ends_at timestamptz,
  settlement_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  arena_lane text NOT NULL DEFAULT 'open_for_battle',
  score_basis text NOT NULL DEFAULT 'market_cap',
  leader_side text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT arena_battles_state_check CHECK (
    state IN ('draft', 'open_for_battle', 'pending', 'accepted', 'live', 'completed', 'settled', 'cancelled')
  ),
  CONSTRAINT arena_battles_format_check CHECK (
    format IN ('duel', 'rumble', 'event_match')
  ),
  CONSTRAINT arena_battles_lane_check CHECK (
    arena_lane IN ('live_battles', 'open_for_battle', 'events_and_leagues')
  ),
  CONSTRAINT arena_battles_leader_side_check CHECK (
    leader_side IS NULL OR leader_side IN ('left', 'right', 'tied')
  ),
  CONSTRAINT arena_battles_participants_array_check CHECK (jsonb_typeof(participants) = 'array'),
  CONSTRAINT arena_battles_window_check CHECK (
    started_at IS NULL OR ends_at IS NULL OR ends_at >= started_at
  )
);

DROP TRIGGER IF EXISTS set_arena_battles_updated_at ON public.arena_battles;
CREATE TRIGGER set_arena_battles_updated_at
BEFORE UPDATE ON public.arena_battles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS arena_battles_feed_idx
  ON public.arena_battles (state, chain_id, updated_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS arena_battles_creator_idx
  ON public.arena_battles (creator_address, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS arena_battles_primary_campaign_idx
  ON public.arena_battles (primary_campaign_address, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS arena_battles_primary_token_idx
  ON public.arena_battles (primary_token_address, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS arena_battles_participants_gin_idx
  ON public.arena_battles USING gin (participants);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.arena_battles TO anon, authenticated;

-- Keep RLS disabled for the current build path. Later we should move Command Center
-- battle writes behind an admin/authenticated server endpoint and enable policies.
ALTER TABLE public.arena_battles DISABLE ROW LEVEL SECURITY;

COMMIT;
