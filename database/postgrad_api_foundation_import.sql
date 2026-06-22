-- Postgrad API foundation additions.
-- Apply after the existing arena battle / War Room tables are present.

alter table if exists public.arena_battles
  add column if not exists initial_pot_bnb numeric(38, 18) not null default 0,
  add column if not exists pot_currency text not null default 'BNB',
  add column if not exists pot_status text not null default 'pending_escrow';

alter table if exists public.arena_war_pool_entries
  add column if not exists amount_bnb numeric(38, 18) not null default 0,
  add column if not exists platform_fee_bnb numeric(38, 18) not null default 0;

create table if not exists public.war_room_external_tokens (
  id bigserial primary key,
  chain_id integer not null,
  token_address text not null,
  imported_by text,
  name text not null,
  symbol text not null,
  logo_uri text,
  website_url text,
  dex_url text,
  notes text,
  source text not null default 'external',
  active boolean not null default true,
  marketcap_bnb numeric(38, 18) not null default 0,
  vol_24h_bnb numeric(38, 18) not null default 0,
  trending_score numeric(38, 18) not null default 0,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, token_address)
);

create index if not exists war_room_external_tokens_chain_active_idx
  on public.war_room_external_tokens (chain_id, active, updated_at desc);

create index if not exists war_room_external_tokens_search_idx
  on public.war_room_external_tokens using gin (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(symbol, '') || ' ' || coalesce(token_address, ''))
  );
