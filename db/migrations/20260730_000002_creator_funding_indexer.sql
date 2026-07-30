-- Explorer-free BNB creator-funding indexer state and evidence.
-- Backend-only tables: no anon/authenticated Data API access.

begin;

create table if not exists public.creator_funding_indexer_state (
  chain_id integer primary key check (chain_id in (56, 97)),
  status text not null default 'starting'
    check (status in ('starting', 'running', 'healthy', 'degraded', 'stopped')),
  last_processed_block bigint not null default 0 check (last_processed_block >= 0),
  last_processed_hash text,
  latest_finalized_block bigint not null default 0 check (latest_finalized_block >= 0),
  last_processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_funding_edges (
  chain_id integer not null check (chain_id in (56, 97)),
  tx_hash text not null,
  block_number bigint not null check (block_number >= 0),
  block_hash text,
  block_timestamp timestamptz not null,
  creator_wallet text not null,
  funded_wallet text not null,
  value_wei numeric(78, 0) not null check (value_wei > 0),
  detected_at timestamptz not null default now(),
  primary key (chain_id, tx_hash),
  check (creator_wallet ~* '^0x[0-9a-f]{40}$'),
  check (funded_wallet ~* '^0x[0-9a-f]{40}$'),
  check (lower(creator_wallet) <> lower(funded_wallet))
);

create index if not exists creator_funding_edges_relationship_idx
  on public.creator_funding_edges (
    chain_id,
    (lower(creator_wallet)),
    (lower(funded_wallet)),
    block_timestamp desc
  );

create index if not exists creator_funding_edges_creator_block_idx
  on public.creator_funding_edges (chain_id, (lower(creator_wallet)), block_number desc);

alter table public.creator_funding_indexer_state enable row level security;
alter table public.creator_funding_edges enable row level security;

revoke all on table public.creator_funding_indexer_state from anon, authenticated;
revoke all on table public.creator_funding_edges from anon, authenticated;

grant select, insert, update, delete on table public.creator_funding_indexer_state to service_role;
grant select, insert, update, delete on table public.creator_funding_edges to service_role;

comment on table public.creator_funding_indexer_state is
  'Persistent finalized-block cursor and health state for the explorer-free BNB creator-funding indexer.';

comment on table public.creator_funding_edges is
  'Confirmed direct native-BNB transfers from monitored campaign creators to funded wallets.';

commit;
