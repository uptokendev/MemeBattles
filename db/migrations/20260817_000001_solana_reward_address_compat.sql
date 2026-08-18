-- Solana reward pipeline address compatibility.
--
-- The Phase-2 reward tables predate Solana support and enforced lowercase values
-- for addresses / transaction identifiers. Solana base58 public keys and
-- signatures are case-sensitive, so those checks reject valid Solana reward
-- events, eligibility rows and squad memberships.
--
-- This migration intentionally removes only case-normalization checks. Existing
-- amount, status, uniqueness, foreign-key and program constraints remain intact.

alter table if exists public.reward_events
  drop constraint if exists reward_events_wallet_address_check,
  drop constraint if exists reward_events_campaign_address_check,
  drop constraint if exists reward_events_source_contract_check,
  drop constraint if exists reward_events_tx_hash_check;

alter table if exists public.eligibility_results
  drop constraint if exists eligibility_results_wallet_address_check;

alter table if exists public.exclusion_flags
  drop constraint if exists exclusion_flags_wallet_address_check;

alter table if exists public.wallet_squad_memberships
  drop constraint if exists wallet_squad_memberships_wallet_address_check;

comment on table public.reward_events is
  'Chain-aware reward routing events. EVM addresses remain normalized in application code; Solana base58 identifiers preserve case.';

comment on table public.eligibility_results is
  'Chain-aware reward eligibility results; wallet identifiers may be EVM or case-sensitive Solana base58.';

comment on table public.wallet_squad_memberships is
  'Squad membership history. Wallet identifiers may be EVM or case-sensitive Solana base58.';
