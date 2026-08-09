-- CrypticPump partner listings linked to MemeWarzone campaigns.
-- Run in Supabase SQL editor. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_partner_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  token_address text,
  partner text NOT NULL DEFAULT 'crypticpump',
  listing_url text NOT NULL,
  listed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_partner_listings_partner_check CHECK (partner = 'crypticpump'),
  CONSTRAINT campaign_partner_listings_url_check CHECK (char_length(listing_url) >= 12 AND char_length(listing_url) <= 1000),
  CONSTRAINT campaign_partner_listings_unique UNIQUE (chain_id, campaign_address, partner)
);

CREATE INDEX IF NOT EXISTS campaign_partner_listings_campaign_idx
  ON public.campaign_partner_listings (chain_id, lower(campaign_address));

-- Public read for badges; writes go through service_role / API with service key.
ALTER TABLE public.campaign_partner_listings DISABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.campaign_partner_listings TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaign_partner_listings TO service_role;

COMMIT;

-- Partner postMessage contract (CrypticPump → MemeWarzone parent):
-- window.parent.postMessage({
--   source: 'crypticpump',
--   type: 'listing_submitted',
--   listingUrl: 'https://crypticpump.com/...',
--   campaignAddress: '0x...'   // optional
-- }, '*');
