-- Phase 5E: Route authorization audit log.
-- Records backend route-profile decisions for create/trade authorization.

create table if not exists public.route_authorization_log (
  id bigserial primary key,
  chain_id integer not null,
  wallet_address text not null,
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
  created_at timestamptz not null default now(),
  constraint route_authorization_log_wallet_check check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  constraint route_authorization_log_kind_check check (route_kind in ('create', 'trade')),
  constraint route_authorization_log_profile_check check (route_profile_id in (0, 1, 2)),
  constraint route_authorization_log_finalize_profile_check check (finalize_route_profile_id is null or finalize_route_profile_id in (0, 1, 2))
);

create index if not exists route_authorization_log_wallet_created_idx
  on public.route_authorization_log (lower(wallet_address), created_at desc);

create index if not exists route_authorization_log_recruiter_created_idx
  on public.route_authorization_log (recruiter_id, created_at desc)
  where recruiter_id is not null;

create index if not exists route_authorization_log_kind_created_idx
  on public.route_authorization_log (route_kind, created_at desc);

create index if not exists route_authorization_log_profile_created_idx
  on public.route_authorization_log (route_profile_id, created_at desc);
