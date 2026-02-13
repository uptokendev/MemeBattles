-- =========================================
-- League claims: expiry + rollover support
-- =========================================

begin;

-- 1) Winner rows: add expiry + sweep tracking
alter table if exists public.league_epoch_winners
  add column if not exists expires_at timestamptz null;

alter table if exists public.league_epoch_winners
  add column if not exists swept_at timestamptz null;

-- Backfill expires_at for existing rows
update public.league_epoch_winners
   set expires_at = (epoch_end + interval '90 days')
 where expires_at is null
   and epoch_end is not null;

-- 2) Rollover ledger: amounts that carry into a future epoch (per category)
create table if not exists public.league_rollovers (
  chain_id int not null,
  period text not null check (period in ('weekly','monthly')),
  epoch_start timestamptz not null,
  category text not null,
  amount_raw numeric(78,0) not null default 0,
  reason text not null default 'unspecified',
  created_at timestamptz not null default now(),
  primary key (chain_id, period, epoch_start, category)
);

-- 3) Helper: compute next epoch_start
create or replace function public.league_next_epoch_start(p_period text, p_epoch_start timestamptz)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_period = 'weekly' then (p_epoch_start + interval '7 days')
    when p_period = 'monthly' then (p_epoch_start + interval '1 month')
    else p_epoch_start
  end;
$$;

-- 4) Sweep expired, unclaimed winners into next epoch rollover pool.
--
-- Returns number of winner rows swept.
create or replace function public.league_sweep_expired_unclaimed(p_chain_id int)
returns int
language plpgsql
as $$
declare
  swept_count int := 0;
begin
  -- Mark rows as swept (idempotent)
  with to_sweep as (
    select w.chain_id, w.period, w.epoch_start, w.category, w.rank, w.amount_raw, w.expires_at
      from public.league_epoch_winners w
      left join public.league_epoch_claims c
        on c.chain_id = w.chain_id
       and c.period = w.period
       and c.epoch_start = w.epoch_start
       and c.category = w.category
       and c.rank = w.rank
     where w.chain_id = p_chain_id
       and w.swept_at is null
       and w.expires_at is not null
       and w.expires_at <= now()
       and c.claimed_at is null
  ), marked as (
    update public.league_epoch_winners w
       set swept_at = now()
      from to_sweep s
     where w.chain_id = s.chain_id
       and w.period = s.period
       and w.epoch_start = s.epoch_start
       and w.category = s.category
       and w.rank = s.rank
       and w.swept_at is null
    returning s.chain_id, s.period, s.epoch_start, s.category, s.amount_raw
  ), agg as (
    select
      chain_id,
      period,
      public.league_next_epoch_start(period, epoch_start) as next_epoch_start,
      category,
      sum(amount_raw)::numeric(78,0) as total_raw
    from marked
    group by chain_id, period, next_epoch_start, category
  )
  insert into public.league_rollovers (chain_id, period, epoch_start, category, amount_raw, reason)
  select chain_id, period, next_epoch_start, category, total_raw, 'expired_unclaimed'
    from agg
  on conflict (chain_id, period, epoch_start, category)
  do update set
    amount_raw = public.league_rollovers.amount_raw + excluded.amount_raw;

  get diagnostics swept_count = row_count;
  return swept_count;
end;
$$;

-- 5) Helper for winner computation jobs:
-- Call this when a category has no clear winner for an epoch.
create or replace function public.league_rollover_no_winner(
  p_chain_id int,
  p_period text,
  p_epoch_start timestamptz,
  p_category text,
  p_amount_raw numeric
)
returns void
language plpgsql
as $$
declare
  next_epoch timestamptz;
begin
  next_epoch := public.league_next_epoch_start(p_period, p_epoch_start);
  insert into public.league_rollovers (chain_id, period, epoch_start, category, amount_raw, reason)
  values (p_chain_id, p_period, next_epoch, p_category, coalesce(p_amount_raw, 0), 'no_clear_winner')
  on conflict (chain_id, period, epoch_start, category)
  do update set amount_raw = public.league_rollovers.amount_raw + excluded.amount_raw;
end;
$$;

commit;
