-- Production bridge for Warzone Airdrops.
-- This migration keeps the original airdrop tables intact and adds the missing accounting/scoring layer:
-- 1. reserved airdrop fee buckets per chain/epoch
-- 2. normalized wallet activity used by the candidate scorer
-- 3. audit-safe winner publication metadata

alter table if exists public.airdrop_epochs
  add column if not exists funding_source text not null default 'fee_bucket' check (funding_source in ('fee_bucket', 'manual', 'sponsor', 'treasury')),
  add column if not exists reserved_amount_raw numeric(78,0) not null default 0,
  add column if not exists reserved_tx_hash text,
  add column if not exists scoring_status text not null default 'pending' check (scoring_status in ('pending', 'computed', 'reviewed', 'published')),
  add column if not exists scoring_version text not null default 'airdrop_v1';

create table if not exists public.airdrop_fee_buckets (
  id bigserial primary key,
  chain_id integer not null,
  token_symbol text not null default 'BNB',
  epoch_id bigint references public.airdrop_epochs(id) on delete set null,
  source_type text not null default 'trading_fee' check (source_type in ('trading_fee', 'sponsor', 'manual_adjustment', 'treasury')),
  direction text not null default 'credit' check (direction in ('credit', 'debit')),
  amount_raw numeric(78,0) not null,
  tx_hash text,
  source_ref text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct (chain_id, source_type, source_ref, direction)
);

create table if not exists public.airdrop_activity_events (
  id bigserial primary key,
  chain_id integer not null,
  wallet_address text not null,
  role text not null check (role in ('creator', 'trader')),
  event_type text not null check (event_type in ('launch_created', 'draft_promoted', 'buy', 'sell', 'volume', 'upvote', 'squad_activity', 'recruiter_activity')),
  token_address text,
  amount_raw numeric(78,0) not null default 0,
  amount_usd numeric(20,8),
  score_delta numeric(30,8) not null default 0,
  tx_hash text,
  source_ref text,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct (chain_id, wallet_address, role, event_type, source_ref)
);

