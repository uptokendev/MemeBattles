-- Fix: web-dashboard 403 "permission denied for table sponsorship_applications"
-- Run in Supabase SQL editor against the same project as VITE_SUPABASE_URL.
-- Safe to re-run (IF NOT EXISTS / re-GRANT).

BEGIN;

-- Ensure tables exist (no-op if sponsorships_import already applied).
CREATE TABLE IF NOT EXISTS public.sponsorship_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL,
  contact_name text NOT NULL,
  contact_channel text NOT NULL,
  applicant_wallet text,
  website_url text NOT NULL,
  image_url text,
  bio text NOT NULL,
  preferred_slot text NOT NULL DEFAULT 'homepage-sponsored-rail',
  preferred_start timestamptz,
  preferred_end timestamptz,
  payment_reference text,
  notes text,
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sponsored_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.sponsorship_applications(id) ON DELETE SET NULL,
  chain_id integer,
  campaign_address text,
  token_address text,
  creator_address text,
  project_name text,
  symbol text,
  image_url text,
  bio text,
  website_url text,
  target_url text,
  project_type text DEFAULT 'external',
  placement_label text,
  slot_code text DEFAULT 'homepage-sponsored-rail',
  priority integer DEFAULT 1000,
  active boolean DEFAULT false,
  payment_status text DEFAULT 'pending',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dashboard uses the Supabase JS anon key (not service role).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.sponsorship_applications TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sponsored_placements TO anon, authenticated, service_role;

-- Sequences / identity (if any uuid defaults use extensions already).
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- RLS: either disable (current admin path) or open permissive policies for anon.
ALTER TABLE public.sponsorship_applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_placements DISABLE ROW LEVEL SECURITY;

-- If RLS was forced ON by project defaults, also add permissive policies as belt-and-suspenders.
DROP POLICY IF EXISTS sponsorship_applications_anon_all ON public.sponsorship_applications;
DROP POLICY IF EXISTS sponsored_placements_anon_all ON public.sponsored_placements;

-- Only created if you re-enable RLS later:
-- CREATE POLICY sponsorship_applications_anon_all ON public.sponsorship_applications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY sponsored_placements_anon_all ON public.sponsored_placements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;

-- After running: refresh the Sponsorships page. 403s should clear.
