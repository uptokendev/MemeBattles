-- Sponsorship slot settings (house "Advertise here" toggle, etc.)
-- Shared by public site API (DATABASE_URL) and web-dashboard (Supabase anon).

CREATE TABLE IF NOT EXISTS public.sponsorship_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Default: house inventory ON only as empty-slot fallback.
-- When any live paid/partner placement exists, the API never shows house.
-- Ops can set enabled=false to fully hide "Advertise here" even when empty.
INSERT INTO public.sponsorship_settings (key, value)
VALUES (
  'featured_house_ad',
  jsonb_build_object('enabled', true)
)
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON TABLE public.sponsorship_settings TO anon, authenticated;
ALTER TABLE public.sponsorship_settings DISABLE ROW LEVEL SECURITY;

-- Align feed view: waived partner grants count as live-eligible.
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
    WHEN COALESCE(sp.payment_status, 'pending') NOT IN ('paid', 'verified', 'waived') THEN 'awaiting_payment'
    WHEN sp.starts_at IS NOT NULL AND sp.starts_at > NOW() THEN 'scheduled'
    WHEN sp.ends_at IS NOT NULL AND sp.ends_at < NOW() THEN 'expired'
    ELSE 'live'
  END AS phase,
  sp.created_at,
  sp.updated_at
FROM public.sponsored_placements sp
LEFT JOIN public.sponsorship_applications sa
  ON sa.id = sp.application_id;

GRANT SELECT ON TABLE public.sponsored_placement_feed TO anon, authenticated;
