-- MemeWarzone canonical ticker reservation schema
-- Safe to run multiple times.

create table if not exists public.ticker_reservations (
  id uuid primary key,
  draft_id uuid,
  creator_wallet text not null,
  chain_id integer not null,
  cluster text not null,
  original_ticker text not null,
  normalized_ticker text not null,
  ticker_hash text not null,
  reservation_id_hash text not null,
  status text not null,
  reserved_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  grace_end_at timestamptz,
  renewal_count integer not null default 0,
  scheduled_launch_at timestamptz,
  arm_authorized_at timestamptz,
  arming_at timestamptz,
  armed_at timestamptz,
  live_at timestamptz,
  schedule_missed_at timestamptz,
  released_at timestamptz,
  program_id text,
  generation_id text,
  campaign_pda text,
  mint text,
  deployment_signature text,
  reservation_version bigint not null default 1,
  authorization_nonce text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticker_reservations_status_chk check (
    status in (
      'DRAFT_UNRESERVED',
      'SOFT_RESERVED',
      'PREPARE_MODE_RESERVED',
      'SCHEDULED_UNARMED',
      'ARM_AUTHORIZED',
      'ARMING',
      'ARMED_ONCHAIN',
      'LIVE',
      'DEPLOY_FAILED',
      'EXPIRED_GRACE',
      'RELEASED',
      'SCHEDULE_MISSED'
    )
  ),
  constraint ticker_reservations_renewal_count_chk check (renewal_count >= 0),
  constraint ticker_reservations_reservation_version_chk check (reservation_version >= 1)
);

alter table public.ticker_reservations
  add column if not exists draft_id uuid,
  add column if not exists creator_wallet text,
  add column if not exists chain_id integer,
  add column if not exists cluster text,
  add column if not exists original_ticker text,
  add column if not exists normalized_ticker text,
  add column if not exists ticker_hash text,
  add column if not exists reservation_id_hash text,
  add column if not exists status text,
  add column if not exists reserved_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists grace_end_at timestamptz,
  add column if not exists renewal_count integer,
  add column if not exists scheduled_launch_at timestamptz,
  add column if not exists arm_authorized_at timestamptz,
  add column if not exists arming_at timestamptz,
  add column if not exists armed_at timestamptz,
  add column if not exists live_at timestamptz,
  add column if not exists schedule_missed_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists program_id text,
  add column if not exists generation_id text,
  add column if not exists campaign_pda text,
  add column if not exists mint text,
  add column if not exists deployment_signature text,
  add column if not exists reservation_version bigint,
  add column if not exists authorization_nonce text,
  add column if not exists failure_reason text,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.ticker_reservations
   set renewal_count = coalesce(renewal_count, 0),
       reservation_version = coalesce(reservation_version, 1),
       metadata = coalesce(metadata, '{}'::jsonb),
       created_at = coalesce(created_at, now()),
       updated_at = coalesce(updated_at, now());

alter table public.ticker_reservations
  alter column creator_wallet set not null,
  alter column chain_id set not null,
  alter column cluster set not null,
  alter column original_ticker set not null,
  alter column normalized_ticker set not null,
  alter column ticker_hash set not null,
  alter column reservation_id_hash set not null,
  alter column status set not null,
  alter column renewal_count set default 0,
  alter column renewal_count set not null,
  alter column reservation_version set default 1,
  alter column reservation_version set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists ticker_reservations_chain_cluster_ticker_idx
  on public.ticker_reservations (chain_id, cluster, normalized_ticker, created_at desc);

create index if not exists ticker_reservations_draft_idx
  on public.ticker_reservations (draft_id, created_at desc);

create index if not exists ticker_reservations_status_expiry_idx
  on public.ticker_reservations (status, expires_at, grace_end_at);

create table if not exists public.ticker_reservation_events (
  id bigserial primary key,
  reservation_id uuid not null references public.ticker_reservations(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_type text not null default 'system',
  actor_wallet text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ticker_reservation_events
  add column if not exists reservation_id uuid,
  add column if not exists event_type text,
  add column if not exists from_status text,
  add column if not exists to_status text,
  add column if not exists actor_type text,
  add column if not exists actor_wallet text,
  add column if not exists reason text,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz;

update public.ticker_reservation_events
   set actor_type = coalesce(actor_type, 'system'),
       metadata = coalesce(metadata, '{}'::jsonb),
       created_at = coalesce(created_at, now());

alter table public.ticker_reservation_events
  alter column reservation_id set not null,
  alter column event_type set not null,
  alter column actor_type set default 'system',
  alter column actor_type set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists ticker_reservation_events_reservation_created_idx
  on public.ticker_reservation_events (reservation_id, created_at desc);

create index if not exists ticker_reservation_events_event_type_idx
  on public.ticker_reservation_events (event_type, created_at desc);
