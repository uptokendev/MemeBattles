-- WTR: War Trade Room market-continuity foundation.
-- Additive migration. Bonding trades remain isolated in curve_trades.

alter table public.campaigns
  add column if not exists bonding_active boolean not null default true,
  add column if not exists support_enabled boolean not null default true,
  add column if not exists indexing_enabled boolean not null default true,
  add column if not exists market_stage text not null default 'BONDING';

update public.campaigns
set bonding_active = is_active,
    market_stage = case when graduated_at_chain is null then 'BONDING' else 'TOPAZ_PENDING' end;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='campaigns_market_stage_valid'
      and conrelid='public.campaigns'::regclass
  ) then
    alter table public.campaigns add constraint campaigns_market_stage_valid check (
      market_stage = any(array[
        'BONDING','GRADUATING','TOPAZ_PENDING','TOPAZ_ACTIVE',
        'TOPAZ_DEGRADED','PAUSED','UNSUPPORTED'
      ]::text[])
    );
  end if;
end $$;

comment on column public.campaigns.bonding_active is
  'LaunchCampaign trading state. Graduation closes bonding without disabling platform support.';
comment on column public.campaigns.support_enabled is
  'Whether MemeWarzone supports this campaign through its full market lifecycle.';
comment on column public.campaigns.indexing_enabled is
  'Whether market indexers continue processing this campaign and its verified DEX pool.';
comment on column public.campaigns.market_stage is
  'Explicit lifecycle state; replaces overloaded is_active semantics.';

create table if not exists public.campaign_market_state (
  chain_id integer not null,
  campaign_address text not null,
  token_address text not null,
  factory_address text,
  campaign_generation text,
  market_stage text not null default 'BONDING',
  graduation_tx_hash text,
  graduation_block bigint,
  graduation_time timestamptz,
  dex_pair_address text,
  dex_router_address text,
  dex_factory_address text,
  wrapped_native_address text,
  pool_stable boolean,
  pool_fee_bps integer,
  final_curve_price_bnb numeric,
  initial_dex_price_bnb numeric,
  graduated_liquidity_token_raw text,
  graduated_liquidity_bnb_raw text,
  graduated_lp_raw text,
  burned_unsold_token_raw text,
  burned_unused_lp_token_raw text,
  post_burn_total_supply_raw text,
  pool_verified boolean not null default false,
  indexing_enabled boolean not null default true,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(chain_id,campaign_address),
  constraint campaign_market_state_stage_valid check (
    market_stage = any(array[
      'BONDING','GRADUATING','TOPAZ_PENDING','TOPAZ_ACTIVE',
      'TOPAZ_DEGRADED','PAUSED','UNSUPPORTED'
    ]::text[])
  ),
  constraint campaign_market_state_volatile_only check(pool_stable is distinct from true),
  constraint campaign_market_state_fee_valid check(pool_fee_bps is null or pool_fee_bps between 0 and 10000)
);

create unique index if not exists campaign_market_state_pair_uidx
  on public.campaign_market_state(chain_id,dex_pair_address)
  where dex_pair_address is not null and dex_pair_address<>'';
create index if not exists campaign_market_state_stage_idx
  on public.campaign_market_state(chain_id,market_stage,updated_at desc);

create table if not exists public.dex_pools (
  chain_id integer not null,
  pair_address text not null,
  campaign_address text not null,
  token_address text not null,
  wrapped_native_address text not null,
  router_address text not null,
  factory_address text not null,
  factory_generation text,
  token0_address text not null,
  token1_address text not null,
  stable boolean not null default false,
  fee_bps integer not null,
  deployment_block bigint,
  graduation_block bigint not null,
  support_enabled boolean not null default true,
  indexing_enabled boolean not null default true,
  last_indexed_block bigint,
  last_finalized_block bigint,
  last_swap_at timestamptz,
  last_sync_at timestamptz,
  reserve_token_raw text,
  reserve_native_raw text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(chain_id,pair_address),
  constraint dex_pools_volatile_only check(stable=false),
  constraint dex_pools_fee_valid check(fee_bps between 0 and 10000),
  constraint dex_pools_token_order check(lower(token0_address)<>lower(token1_address))
);

