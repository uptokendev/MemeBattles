-- Allow case-sensitive Solana public keys in recruiter attribution storage while
-- preserving the existing lowercase invariant for EVM wallet addresses.
--
-- Live Supabase migration: 20260817222819_allow_case_sensitive_solana_recruiter_wallets

alter table public.wallet_profiles
  drop constraint if exists wallet_profiles_wallet_lowercase;

alter table public.wallet_profiles
  add constraint wallet_profiles_wallet_lowercase
  check (
    wallet_address = lower(wallet_address)
    or wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  );

alter table public.wallet_referral_attribution_windows
  drop constraint if exists wallet_referral_windows_wallet_lowercase;

alter table public.wallet_referral_attribution_windows
  add constraint wallet_referral_windows_wallet_lowercase
  check (
    wallet_address is null
    or wallet_address = lower(wallet_address)
    or wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  );