create table if not exists public.airdrop_scoring_runs (
  id bigserial primary key,
  epoch_id bigint not null references public.airdrop_epochs(id) on delete cascade,
  status text not null default 'computed' check (status in ('computed', 'review_required', 'approved', 'rejected', 'published')),
  candidate_count integer not null default 0,
  eligible_count integer not null default 0,
  winner_count integer not null default 0,
  total_score numeric(30,8) not null default 0,
  total_payout_raw numeric(78,0) not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists airdrop_fee_buckets_chain_epoch_idx on public.airdrop_fee_buckets(chain_id, epoch_id, created_at desc);
create index if not exists airdrop_fee_buckets_source_ref_idx on public.airdrop_fee_buckets(source_type, source_ref);
create index if not exists airdrop_activity_chain_wallet_idx on public.airdrop_activity_events(chain_id, lower(wallet_address), occurred_at desc);
create index if not exists airdrop_activity_epoch_lookup_idx on public.airdrop_activity_events(chain_id, occurred_at, role, event_type);
create index if not exists airdrop_scoring_runs_epoch_idx on public.airdrop_scoring_runs(epoch_id, created_at desc);

create or replace view public.airdrop_epoch_funding as
select e.id as epoch_id,
       e.chain_id,
       e.token_symbol,
       e.prize_pool_amount,
       coalesce(sum(case when b.direction = 'credit' then b.amount_raw else -b.amount_raw end), 0)::numeric(78,0) as fee_bucket_balance_raw,
       greatest(e.prize_pool_amount - coalesce(sum(case when b.direction = 'credit' then b.amount_raw else -b.amount_raw end), 0), 0)::numeric(78,0) as missing_funding_raw
  from public.airdrop_epochs e
  left join public.airdrop_fee_buckets b on b.epoch_id = e.id
 group by e.id, e.chain_id, e.token_symbol, e.prize_pool_amount;

create or replace view public.airdrop_epoch_activity_scores as
select e.id as epoch_id,
       a.chain_id,
       lower(a.wallet_address) as wallet_address,
       a.role,
       count(*)::integer as event_count,
       coalesce(sum(a.amount_raw), 0)::numeric(78,0) as activity_amount_raw,
       coalesce(sum(a.amount_usd), 0)::numeric(20,8) as activity_amount_usd,
       coalesce(sum(a.score_delta), 0)::numeric(30,8) as activity_score,
       max(a.occurred_at) as last_activity_at
  from public.airdrop_epochs e
  join public.airdrop_activity_events a
    on a.chain_id = e.chain_id
   and a.occurred_at >= coalesce(e.starts_at, '-infinity'::timestamptz)
   and a.occurred_at < coalesce(e.ends_at, 'infinity'::timestamptz)
 group by e.id, a.chain_id, lower(a.wallet_address), a.role;

create or replace function public.airdrop_refresh_candidates(p_epoch_id bigint, p_min_score numeric default 1)
returns table(candidate_id bigint, wallet_address text, role text, activity_score numeric, is_eligible boolean)
language plpgsql
as $$
begin
  insert into public.airdrop_candidates (
    epoch_id,
    wallet_address,
    role,
    is_eligible,
    reason_codes,
    activity_score,
    smaller_user_score,
    whale_penalty,
    metadata_json,
    computed_at,
    updated_at
  )
  select s.epoch_id,
         s.wallet_address,
         s.role,
         s.activity_score >= p_min_score,
         case when s.activity_score >= p_min_score then array[]::text[] else array['LOW_ACTIVITY_SCORE']::text[] end,
         s.activity_score,
         case
           when s.activity_amount_usd is null then 1
           when s.activity_amount_usd <= 100 then 1.25
           when s.activity_amount_usd <= 1000 then 1.10
           else 1
         end,
         case
           when s.activity_amount_usd > 10000 then 0.80
           when s.activity_amount_usd > 5000 then 0.90
           else 1
         end,
         jsonb_build_object(
           'eventCount', s.event_count,
           'activityAmountRaw', s.activity_amount_raw::text,
           'activityAmountUsd', s.activity_amount_usd,
           'lastActivityAt', s.last_activity_at,
           'scoringSource', 'airdrop_epoch_activity_scores'
         ),
         now(),
         now()
    from public.airdrop_epoch_activity_scores s
   where s.epoch_id = p_epoch_id
  on conflict (epoch_id, wallet_address, role) do update set
    is_eligible = excluded.is_eligible,
    reason_codes = excluded.reason_codes,
    activity_score = excluded.activity_score,
    smaller_user_score = excluded.smaller_user_score,
    whale_penalty = excluded.whale_penalty,
    metadata_json = excluded.metadata_json,
    computed_at = now(),
    updated_at = now();

  update public.airdrop_epochs
     set scoring_status = 'computed',
         scoring_version = 'airdrop_v1',
         updated_at = now()
   where id = p_epoch_id;

  return query
  select c.id, c.wallet_address, c.role, c.activity_score, c.is_eligible
    from public.airdrop_candidates c
   where c.epoch_id = p_epoch_id
   order by c.activity_score desc, c.id asc;
end;
$$;

create or replace function public.airdrop_publish_weighted_winners(p_epoch_id bigint, p_winner_count integer default 25)
returns table(winner_id bigint, wallet_address text, role text, winner_rank integer, amount_raw numeric)
language plpgsql
as $$
declare
  v_pool numeric(78,0);
  v_total_weight numeric(30,8);
  v_count integer;
begin
  select prize_pool_amount into v_pool
    from public.airdrop_epochs
   where id = p_epoch_id
   for update;

  if v_pool is null then
    raise exception 'airdrop epoch % not found', p_epoch_id;
  end if;

  delete from public.airdrop_claims where winner_id in (select id from public.airdrop_winners where epoch_id = p_epoch_id);
  delete from public.airdrop_winners where epoch_id = p_epoch_id;

  with ranked as (
    select c.*,
           row_number() over (order by (c.activity_score * c.smaller_user_score * c.whale_penalty) desc, c.id asc) as rn,
           (c.activity_score * c.smaller_user_score * c.whale_penalty) as final_weight
      from public.airdrop_candidates c
     where c.epoch_id = p_epoch_id
       and c.is_eligible = true
  ), selected as (
    select * from ranked where rn <= greatest(p_winner_count, 1)
  ), totals as (
    select coalesce(sum(final_weight), 0) as total_weight, count(*)::integer as winner_count from selected
  ), inserted as (
    insert into public.airdrop_winners (
      epoch_id,
      candidate_id,
      wallet_address,
      role,
      winner_rank,
      weight_tier,
      weight_value,
      activity_score,
      amount_raw,
      metadata_json,
      updated_at
    )
    select p_epoch_id,
           s.id,
           s.wallet_address,
           s.role,
           s.rn::integer,
           case when s.rn <= 5 then 1 when s.rn <= 15 then 2 else 3 end,
           s.final_weight,
           s.activity_score,
           case when t.total_weight > 0 then floor(v_pool * (s.final_weight / t.total_weight)) else 0 end::numeric(78,0),
           jsonb_build_object('scoringVersion', 'airdrop_v1', 'score', s.activity_score, 'smallerUserScore', s.smaller_user_score, 'whalePenalty', s.whale_penalty),
           now()
      from selected s
      cross join totals t
     where t.winner_count > 0
    returning id, wallet_address, role, winner_rank, amount_raw
  )
  select count(*), coalesce(sum(weight_value), 0) into v_count, v_total_weight
    from public.airdrop_winners
   where epoch_id = p_epoch_id;

  insert into public.airdrop_scoring_runs (
    epoch_id,
    status,
    candidate_count,
    eligible_count,
    winner_count,
    total_score,
    total_payout_raw,
    config_json,
    updated_at
  )
  select p_epoch_id,
         'review_required',
         (select count(*) from public.airdrop_candidates where epoch_id = p_epoch_id),
         (select count(*) from public.airdrop_candidates where epoch_id = p_epoch_id and is_eligible = true),
         coalesce(v_count, 0),
         coalesce(v_total_weight, 0),
         coalesce(sum(amount_raw), 0),
         jsonb_build_object('winnerCount', p_winner_count, 'scoringVersion', 'airdrop_v1'),
         now()
    from public.airdrop_winners
   where epoch_id = p_epoch_id;

  update public.airdrop_epochs
     set scoring_status = 'reviewed',
         status = case when status = 'funding' then 'ready' else status end,
         updated_at = now()
   where id = p_epoch_id;

  return query
  select w.id, w.wallet_address, w.role, w.winner_rank, w.amount_raw
    from public.airdrop_winners w
   where w.epoch_id = p_epoch_id
   order by w.winner_rank asc;
end;
$$;
