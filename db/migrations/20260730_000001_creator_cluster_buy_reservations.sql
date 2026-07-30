-- Campaign-specific creator-cluster buy cap reservations.
-- Internal backend accounting only: no anon/authenticated Data API access.

begin;

create table if not exists public.creator_cluster_buy_reservations (
  id bigint generated always as identity primary key,
  chain_id integer not null,
  campaign_address text not null,
  creator_wallet text not null,
  cluster_key text not null,
  buyer_wallet text not null,
  route_action smallint not null check (route_action in (0, 1)),
  amount_wei numeric(78, 0) not null check (amount_wei >= 0),
  authorization_deadline bigint not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists creator_cluster_buy_reservations_lookup_idx
  on public.creator_cluster_buy_reservations (
    chain_id,
    (lower(campaign_address)),
    cluster_key,
    expires_at
  );

create index if not exists creator_cluster_buy_reservations_buyer_idx
  on public.creator_cluster_buy_reservations ((lower(buyer_wallet)), created_at desc);

alter table public.creator_cluster_buy_reservations enable row level security;

revoke all on table public.creator_cluster_buy_reservations from anon, authenticated;
revoke all on sequence public.creator_cluster_buy_reservations_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.creator_cluster_buy_reservations to service_role;
grant usage, select on sequence public.creator_cluster_buy_reservations_id_seq to service_role;

comment on table public.creator_cluster_buy_reservations is
  'Short-lived route-authorization reservations used to enforce a shared creator-cluster buy cap.';

commit;
