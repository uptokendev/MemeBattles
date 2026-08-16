-- Solana native settlement companion tables for Recruiter + Squad rewards.
-- Existing reward ledgers remain the accounting source of truth; these tables only
-- materialize the on-chain Merkle batch/proof/receipt lifecycle.

create extension if not exists pgcrypto;

create table if not exists public.solana_reward_lane_batches (
  id uuid primary key default gen_random_uuid(),
  lane text not null check (lane in ('recruiter','squad')),
  chain_id integer not null check (chain_id in (101,102)),
  epoch_id bigint not null,
  epoch_start timestamptz not null,
  epoch_end timestamptz not null,
  merkle_root text not null,
  total_lamports numeric(78,0) not null check (total_lamports > 0),
  claim_deadline bigint not null,
  program_id text not null,
  vault_address text not null,
  batch_address text not null,
  publish_tx_hash text,
  claims_enable_tx_hash text,
  status text not null default 'prepared' check (status in ('prepared','published','claim_open','closed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (lane, chain_id, epoch_id)
);

create table if not exists public.solana_reward_lane_claims (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.solana_reward_lane_batches(id) on delete cascade,
  lane text not null check (lane in ('recruiter','squad')),
  source_type text not null,
  source_ref text not null,
  wallet_address text not null,
  amount_lamports numeric(78,0) not null check (amount_lamports > 0),
  merkle_leaf text not null,
  merkle_proof jsonb not null default '[]'::jsonb,
  claim_receipt_address text not null,
  status text not null default 'prepared' check (status in ('prepared','claimable','claim_pending','claimed','failed','expired')),
  tx_hash text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, wallet_address),
  unique (lane, source_type, source_ref)
);

create index if not exists idx_solana_reward_lane_batches_status
  on public.solana_reward_lane_batches (lane, chain_id, status, epoch_start desc);

create index if not exists idx_solana_reward_lane_claims_wallet
  on public.solana_reward_lane_claims (wallet_address, lane, status, created_at desc);

create index if not exists idx_solana_reward_lane_claims_source
  on public.solana_reward_lane_claims (source_type, source_ref);

alter table public.solana_reward_lane_batches enable row level security;
alter table public.solana_reward_lane_claims enable row level security;

revoke all on table public.solana_reward_lane_batches from anon, authenticated;
revoke all on table public.solana_reward_lane_claims from anon, authenticated;

comment on table public.solana_reward_lane_batches is 'Backend-only Solana Recruiter/Squad settlement batches; never queried directly by clients.';
comment on table public.solana_reward_lane_claims is 'Backend-only Solana Recruiter/Squad Merkle claims and reconciliation records.';
