-- Launch-safe reward calculation input contract for ledger-backed airdrops.
--
-- Purpose:
--   Keep the airdrop system usable at launch even before the full automatic scoring
--   engine is finalized. Ops can insert calculated winners here, and the internal
--   airdrop calculate/publish endpoints can consume them with auto=true.
--
-- API default source relation:
--   public.reward_calculation_inputs
--
-- Minimal launch flow:
--   1. Insert one row per winner into public.reward_calculation_inputs.
--   2. POST /api/internal/airdrops/calculate with { "auto": true, "program": "airdrop_trader", "chainId": 56, "epochId": <id> }.
--   3. Review the created reward batch/admin ledger.
--   4. POST /api/internal/airdrops/publish with the batchId, or publish directly with auto=true after review rules are ready.
--
-- Amounts must be base-unit integer strings for BNB claim compatibility, e.g.
-- 1000000000000000000 for 1 BNB.

create table if not exists public.reward_calculation_inputs (
  id uuid primary key default gen_random_uuid(),
  reward_type text not null default 'airdrop',
  program text not null default 'airdrop_trader',
  epoch_id text,
  chain text not null default '56',
  chain_id text generated always as (chain) stored,
  token_symbol text not null default 'BNB',
  wallet_address text not null,
  user_id text,
  amount numeric not null default 0,
  payout_amount numeric generated always as (amount) stored,
  amount_usd numeric,
  score numeric not null default 0,
  weight numeric,
  activity_score numeric,
  source_id text,
  source_label text,
  status text not null default 'approved',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reward_type, program, epoch_id, chain, wallet_address)
);

create index if not exists reward_calculation_inputs_lookup_idx
  on public.reward_calculation_inputs (reward_type, program, epoch_id, chain, score desc);

create index if not exists reward_calculation_inputs_wallet_idx
  on public.reward_calculation_inputs (wallet_address);

comment on table public.reward_calculation_inputs is
  'Launch-safe staging table consumed by internal airdrop auto calculation before inserting reward_batches/reward_ledger rows.';

comment on column public.reward_calculation_inputs.amount is
  'Base-unit integer reward amount. For BNB this is wei, stored as numeric for DB compatibility.';

-- Example:
-- insert into public.reward_calculation_inputs
--   (reward_type, program, epoch_id, chain, token_symbol, wallet_address, amount, score, source_label, metadata)
-- values
--   ('airdrop', 'airdrop_trader', '2026-W28', '56', 'BNB', '0x0000000000000000000000000000000000000000', 100000000000000000, 100, 'manual_launch_airdrop', '{"reason":"launch test"}'::jsonb)
-- on conflict (reward_type, program, epoch_id, chain, wallet_address)
-- do update set
--   amount = excluded.amount,
--   score = excluded.score,
--   source_label = excluded.source_label,
--   metadata = excluded.metadata,
--   updated_at = now();
