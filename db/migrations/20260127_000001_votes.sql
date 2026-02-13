-- =========================================
-- MemeBattles Votes: ledger + aggregates
-- =========================================

begin;

-- 1) Votes ledger (append-only)
create table if not exists public.votes (
  id bigserial primary key,

  chain_id integer not null,
  campaign_address text not null,      -- store lowercase hex "0x..."
  voter_address text not null,         -- lowercase hex
  asset_address text not null,         -- "0x000..000" for native BNB, else ERC20 address
  amount_raw numeric not null,         -- uint256 can exceed bigint; numeric is safest

  tx_hash text not null,               -- lowercase "0x..."
  log_index integer not null,          -- logIndex from receipt
  block_number bigint not null,
  block_timestamp timestamptz not null,

  meta text null,                      -- optional (store bytes32 as hex string)
  status text not null default 'confirmed',  -- confirmed | reorged | invalid

  created_at timestamptz not null default now()
);

-- Idempotency: same on-chain event should never insert twice
create unique index if not exists votes_uq_event
  on public.votes(chain_id, tx_hash, log_index);

-- Query performance indexes
create index if not exists votes_idx_campaign_time
  on public.votes(campaign_address, block_timestamp desc);

create index if not exists votes_idx_voter_time
  on public.votes(voter_address, block_timestamp desc);

create index if not exists votes_idx_status
  on public.votes(status);

create index if not exists votes_idx_chain_block
  on public.votes(chain_id, block_number);

-- 2) Aggregates table for Featured list (fast sort/filter)
create table if not exists public.vote_aggregates (
  chain_id integer not null,
  campaign_address text not null,

  votes_1h integer not null default 0,
  votes_24h integer not null default 0,
  votes_7d integer not null default 0,
  votes_all_time integer not null default 0,

  -- A single score you can sort on for "Trending"
  -- Keep as numeric so you can do fractional decay weights
  trending_score numeric not null default 0,

  last_vote_at timestamptz null,
  updated_at timestamptz not null default now(),

  primary key (chain_id, campaign_address)
);

create index if not exists vote_aggregates_idx_trending
  on public.vote_aggregates(chain_id, trending_score desc);

create index if not exists vote_aggregates_idx_24h
  on public.vote_aggregates(chain_id, votes_24h desc);

create index if not exists vote_aggregates_idx_all
  on public.vote_aggregates(chain_id, votes_all_time desc);

-- 3) Helper view: confirmed votes only (simple for API)
create or replace view public.votes_confirmed as
select *
from public.votes
where status = 'confirmed';

commit;