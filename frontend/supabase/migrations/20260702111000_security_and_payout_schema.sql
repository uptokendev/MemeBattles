create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.creator_profiles (
  creator_wallet text primary key,
  tier text not null default 'New' check (tier in ('New', 'Trusted', 'Proven')),
  trust_score integer not null default 0 check (trust_score >= 0),
  live_bonding_count integer not null default 0 check (live_bonding_count >= 0),
  last_launch_at timestamptz,
  restricted boolean not null default false,
  manual_review_required boolean not null default false,
  cluster_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_tier_history (
  id uuid primary key default gen_random_uuid(),
  creator_wallet text not null references public.creator_profiles(creator_wallet) on delete cascade,
  old_tier text,
  new_tier text not null check (new_tier in ('New', 'Trusted', 'Proven')),
  reason text not null default '',
  changed_by text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_clusters (
  cluster_id text primary key,
  wallet_count integer not null default 0 check (wallet_count >= 0),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  restricted boolean not null default false,
  primary_signals text[] not null default '{}'::text[],
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_risk_profiles (
  wallet_address text primary key,
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  restricted boolean not null default false,
  cluster_id text references public.wallet_clusters(cluster_id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cluster_members (
  cluster_id text not null references public.wallet_clusters(cluster_id) on delete cascade,
  wallet_address text not null,
  signals jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (cluster_id, wallet_address)
);

create table if not exists public.manual_review_queue (
  id uuid primary key default gen_random_uuid(),
  creator_wallet text not null,
  reason text not null default 'Manual review required',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'approved', 'restricted', 'rejected', 'closed')),
  assigned_to text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.security_actions (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null default 'unknown',
  action text not null,
  target text not null default '',
  old_value text not null default '',
  new_value text not null default '',
  reason text not null default '',
  tx_hash text,
  source_system text not null default 'api',
  created_at timestamptz not null default now()
);

create table if not exists public.contract_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  chain text not null check (chain in ('bnb', 'solana')),
  job_type text not null,
  target text not null default '',
  status text not null default 'queued' check (status in ('queued', 'running', 'confirmed', 'failed', 'cancelled')),
  tx_hash text,
  error text,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_security_states (
  campaign_address text primary key,
  creator_wallet text,
  paused boolean not null default false,
  buy_paused boolean not null default false,
  sell_paused boolean not null default false,
  graduation_paused boolean not null default false,
  creator_buy_lock_until timestamptz,
  creator_buy_cap_bnb numeric(38, 18) not null default 0,
  creator_bought_bnb numeric(38, 18) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mass_deployer_flags (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  launches_24h integer not null default 0 check (launches_24h >= 0),
  failed_tokens integer not null default 0 check (failed_tokens >= 0),
  repeated_metadata integer not null default 0 check (repeated_metadata >= 0),
  action text not null default 'watch' check (action in ('watch', 'manual_review', 'restricted', 'cleared')),
  signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_authorization_log (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  wallet_address text,
  route_kind text not null,
  route_profile_id integer not null,
  finalize_route_profile_id integer,
  factory_address text,
  campaign_address text,
  recruiter_id bigint,
  recruiter_code text,
  recruiter_is_og boolean not null default false,
  decision_profile text,
  decision_source text,
  decision_reason text,
  route_authority text,
  authorization_deadline bigint,
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.recruiter_accounts (
  recruiter_id uuid primary key default gen_random_uuid(),
  code text unique,
  display_name text,
  total_estimated_usd numeric(38, 8) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiter_payout_wallets (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiter_accounts(recruiter_id) on delete cascade,
  chain text not null check (chain in ('bnb', 'solana')),
  wallet_address text not null,
  verification_message text,
  verification_signature text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recruiter_id, chain, wallet_address)
);

create table if not exists public.recruiter_reward_claims (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiter_accounts(recruiter_id) on delete cascade,
  chain text not null check (chain in ('bnb', 'solana')),
  token text not null,
  amount_raw numeric(78, 0) not null default 0 check (amount_raw >= 0),
  payout_wallet text not null,
  status text not null default 'created' check (status in ('created', 'submitted', 'confirmed', 'failed', 'retriable')),
  tx_hash text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiter_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiter_accounts(recruiter_id) on delete cascade,
  chain text not null check (chain in ('bnb', 'solana')),
  token text not null,
  amount_raw numeric(78, 0) not null check (amount_raw >= 0),
  status text not null default 'pending' check (status in ('pending', 'pending_finality', 'claimable', 'created', 'submitted', 'claimed', 'failed', 'retriable')),
  claim_id uuid references public.recruiter_reward_claims(id) on delete set null,
  attribution_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiter_payout_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'completed' check (status in ('completed', 'warning', 'failed')),
  checked_by text not null default 'unknown',
  summary jsonb not null default '{}'::jsonb,
  anomalies jsonb not null default '[]'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists creator_profiles_cluster_idx on public.creator_profiles(cluster_id);
create index if not exists creator_tier_history_creator_idx on public.creator_tier_history(creator_wallet, created_at desc);
create index if not exists wallet_risk_profiles_cluster_idx on public.wallet_risk_profiles(cluster_id);
create index if not exists wallet_clusters_risk_idx on public.wallet_clusters(restricted, risk_level, last_seen_at desc);
create index if not exists manual_review_queue_status_idx on public.manual_review_queue(status, priority, created_at);
create index if not exists security_actions_created_idx on public.security_actions(created_at desc);
create index if not exists contract_sync_jobs_chain_status_idx on public.contract_sync_jobs(chain, status, created_at);
create index if not exists campaign_security_states_creator_idx on public.campaign_security_states(creator_wallet);
create index if not exists mass_deployer_flags_wallet_idx on public.mass_deployer_flags(wallet_address, updated_at desc);
create index if not exists route_authorization_log_wallet_idx on public.route_authorization_log(wallet_address, created_at desc);
create index if not exists recruiter_payout_wallets_lookup_idx on public.recruiter_payout_wallets(recruiter_id, chain, verified_at desc);
create index if not exists recruiter_reward_ledger_balance_idx on public.recruiter_reward_ledger(recruiter_id, chain, token, status, claim_id);
create index if not exists recruiter_reward_claims_status_idx on public.recruiter_reward_claims(status, created_at desc);

drop trigger if exists creator_profiles_updated_at on public.creator_profiles;
create trigger creator_profiles_updated_at before update on public.creator_profiles for each row execute function public.set_updated_at();

drop trigger if exists wallet_clusters_updated_at on public.wallet_clusters;
create trigger wallet_clusters_updated_at before update on public.wallet_clusters for each row execute function public.set_updated_at();

drop trigger if exists wallet_risk_profiles_updated_at on public.wallet_risk_profiles;
create trigger wallet_risk_profiles_updated_at before update on public.wallet_risk_profiles for each row execute function public.set_updated_at();

drop trigger if exists manual_review_queue_updated_at on public.manual_review_queue;
create trigger manual_review_queue_updated_at before update on public.manual_review_queue for each row execute function public.set_updated_at();

drop trigger if exists contract_sync_jobs_updated_at on public.contract_sync_jobs;
create trigger contract_sync_jobs_updated_at before update on public.contract_sync_jobs for each row execute function public.set_updated_at();

drop trigger if exists campaign_security_states_updated_at on public.campaign_security_states;
create trigger campaign_security_states_updated_at before update on public.campaign_security_states for each row execute function public.set_updated_at();

drop trigger if exists mass_deployer_flags_updated_at on public.mass_deployer_flags;
create trigger mass_deployer_flags_updated_at before update on public.mass_deployer_flags for each row execute function public.set_updated_at();

drop trigger if exists recruiter_accounts_updated_at on public.recruiter_accounts;
create trigger recruiter_accounts_updated_at before update on public.recruiter_accounts for each row execute function public.set_updated_at();

drop trigger if exists recruiter_payout_wallets_updated_at on public.recruiter_payout_wallets;
create trigger recruiter_payout_wallets_updated_at before update on public.recruiter_payout_wallets for each row execute function public.set_updated_at();

drop trigger if exists recruiter_reward_ledger_updated_at on public.recruiter_reward_ledger;
create trigger recruiter_reward_ledger_updated_at before update on public.recruiter_reward_ledger for each row execute function public.set_updated_at();

drop trigger if exists recruiter_reward_claims_updated_at on public.recruiter_reward_claims;
create trigger recruiter_reward_claims_updated_at before update on public.recruiter_reward_claims for each row execute function public.set_updated_at();
