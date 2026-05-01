-- Reward attribution schema for MemeWarzone.
-- Apply this in Supabase before enabling real recruiter-linked routing.

create table if not exists public.recruiters (
  id bigserial primary key,
  chain_id integer not null default 97,
  wallet_address text not null,
  code text not null,
  display_name text,
  is_og boolean not null default false,
  status text not null default 'active',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruiters_wallet_address_check check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  constraint recruiters_code_check check (code ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  constraint recruiters_status_check check (status in ('active', 'closed', 'suspended'))
);

create unique index if not exists recruiters_code_lower_idx
  on public.recruiters (lower(code));

create unique index if not exists recruiters_chain_wallet_idx
  on public.recruiters (chain_id, lower(wallet_address));

create index if not exists recruiters_status_idx
  on public.recruiters (status);

create table if not exists public.recruiter_referral_sessions (
  id bigserial primary key,
  recruiter_id bigint references public.recruiters(id) on delete set null,
  recruiter_code text not null,
  session_token text not null,
  client_fingerprint text not null,
  wallet_address text,
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  user_agent text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_wallet_address_check check (wallet_address is null or wallet_address ~* '^0x[0-9a-f]{40}$')
);

create unique index if not exists referral_sessions_token_idx
  on public.recruiter_referral_sessions (session_token);

create index if not exists referral_sessions_fingerprint_idx
  on public.recruiter_referral_sessions (client_fingerprint, expires_at desc);

create index if not exists referral_sessions_wallet_idx
  on public.recruiter_referral_sessions (lower(wallet_address));

create table if not exists public.wallet_attributions (
  id bigserial primary key,
  wallet_address text not null,
  recruiter_id bigint references public.recruiters(id) on delete set null,
  recruiter_code text,
  link_state text not null default 'unlinked',
  squad_state text not null default 'solo',
  has_activity boolean not null default false,
  locked_at timestamptz,
  linked_at timestamptz,
  source_session_token text,
  source_client_fingerprint text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_attributions_wallet_check check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  constraint wallet_attributions_link_state_check check (link_state in ('unlinked', 'linked', 'detached', 'blocked')),
  constraint wallet_attributions_squad_state_check check (squad_state in ('solo', 'member', 'detached'))
);

create unique index if not exists wallet_attributions_wallet_idx
  on public.wallet_attributions (lower(wallet_address));

create index if not exists wallet_attributions_recruiter_idx
  on public.wallet_attributions (recruiter_id);

create table if not exists public.route_authorization_log (
  id bigserial primary key,
  chain_id integer not null,
  wallet_address text not null,
  campaign_address text,
  factory_address text,
  route_kind text not null,
  route_profile_id integer not null,
  finalize_route_profile_id integer,
  recruiter_id bigint,
  recruiter_code text,
  authorization_deadline bigint not null,
  route_authority text,
  created_at timestamptz not null default now(),
  constraint route_auth_wallet_check check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  constraint route_auth_kind_check check (route_kind in ('create', 'trade'))
);

create index if not exists route_authorization_log_wallet_idx
  on public.route_authorization_log (lower(wallet_address), created_at desc);

create index if not exists route_authorization_log_recruiter_idx
  on public.route_authorization_log (recruiter_id, created_at desc);
