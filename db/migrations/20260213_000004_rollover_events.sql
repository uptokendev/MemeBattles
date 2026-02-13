-- =========================================
-- League rollovers: idempotent events
-- =========================================

begin;

create table if not exists public.league_rollover_events (
  chain_id int not null,
  period text not null check (period in ('weekly','monthly')),
  epoch_start timestamptz not null,
  category text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (chain_id, period, epoch_start, category, reason)
);

-- Update the no-winner rollover helper to be idempotent.
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

  -- Only apply once per (epoch_start,category,reason)
  insert into public.league_rollover_events (chain_id, period, epoch_start, category, reason)
  values (p_chain_id, p_period, p_epoch_start, p_category, 'no_clear_winner')
  on conflict do nothing;

  if found then
    insert into public.league_rollovers (chain_id, period, epoch_start, category, amount_raw, reason)
    values (p_chain_id, p_period, next_epoch, p_category, coalesce(p_amount_raw, 0), 'no_clear_winner')
    on conflict (chain_id, period, epoch_start, category)
    do update set amount_raw = public.league_rollovers.amount_raw + excluded.amount_raw;
  end if;
end;
$$;

commit;
