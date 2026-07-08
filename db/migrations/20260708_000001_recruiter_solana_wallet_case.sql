-- db/migrations/20260708_000001_recruiter_solana_wallet_case.sql
--
-- Recruiter tables originally enforced lowercase wallet identifiers because the
-- program only accepted EVM wallets. Solana public keys are case-sensitive
-- base58 strings, so those checks reject valid Solana recruiter signup,
-- authentication nonce, referral, squad, avatar/profile, and payout flows.
-- Application code still lowercases EVM addresses before writes; this migration
-- only removes the database-level assumption that every wallet can be lowercased.

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

ALTER TABLE IF EXISTS public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_address_lowercase;

-- Some environments may have earlier hand-applied constraint names. Remove any
-- CHECK constraint on known wallet/address columns that still enforces lower().
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS table_name, conname
      FROM pg_constraint
     WHERE contype = 'c'
       AND connamespace = 'public'::regnamespace
       AND conrelid IN (
         'public.wallet_profiles'::regclass,
         'public.auth_nonces'::regclass,
         'public.recruiters'::regclass,
         'public.wallet_referral_attribution_windows'::regclass,
         'public.wallet_recruiter_links'::regclass,
         'public.wallet_squad_memberships'::regclass,
         'public.user_profiles'::regclass
       )
       AND pg_get_constraintdef(oid) ~* 'lower\s*\('
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

-- Older EVM-only schemas sometimes used varchar(42). Solana public keys can be
-- 44 chars, and signatures or future chain ids may be longer, so use TEXT for
-- shared wallet/profile columns.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT table_schema, table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (table_name, column_name) IN (
         ('wallet_profiles', 'wallet_address'),
         ('auth_nonces', 'address'),
         ('recruiters', 'wallet_address'),
         ('wallet_referral_attribution_windows', 'wallet_address'),
         ('wallet_recruiter_links', 'wallet_address'),
         ('wallet_squad_memberships', 'wallet_address'),
         ('user_profiles', 'address')
       )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE TEXT', c.table_schema, c.table_name, c.column_name);
  END LOOP;
END $$;

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

COMMENT ON COLUMN public.user_profiles.address IS
  'Profile wallet id: lowercase EVM address or case-sensitive Solana public key.';

COMMIT;