create unique index if not exists dex_pools_active_campaign_uidx
  on public.dex_pools(chain_id,campaign_address)
  where support_enabled and indexing_enabled;
create index if not exists dex_pools_index_cursor_idx
  on public.dex_pools(chain_id,indexing_enabled,last_indexed_block);

create table if not exists public.dex_trades (
  chain_id integer not null,
  campaign_address text not null,
  token_address text not null,
  pair_address text not null,
  tx_hash text not null,
  log_index integer not null,
  block_number bigint not null,
  block_hash text not null,
  block_time timestamptz not null,
  status text not null default 'pending',
  side text not null,
  sender_address text,
  recipient_address text,
  transaction_from text,
  token_amount_raw text not null,
  native_amount_raw text not null,
  token_amount numeric,
  native_amount numeric,
  price_bnb numeric,
  execution_source text not null default 'topaz_v2',
  origin text not null default 'unknown',
  trade_intent_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(chain_id,tx_hash,log_index),
  constraint dex_trades_side_valid check(side=any(array['buy','sell']::text[])),
  constraint dex_trades_status_valid check(status=any(array['pending','confirmed','orphaned','failed']::text[])),
  constraint dex_trades_origin_valid check(origin=any(array['memewarzone','topaz','aggregator','unknown']::text[])),
  constraint dex_trades_raw_amounts_valid check(token_amount_raw~'^[0-9]+$' and native_amount_raw~'^[0-9]+$')
);

create index if not exists dex_trades_campaign_time_idx
  on public.dex_trades(chain_id,campaign_address,block_number desc,log_index desc);
create index if not exists dex_trades_pair_cursor_idx
  on public.dex_trades(chain_id,pair_address,block_number desc,log_index desc);

alter table public.token_candles
  add column if not exists source_mask smallint not null default 1,
  add column if not exists bonding_trade_count integer not null default 0,
  add column if not exists dex_trade_count integer not null default 0,
  add column if not exists bonding_volume_bnb numeric not null default 0,
  add column if not exists dex_volume_bnb numeric not null default 0,
  add column if not exists last_block_number bigint,
  add column if not exists last_log_index integer;

update public.token_candles
set bonding_trade_count=greatest(bonding_trade_count,trades_count),
    bonding_volume_bnb=greatest(bonding_volume_bnb,volume_bnb),
    source_mask=case when source_mask=0 then 1 else source_mask end;

create table if not exists public.market_stats (
  chain_id integer not null,
  campaign_address text not null,
  market_stage text not null default 'BONDING',
  last_price_bnb numeric,
  market_cap_bnb numeric,
  liquidity_bnb numeric,
  bonding_reserve_bnb numeric,
  volume_5m_bnb numeric not null default 0,
  volume_1h_bnb numeric not null default 0,
  volume_4h_bnb numeric not null default 0,
  volume_24h_bnb numeric not null default 0,
  buy_volume_24h_bnb numeric not null default 0,
  sell_volume_24h_bnb numeric not null default 0,
  bonding_volume_24h_bnb numeric not null default 0,
  dex_volume_24h_bnb numeric not null default 0,
  trades_24h integer not null default 0,
  buys_24h integer not null default 0,
  sells_24h integer not null default 0,
  holders integer,
  post_burn_total_supply_raw text,
  supply_basis text,
  last_trade_block bigint,
  last_trade_at timestamptz,
  data_lag_seconds integer,
  updated_at timestamptz not null default now(),
  primary key(chain_id,campaign_address)
);

create table if not exists public.trade_intents (
  intent_id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  campaign_address text not null,
  pair_address text,
  wallet_address text not null,
  side text not null,
  amount_in_raw text not null,
  minimum_out_raw text not null,
  quoted_out_raw text not null,
  slippage_bps integer not null,
  quote_block bigint not null,
  expires_at timestamptz not null,
  transaction_hash text,
  status text not null default 'quoted',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint trade_intents_side_valid check(side=any(array['buy','sell']::text[])),
  constraint trade_intents_status_valid check(status=any(array['quoted','wallet_pending','submitted','confirmed','replaced','failed','expired']::text[])),
  constraint trade_intents_slippage_valid check(slippage_bps between 1 and 5000)
);

