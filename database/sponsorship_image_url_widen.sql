-- Raise sponsorship creative image_url length limits.
-- Supabase public URLs (and some CDN paths) can exceed 500 chars.
-- Run in Supabase SQL editor. Safe to re-run.

BEGIN;

ALTER TABLE public.sponsorship_applications
  DROP CONSTRAINT IF EXISTS sponsorship_applications_image_url_length;

ALTER TABLE public.sponsorship_applications
  ADD CONSTRAINT sponsorship_applications_image_url_length
  CHECK (image_url IS NULL OR char_length(image_url) <= 2000);

ALTER TABLE public.sponsored_placements
  DROP CONSTRAINT IF EXISTS sponsored_placements_image_url_length;

ALTER TABLE public.sponsored_placements
  ADD CONSTRAINT sponsored_placements_image_url_length
  CHECK (image_url IS NULL OR char_length(image_url) <= 2000);

COMMIT;
