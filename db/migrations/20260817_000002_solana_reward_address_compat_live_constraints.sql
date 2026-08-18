-- Corrective Solana reward compatibility migration for the constraint names
-- present in the live Phase-2 schema. The preceding migration used later
-- constraint aliases and was intentionally harmless because of IF EXISTS.
--
-- Remove case-normalization only where chain identifiers must preserve Solana
-- base58 case. All amount/status/foreign-key/uniqueness constraints stay intact.

alter table if exists public.reward_events
  drop constraint if exists reward_events_wallet_lowercase,
  drop constraint if exists reward_events_campaign_lowercase,
  drop constraint if exists reward_events_source_contract_lowercase,
  drop constraint if exists reward_events_txhash_lowercase;

alter table if exists public.eligibility_results
  drop constraint if exists eligibility_results_wallet_lowercase;

alter table if exists public.exclusion_flags
  drop constraint if exists exclusion_flags_wallet_lowercase;

alter table if exists public.wallet_squad_memberships
  drop constraint if exists wallet_squad_memberships_wallet_lowercase;
