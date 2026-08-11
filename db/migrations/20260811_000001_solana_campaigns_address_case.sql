-- Allow case-sensitive Solana public keys in the shared campaigns registry.
-- Original BNB schema forced lower(address); Solana base58 is case-sensitive.

BEGIN;

ALTER TABLE IF EXISTS public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_campaign_lowercase,
  DROP CONSTRAINT IF EXISTS campaigns_creator_lowercase,
  DROP CONSTRAINT IF EXISTS campaigns_token_lowercase;

ALTER TABLE IF EXISTS public.auth_nonces
  DROP CONSTRAINT IF EXISTS auth_nonces_address_lowercase;

COMMENT ON COLUMN public.campaigns.campaign_address IS
  'Chain-normalized campaign id: lowercase EVM address or case-sensitive Solana public key.';
COMMENT ON COLUMN public.campaigns.creator_address IS
  'Chain-normalized creator wallet: lowercase EVM address or case-sensitive Solana public key.';
COMMENT ON COLUMN public.campaigns.token_address IS
  'Chain-normalized mint/token id: lowercase EVM address or case-sensitive Solana public key.';

COMMIT;
