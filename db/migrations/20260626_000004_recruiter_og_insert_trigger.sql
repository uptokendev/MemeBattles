BEGIN;

CREATE OR REPLACE FUNCTION public.set_recruiter_og_cutoff()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_og := (COALESCE(NEW.created_at, now()) < TIMESTAMPTZ '2026-07-05 00:00:00+02');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recruiters_set_og_cutoff_before_insert ON public.recruiters;
CREATE TRIGGER recruiters_set_og_cutoff_before_insert
BEFORE INSERT ON public.recruiters
FOR EACH ROW
EXECUTE FUNCTION public.set_recruiter_og_cutoff();

COMMIT;
