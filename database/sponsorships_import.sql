-- MemeBattles sponsorship system database import
-- Run this once in Supabase SQL Editor or psql against the MemeBattles Postgres database.
-- It creates the public sponsorship intake + approved placement tables used by:
--   frontend/api/sponsorship-applications.js
--   frontend/api/sponsored.js
--   web-dashboard sponsorship admin screens

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT sponsorship_applications_status_check CHECK (
    status IN (
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'paid',
      'scheduled',
      'active',
      'expired',
      'paused'
    )
  ),
  CONSTRAINT sponsorship_applications_project_name_length CHECK (char_length(project_name) <= 120),
  CONSTRAINT sponsorship_applications_contact_name_length CHECK (char_length(contact_name) <= 120),
  CONSTRAINT sponsorship_applications_contact_channel_length CHECK (char_length(contact_channel) <= 160),
  CONSTRAINT sponsorship_applications_applicant_wallet_length CHECK (applicant_wallet IS NULL OR char_length(applicant_wallet) <= 160),
  CONSTRAINT sponsorship_applications_website_url_length CHECK (char_length(website_url) <= 500),
  CONSTRAINT sponsorship_applications_image_url_length CHECK (image_url IS NULL OR char_length(image_url) <= 500),
  CONSTRAINT sponsorship_applications_bio_length CHECK (char_length(bio) <= 500),
  CONSTRAINT sponsorship_applications_preferred_slot_length CHECK (char_length(preferred_slot) <= 80),
  CONSTRAINT sponsorship_applications_payment_reference_length CHECK (payment_reference IS NULL OR char_length(payment_reference) <= 160),
  CONSTRAINT sponsorship_applications_notes_length CHECK (notes IS NULL OR char_length(notes) <= 1000),
  CONSTRAINT sponsorship_applications_window_check CHECK (
    preferred_start IS NULL OR preferred_end IS NULL OR preferred_end >= preferred_start
  )
);

DROP TRIGGER IF EXISTS set_sponsorship_applications_updated_at ON public.sponsorship_applications;
CREATE TRIGGER set_sponsorship_applications_updated_at
BEFORE UPDATE ON public.sponsorship_applications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS sponsorship_applications_status_created_idx
  ON public.sponsorship_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS sponsorship_applications_created_idx
  ON public.sponsorship_applications (created_at DESC);

CREATE INDEX IF NOT EXISTS sponsorship_applications_preferred_slot_idx
  ON public.sponsorship_applications (preferred_slot);

CREATE TABLE IF NOT EXISTS public.sponsored_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.sponsorship_applications(id) ON DELETE SET NULL,
  chain_id integer NOT NULL DEFAULT 97,
  campaign_address text,
  token_address text,
  creator_address text,
  project_name text NOT NULL,
  symbol text,
  image_url text,
  bio text NOT NULL,
  website_url text NOT NULL,
  target_url text,
  project_type text NOT NULL DEFAULT 'external',
  placement_label text NOT NULL DEFAULT 'Homepage rail',
  slot_code text NOT NULL DEFAULT 'homepage-sponsored-rail',
  priority integer NOT NULL DEFAULT 1000,
  active boolean NOT NULL DEFAULT false,
  payment_status text NOT NULL DEFAULT 'pending',
  starts_at timestamptz,
  ends_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  paused_at timestamptz,
  expired_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT sponsored_placements_payment_status_check CHECK (
    payment_status IN (
      'pending',
      'invoice_sent',
      'paid',
      'verified',
      'refunded',
      'waived'
    )
  ),
  CONSTRAINT sponsored_placements_project_type_check CHECK (
    project_type IN ('external', 'internal', 'partner', 'featured')
  ),
  CONSTRAINT sponsored_placements_project_name_length CHECK (char_length(project_name) <= 120),
  CONSTRAINT sponsored_placements_symbol_length CHECK (symbol IS NULL OR char_length(symbol) <= 24),
  CONSTRAINT sponsored_placements_image_url_length CHECK (image_url IS NULL OR char_length(image_url) <= 500),
  CONSTRAINT sponsored_placements_bio_length CHECK (char_length(bio) <= 500),
  CONSTRAINT sponsored_placements_website_url_length CHECK (char_length(website_url) <= 500),
  CONSTRAINT sponsored_placements_target_url_length CHECK (target_url IS NULL OR char_length(target_url) <= 500),
  CONSTRAINT sponsored_placements_placement_label_length CHECK (char_length(placement_label) <= 80),
  CONSTRAINT sponsored_placements_slot_code_length CHECK (char_length(slot_code) <= 80),
  CONSTRAINT sponsored_placements_admin_notes_length CHECK (admin_notes IS NULL OR char_length(admin_notes) <= 1000),
  CONSTRAINT sponsored_placements_window_check CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at
  )
);

DROP TRIGGER IF EXISTS set_sponsored_placements_updated_at ON public.sponsored_placements;
CREATE TRIGGER set_sponsored_placements_updated_at
BEFORE UPDATE ON public.sponsored_placements
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS sponsored_placements_active_feed_idx
  ON public.sponsored_placements (active, payment_status, starts_at, ends_at, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS sponsored_placements_chain_active_idx
  ON public.sponsored_placements (chain_id, active, priority);

CREATE INDEX IF NOT EXISTS sponsored_placements_application_idx
  ON public.sponsored_placements (application_id);

CREATE INDEX IF NOT EXISTS sponsored_placements_slot_idx
  ON public.sponsored_placements (slot_code, active, priority);

CREATE INDEX IF NOT EXISTS sponsored_placements_schedule_idx
  ON public.sponsored_placements (starts_at, ends_at);

-- Optional helper view for dashboard/feed debugging.
CREATE OR REPLACE VIEW public.sponsored_placement_feed AS
SELECT
  sp.id,
  sp.application_id,
  sp.chain_id,
  COALESCE(sp.campaign_address, sp.website_url, sa.website_url, CONCAT('sponsored-placement-', sp.id::text)) AS campaign_address,
  sp.token_address,
  sp.creator_address,
  COALESCE(sp.project_name, sa.project_name, 'Sponsored project') AS project_name,
  COALESCE(sp.symbol, '') AS symbol,
  COALESCE(sp.image_url, sa.image_url) AS image_url,
  COALESCE(sp.bio, sa.bio) AS bio,
  COALESCE(sp.website_url, sa.website_url) AS website_url,
  COALESCE(sp.target_url, sp.website_url, sa.website_url) AS target_url,
  sp.project_type,
  COALESCE(sp.placement_label, sp.slot_code, sa.preferred_slot, 'Homepage rail') AS placement_label,
  sp.slot_code,
  sp.priority,
  sp.active,
  sp.payment_status,
  sp.starts_at,
  sp.ends_at,
  CASE
    WHEN sp.active IS FALSE THEN 'inactive'
    WHEN COALESCE(sp.payment_status, 'pending') NOT IN ('paid', 'verified') THEN 'awaiting_payment'
    WHEN sp.starts_at IS NOT NULL AND sp.starts_at > NOW() THEN 'scheduled'
    WHEN sp.ends_at IS NOT NULL AND sp.ends_at < NOW() THEN 'expired'
    ELSE 'live'
  END AS phase,
  sp.created_at,
  sp.updated_at
FROM public.sponsored_placements sp
LEFT JOIN public.sponsorship_applications sa
  ON sa.id = sp.application_id;

-- Keep RLS disabled by default because the Node API server/admin dashboard should use
-- server-side database credentials. Enable RLS later only after adding app-specific policies.
ALTER TABLE public.sponsorship_applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_placements DISABLE ROW LEVEL SECURITY;

COMMIT;
