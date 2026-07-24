-- Solana public keys are case-sensitive and may be 44 characters long.
-- Older EVM-only auth_nonces schemas used varchar(42) plus a lowercase check,
-- which prevents the draft nonce endpoint from storing a Solana signer.

BEGIN;

ALTER TABLE IF EXISTS public.auth_nonces
  ALTER COLUMN address TYPE text;

ALTER TABLE IF EXISTS public.auth_nonces
  DROP CONSTRAINT IF EXISTS auth_nonces_address_lowercase;

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.contype = 'c'
       AND n.nspname = 'public'
       AND t.relname = 'auth_nonces'
       AND pg_get_constraintdef(c.oid) ~* 'lower\s*\('
  LOOP
    EXECUTE format(
      'ALTER TABLE public.auth_nonces DROP CONSTRAINT IF EXISTS %I',
      constraint_row.conname
    );
  END LOOP;
END $$;

COMMENT ON COLUMN public.auth_nonces.address IS
  'Chain-normalized signer: lowercase EVM address or case-sensitive Solana public key.';

COMMIT;
