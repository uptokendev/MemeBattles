-- Launch-safe staging source for ledger-backed airdrops.
-- The full scoring engine may populate this table later; at launch, ops may insert
-- reviewed winners manually or through a calculation job.

begin;

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
  amount numeric(78,0) not null default 0 check (amount >= 0),
  payout_amount numeric(78,0) generated always as (amount) stored,
  amount_usd numeric,
  score numeric not null default 0,
  weight numeric,
  activity_score numeric,
  source_id text,
  source_label text,
  status text not null default 'approved',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reward_calculation_inputs_unique_idx
  on public.reward_calculation_inputs (
    reward_type,
    program,
    coalesce(epoch_id, ''),
    chain,
    lower(wallet_address)
  );

create index if not exists reward_calculation_inputs_lookup_idx
  on public.reward_calculation_inputs (reward_type, program, epoch_id, chain, score desc);

create index if not exists reward_calculation_inputs_wallet_idx
  on public.reward_calculation_inputs (lower(wallet_address));

comment on table public.reward_calculation_inputs is
  'Staging candidates consumed by internal reward calculation before reward_batches and reward_ledger materialization.';

comment on column public.reward_calculation_inputs.amount is
  'Base-unit integer reward amount. BNB values are stored in wei.';

commit;
