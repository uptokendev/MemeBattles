-- MemeWarzone pre-grad security engine schema
-- Run this against the devpostgrad Supabase/Postgres database before enabling admin writes.

create table if not exists public.creator_profiles (
  creator_wallet text primary key,
  tier text not null default 'New' check (tier in ('New', 'Trusted', 'Proven')),
  trust_score integer not null default 0,
  live_bonding_count integer not null default 0 check (live_bonding_count >= 0),
  last_launch_at timestamptz,
  total_launches integer not null default 0 check (total_launches >= 0),
  successful_graduations integer not null default 0 check (successful_graduations >= 0),
  restricted boolean not null default false,
  manual_review_required boolean not null default false,
  cluster_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_tier_history (
  id uuid primary key default gen_random_uuid(),
  creator_wallet text not null references public.creator_profiles(creator_wallet) on delete cascade,
  old_tier text,
  new_tier text not null check (new_tier in ('New', 'Trusted', 'Proven')),
  reason text,
  admin_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.creator_reputation_events (
  id uuid primary key default gen_random_uuid(),
  creator_wallet text not null,
  event_type text not null,
  score_delta integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_risk_profiles (
  wallet_address text primary key,
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  restricted boolean not null default false,
  cluster_id text,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_clusters (
  cluster_id text primary key,
  wallet_count integer not null default 0 check (wallet_count >= 0),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  restricted boolean not null default false,
  primary_signals text[] not null default array[]::text[],
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cluster_members (
  cluster_id text not null references public.wallet_clusters(cluster_id) on delete cascade,
  wallet_address text not null,
  relationship text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (cluster_id, wallet_address)
);

create table if not exists public.cluster_events (
  id uuid primary key default gen_random_uuid(),
  cluster_id text not null,
  event_type text not null,
  signal text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.manual_review_queue (
  id uuid primary key default gen_random_uuid(),
  creator_wallet text not null,
  reason text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'approved', 'restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.security_actions (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  target text not null,
  old_value text,
  new_value text,
  reason text,
  tx_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.contract_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  chain text not null default 'bnb',
  job_type text not null,
  target text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  tx_hash text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mass_deployer_flags (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  launches_24h integer not null default 0,
  failed_tokens integer not null default 0,
  repeated_metadata integer not null default 0,
  action text not null default 'watch' check (action in ('watch', 'manual_review', 'restricted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.metadata_fingerprints (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  creator_wallet text,
  campaign_address text,
  token_symbol text,
  created_at timestamptz not null default now()
);

create table if not exists public.social_fingerprints (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  social_url text not null,
  creator_wallet text,
  campaign_address text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_security_states (
  campaign_address text primary key,
  creator_wallet text,
  paused boolean not null default false,
  buy_paused boolean not null default false,
  sell_paused boolean not null default false,
  graduation_paused boolean not null default false,
  creator_buy_lock_until timestamptz,
  creator_buy_cap_bnb numeric not null default 0,
  creator_bought_bnb numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_profiles_cluster_id on public.creator_profiles(cluster_id);
create index if not exists idx_wallet_risk_profiles_cluster_id on public.wallet_risk_profiles(cluster_id);
create index if not exists idx_manual_review_queue_status_priority on public.manual_review_queue(status, priority, created_at);
create index if not exists idx_security_actions_created_at on public.security_actions(created_at desc);
create index if not exists idx_mass_deployer_flags_wallet on public.mass_deployer_flags(wallet_address);
create index if not exists idx_metadata_fingerprints_fingerprint on public.metadata_fingerprints(fingerprint);
create index if not exists idx_social_fingerprints_fingerprint on public.social_fingerprints(fingerprint);
