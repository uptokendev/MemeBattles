-- Launch-safe reward ledger foundation for MemeWarzone.
-- Apply this to the Supabase/Postgres public schema before enabling live reward claims.

create extension if not exists pgcrypto;

create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  reward_type text not null check (reward_type in ('airdrop', 'league', 'recruiter', 'squad', 'battle', 'tournament', 'campaign', 'manual', 'future')),
  source_id text,
  source_label text,
  wallet_address text not null,
  user_id text,
  chain text not null,
  token_symbol text not null,
  amount numeric(78, 0) not null default 0,
  amount_usd numeric(20, 6),
  status text not null default 'pending' check (status in ('pending', 'approved', 'claimable', 'claim_pending', 'claimed', 'failed', 'expired', 'cancelled')),
  claim_batch_id text,
  claim_tx_hash text,
  claim_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimable_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz
);

create table if not exists public.reward_batches (
  id uuid primary key default gen_random_uuid(),
  reward_type text not null check (reward_type in ('airdrop', 'league', 'recruiter', 'squad', 'battle', 'tournament', 'campaign', 'manual', 'future')),
  chain text not null,
  token_symbol text not null,
  status text not null default 'draft' check (status in ('draft', 'calculating', 'funding_check', 'ready', 'published', 'claim_open', 'paused', 'failed', 'closed', 'archived')),
  total_amount numeric(78, 0) not null default 0,
  recipient_count integer not null default 0,
  claimable_count integer not null default 0,
  claimed_count integer not null default 0,
  failed_count integer not null default 0,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  closed_at timestamptz
);

create table if not exists public.reward_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.reward_batches(id) on delete cascade,
  reward_ledger_id uuid references public.reward_ledger(id) on delete set null,
  wallet_address text not null,
  amount numeric(78, 0) not null default 0,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_audit_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.reward_batches(id) on delete set null,
  reward_ledger_id uuid references public.reward_ledger(id) on delete set null,
  actor_type text not null default 'system' check (actor_type in ('system', 'admin', 'scheduler', 'contract', 'api')),
  actor_id text,
  action text not null,
  old_value text,
  new_value text,
  reason text,
  tx_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'info',
  reward_type text,
  batch_id uuid references public.reward_batches(id) on delete set null,
  title text not null,
  message text not null default '',
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists reward_ledger_wallet_idx on public.reward_ledger (wallet_address);
create index if not exists reward_ledger_status_idx on public.reward_ledger (status);
create index if not exists reward_ledger_type_idx on public.reward_ledger (reward_type);
create index if not exists reward_ledger_chain_idx on public.reward_ledger (chain);
create index if not exists reward_ledger_claimable_idx on public.reward_ledger (wallet_address, status, claimable_at desc);
create index if not exists reward_batches_type_status_idx on public.reward_batches (reward_type, status, created_at desc);
create index if not exists reward_batches_chain_idx on public.reward_batches (chain);
create index if not exists reward_batch_items_batch_idx on public.reward_batch_items (batch_id);
create index if not exists reward_batch_items_ledger_idx on public.reward_batch_items (reward_ledger_id);
create index if not exists reward_audit_batch_idx on public.reward_audit_logs (batch_id, created_at desc);
create index if not exists reward_audit_ledger_idx on public.reward_audit_logs (reward_ledger_id, created_at desc);
create index if not exists reward_alerts_status_idx on public.reward_alerts (status, created_at desc);
