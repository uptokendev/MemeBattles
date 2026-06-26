BEGIN;

UPDATE public.recruiters
SET
  is_og = (created_at < TIMESTAMPTZ '2026-07-05 00:00:00+02'),
  updated_at = now();

COMMIT;