create unique index if not exists trade_intents_tx_uidx
  on public.trade_intents(chain_id,transaction_hash)
  where transaction_hash is not null and transaction_hash<>'';

alter table public.dex_trades drop constraint if exists dex_trades_trade_intent_id_fkey;
alter table public.dex_trades add constraint dex_trades_trade_intent_id_fkey
  foreign key(trade_intent_id) references public.trade_intents(intent_id) on delete set null;

create table if not exists public.market_repair_log (
  id bigint generated by default as identity primary key,
  chain_id integer not null,
  campaign_address text,
  pair_address text,
  action_type text not null,
  requested_by text,
  reason text,
  from_block bigint,
  to_block bigint,
  status text not null default 'requested',
  old_value jsonb,
  new_value jsonb,
  related_tx_hash text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace view public.market_trades_v
with(security_invoker=true)
as
select
  t.chain_id as "chainId",
  t.campaign_address as "campaignAddress",
  c.token_address as "tokenAddress",
  null::text as "pairAddress",
  'BONDING'::text as "marketStage",
  'bonding'::text as source,
  t.side,
  t.wallet,
  t.wallet as recipient,
  t.token_amount_raw as "tokenAmountRaw",
  t.bnb_amount_raw as "nativeAmountRaw",
  t.price_bnb as "priceBnb",
  t.tx_hash as "txHash",
  t.log_index as "logIndex",
  t.block_number as "blockNumber",
  t.block_time as "blockTime",
  'confirmed'::text as status
from public.curve_trades t
left join public.campaigns c
  on c.chain_id=t.chain_id and c.campaign_address=t.campaign_address
union all
select
  t.chain_id,t.campaign_address,t.token_address,t.pair_address,
  'TOPAZ'::text,'topaz'::text,t.side,
  coalesce(t.transaction_from,t.sender_address,t.recipient_address,''),
  t.recipient_address,t.token_amount_raw,t.native_amount_raw,t.price_bnb,
  t.tx_hash,t.log_index,t.block_number,t.block_time,t.status
from public.dex_trades t;

alter table public.campaign_market_state enable row level security;
alter table public.dex_pools enable row level security;
alter table public.dex_trades enable row level security;
alter table public.market_stats enable row level security;
alter table public.trade_intents enable row level security;
alter table public.market_repair_log enable row level security;

revoke all on public.campaign_market_state,public.dex_pools,public.dex_trades,
  public.market_stats,public.trade_intents,public.market_repair_log,public.market_trades_v
  from public,anon,authenticated;

grant select,insert,update,delete on public.campaign_market_state,public.dex_pools,
  public.dex_trades,public.market_stats,public.trade_intents,public.market_repair_log
  to service_role;
grant select on public.market_trades_v to service_role;
grant usage,select on sequence public.market_repair_log_id_seq to service_role;

drop trigger if exists campaign_market_state_set_updated_at on public.campaign_market_state;
create trigger campaign_market_state_set_updated_at before update on public.campaign_market_state
for each row execute function public.set_updated_at();
drop trigger if exists dex_pools_set_updated_at on public.dex_pools;
create trigger dex_pools_set_updated_at before update on public.dex_pools
for each row execute function public.set_updated_at();
drop trigger if exists dex_trades_set_updated_at on public.dex_trades;
create trigger dex_trades_set_updated_at before update on public.dex_trades
for each row execute function public.set_updated_at();
drop trigger if exists market_stats_set_updated_at on public.market_stats;
create trigger market_stats_set_updated_at before update on public.market_stats
for each row execute function public.set_updated_at();
drop trigger if exists trade_intents_set_updated_at on public.trade_intents;
create trigger trade_intents_set_updated_at before update on public.trade_intents
for each row execute function public.set_updated_at();

insert into public.campaign_market_state(
  chain_id,campaign_address,token_address,factory_address,market_stage,
  graduation_block,graduation_time,pool_verified,indexing_enabled
)
select
  chain_id,campaign_address,token_address,factory_address,
  case when graduated_at_chain is null then 'BONDING' else 'TOPAZ_PENDING' end,
  graduated_block,graduated_at_chain,false,indexing_enabled
from public.campaigns
where token_address is not null and token_address<>''
on conflict(chain_id,campaign_address) do nothing;
