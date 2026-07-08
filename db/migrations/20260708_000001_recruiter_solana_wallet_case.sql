-- db/migrations/20260708_000001_recruiter_solana_wallet_case.sql
--
-- Recruiter tables originally enforced lowercase wallet identifiers because the
-- program only accepted EVM wallets. Solana public keys are case-sensitive
-- base58 strings, so those checks reject valid Solana recruiter signup,
-- authentication nonce, referral, squad, and payout flows. Application code
-- still lowercases EVM addresses before writes; this migration only removes the
-- database-level assumption that every wallet can be lowercased.

BEGIN;

ALTER TABLE IF EXISTS public.wallet_profiles
  DROP CONSTRAINT IF EXISTS wallet_profiles_wallet_lowercase;

ALTER TABLE IF EXISTS public.auth_nonces
  DROP CONSTRAINT IF EXISTS auth_nonces_address_lowercase;

ALTER TABLE IF EXISTS public.recruiters
  DROP CONSTRAINT IF EXISTS recruiters_wallet_lowercase;

ALTER TABLE IF EXISTS public.wallet_referral_attribution_windows
  DROP CONSTRAINT IF EXISTS wallet_referral_windows_wallet_lowercase;

ALTER TABLE IF EXISTS public.wallet_recruiter_links
  DROP CONSTRAINT IF EXISTS wallet_recruiter_links_wallet_lowercase;

ALTER TABLE IF EXISTS public.wallet_squad_memberships
  DROP CONSTRAINT IF EXISTS wallet_squad_memberships_wallet_lowercase;

COMMENT ON COLUMN public.wallet_profiles.wallet_address IS
  'Chain-normalized wallet id: lowercase EVM address or case-sensitive Solana public key.';

COMMENT ON COLUMN public.auth_nonces.address IS
  'Chain-normalized signer address for auth challenges: lowercase EVM address or case-sensitive Solana public key.';

COMMENT ON COLUMN public.recruiters.wallet_address IS
  'Recruiter signup wallet: lowercase EVM address or case-sensitive Solana public key.';

COMMENT ON COLUMN public.wallet_referral_attribution_windows.wallet_address IS
  'Referred wallet id: lowercase EVM address or case-sensitive Solana public key.';

COMMENT ON COLUMN public.wallet_recruiter_links.wallet_address IS
  'Linked wallet id: lowercase EVM address or case-sensitive Solana public key.';

COMMENT ON COLUMN public.wallet_squad_memberships.wallet_address IS
  'Squad member wallet id: lowercase EVM address or case-sensitive Solana public key.';

COMMIT;
