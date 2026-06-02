-- MemeBattles Arena Events database import
-- Run in Supabase SQL Editor or psql against the MemeBattles Postgres database.
-- This makes event transitions and tournament bracket stage changes durable.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.arena_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  participant_count integer NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  bracket_stage text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT arena_events_type_check CHECK (
    type IN ('battle_weekend', 'battle_night', 'featured_rivalry', 'tournament', 'seasonal_league')
  ),
  CONSTRAINT arena_events_status_check CHECK (
    status IN ('scheduled', 'deploying', 'live', 'completed')
  ),
  CONSTRAINT arena_events_bracket_stage_check CHECK (
    bracket_stage IS NULL OR bracket_stage IN ('registration', 'quarterfinals', 'semifinals', 'finals', 'completed')
  ),
  CONSTRAINT arena_events_participant_count_check CHECK (participant_count >= 0),
  CONSTRAINT arena_events_window_check CHECK (ends_at >= starts_at),
  CONSTRAINT arena_events_title_length CHECK (char_length(title) <= 160),
  CONSTRAINT arena_events_summary_length CHECK (char_length(summary) <= 1000)
);

DROP TRIGGER IF EXISTS set_arena_events_updated_at ON public.arena_events;
CREATE TRIGGER set_arena_events_updated_at
BEFORE UPDATE ON public.arena_events
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS arena_events_status_starts_idx
  ON public.arena_events (status, starts_at ASC);

CREATE INDEX IF NOT EXISTS arena_events_type_status_idx
  ON public.arena_events (type, status, starts_at ASC);

CREATE INDEX IF NOT EXISTS arena_events_completed_idx
  ON public.arena_events (completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- Seed default Arena events. Safe to rerun.
INSERT INTO public.arena_events (
  id,
  type,
  title,
  status,
  starts_at,
  ends_at,
  participant_count,
  summary,
  bracket_stage
) VALUES
  (
    'event-battle-night-01',
    'battle_night',
    'Battle Night: Founder Grudge Match',
    'scheduled',
    '2026-05-21T03:00:00.000Z',
    '2026-05-21T05:20:00.000Z',
    12,
    'Twelve graduated tokens enter a timed rotation bracket with boosted arena placement.',
    NULL
  ),
  (
    'event-weekend-02',
    'battle_weekend',
    'Weekend Siege',
    'live',
    '2026-05-20T23:00:00.000Z',
    '2026-05-21T12:00:00.000Z',
    24,
    'Open deployment weekend with pooled scoring, featured rivalries, and live lane coverage.',
    NULL
  ),
  (
    'event-tournament-03',
    'tournament',
    'Rookie Crown Qualifier',
    'scheduled',
    '2026-05-22T00:00:00.000Z',
    '2026-05-22T06:00:00.000Z',
    16,
    'Single-elimination tournament seeded from battle activity and holder growth.',
    'registration'
  )
ON CONFLICT (id) DO NOTHING;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.arena_events TO anon, authenticated;

-- Keep RLS disabled for the current build path. Later we should move event admin
-- transitions behind authenticated/admin endpoints and enable policies.
ALTER TABLE public.arena_events DISABLE ROW LEVEL SECURITY;

COMMIT;
