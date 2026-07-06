-- Automated Warzone Airdrop pipeline.
-- Admins supervise this pipeline in web-dashboard, but weekly drops should not require manual operation.

create table if not exists public.airdrop_automation_runs (
  id bigserial primary key,
  epoch_id bigint references public.airdrop_epochs(id) on delete set null,
  chain_id integer not null,
  run_type text not null default 'weekly_auto' check (run_type in ('weekly_auto', 'manual_retry', 'dry_run')),
  status text not null default 'started' check (status in ('started', 'completed', 'blocked', 'failed')),
  step text not null default 'started',
  candidate_count integer not null default 0,
  eligible_count integer not null default 0,
  winner_count integer not null default 0,
  total_payout_raw numeric(78,0) not null default 0,
  blocked_reason text,
  error text,
  config_json jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.airdrop_automation_locks (
  lock_key text primary key,
  locked_until timestamptz not null,
  run_id bigint references public.airdrop_automation_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.airdrop_automation_alerts (
  id bigserial primary key,
  epoch_id bigint references public.airdrop_epochs(id) on delete set null,
  run_id bigint references public.airdrop_automation_runs(id) on delete set null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  alert_type text not null,
  message text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table if exists public.airdrop_epochs
  add column if not exists automation_mode text not null default 'auto' check (automation_mode in ('auto', 'manual_review', 'paused')),
  add column if not exists auto_publish boolean not null default true,
  add column if not exists auto_open_claims boolean not null default false,
  add column if not exists min_candidate_count integer not null default 25,
  add column if not exists min_eligible_count integer not null default 10,
  add column if not exists target_winner_count integer not null default 25,
  add column if not exists automation_notes text;

create index if not exists airdrop_automation_runs_epoch_idx on public.airdrop_automation_runs(epoch_id, created_at desc);
create index if not exists airdrop_automation_runs_status_idx on public.airdrop_automation_runs(status, created_at desc);
create index if not exists airdrop_automation_alerts_status_idx on public.airdrop_automation_alerts(status, severity, created_at desc);

create or replace function public.airdrop_try_lock(p_lock_key text, p_seconds integer default 900)
returns boolean
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  insert into public.airdrop_automation_locks (lock_key, locked_until, updated_at)
  values (p_lock_key, v_now + make_interval(secs => greatest(p_seconds, 60)), v_now)
  on conflict (lock_key) do update set
    locked_until = excluded.locked_until,
    updated_at = excluded.updated_at
  where public.airdrop_automation_locks.locked_until < v_now;

  return found;
end;
$$;

create or replace function public.airdrop_release_lock(p_lock_key text)
returns void
language sql
as $$
  update public.airdrop_automation_locks
     set locked_until = now(), updated_at = now()
   where lock_key = p_lock_key;
$$;

create or replace function public.airdrop_record_alert(
  p_epoch_id bigint,
  p_run_id bigint,
  p_severity text,
  p_alert_type text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  insert into public.airdrop_automation_alerts (epoch_id, run_id, severity, alert_type, message, metadata_json)
  values (p_epoch_id, p_run_id, p_severity, p_alert_type, p_message, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.airdrop_auto_run_epoch(
  p_epoch_id bigint,
  p_run_type text default 'weekly_auto',
  p_min_score numeric default 1,
  p_dry_run boolean default false
)
returns table(run_id bigint, status text, step text, blocked_reason text, candidate_count integer, eligible_count integer, winner_count integer, total_payout_raw numeric)
language plpgsql
as $$
declare
  v_epoch public.airdrop_epochs%rowtype;
  v_run_id bigint;
  v_candidate_count integer := 0;
  v_eligible_count integer := 0;
  v_winner_count integer := 0;
  v_total_payout numeric(78,0) := 0;
  v_missing_funding numeric(78,0) := 0;
  v_lock_key text;
  v_locked boolean;
  v_status text := 'completed';
  v_step text := 'started';
  v_blocked_reason text := null;
begin
  select * into v_epoch
    from public.airdrop_epochs
   where id = p_epoch_id
   for update;

  if not found then
    raise exception 'airdrop epoch % not found', p_epoch_id;
  end if;

  v_lock_key := 'airdrop_epoch_' || p_epoch_id::text;
  v_locked := public.airdrop_try_lock(v_lock_key, 1200);
  if not v_locked then
    insert into public.airdrop_automation_runs (epoch_id, chain_id, run_type, status, step, blocked_reason)
    values (p_epoch_id, v_epoch.chain_id, p_run_type, 'blocked', 'lock', 'Another airdrop automation run is already active for this epoch')
    returning id into v_run_id;
    return query select v_run_id, 'blocked'::text, 'lock'::text, 'Another airdrop automation run is already active for this epoch'::text, 0, 0, 0, 0::numeric;
    return;
  end if;

  insert into public.airdrop_automation_runs (epoch_id, chain_id, run_type, status, step, config_json)
  values (p_epoch_id, v_epoch.chain_id, case when p_dry_run then 'dry_run' else p_run_type end, 'started', 'refresh_candidates', jsonb_build_object('minScore', p_min_score, 'dryRun', p_dry_run))
  returning id into v_run_id;

  begin
    if v_epoch.automation_mode = 'paused' then
      v_status := 'blocked';
      v_step := 'paused';
      v_blocked_reason := 'Airdrop automation is paused for this epoch';
      perform public.airdrop_record_alert(p_epoch_id, v_run_id, 'warning', 'AUTOMATION_PAUSED', v_blocked_reason);
    elsif v_epoch.status not in ('funding', 'ready') then
      v_status := 'blocked';
      v_step := 'epoch_status';
      v_blocked_reason := 'Epoch status is not eligible for automated scoring';
      perform public.airdrop_record_alert(p_epoch_id, v_run_id, 'warning', 'INVALID_EPOCH_STATUS', v_blocked_reason, jsonb_build_object('status', v_epoch.status));
    else
      v_step := 'refresh_candidates';
      perform public.airdrop_refresh_candidates(p_epoch_id, p_min_score);

      select count(*)::integer,
             count(*) filter (where is_eligible)::integer
        into v_candidate_count, v_eligible_count
        from public.airdrop_candidates
       where epoch_id = p_epoch_id;

      if v_candidate_count < v_epoch.min_candidate_count then
        v_status := 'blocked';
        v_step := 'candidate_threshold';
        v_blocked_reason := 'Not enough candidates for automated airdrop publication';
        perform public.airdrop_record_alert(p_epoch_id, v_run_id, 'warning', 'LOW_CANDIDATE_COUNT', v_blocked_reason, jsonb_build_object('candidateCount', v_candidate_count, 'minCandidateCount', v_epoch.min_candidate_count));
      elsif v_eligible_count < v_epoch.min_eligible_count then
        v_status := 'blocked';
        v_step := 'eligibility_threshold';
        v_blocked_reason := 'Not enough eligible wallets for automated airdrop publication';
        perform public.airdrop_record_alert(p_epoch_id, v_run_id, 'warning', 'LOW_ELIGIBLE_COUNT', v_blocked_reason, jsonb_build_object('eligibleCount', v_eligible_count, 'minEligibleCount', v_epoch.min_eligible_count));
      else
        select coalesce(missing_funding_raw, 0)
          into v_missing_funding
          from public.airdrop_epoch_funding
         where epoch_id = p_epoch_id;

        if v_missing_funding > 0 then
          v_status := 'blocked';
          v_step := 'funding';
          v_blocked_reason := 'Airdrop prize pool is not fully funded';
          perform public.airdrop_record_alert(p_epoch_id, v_run_id, 'critical', 'MISSING_AIRDROP_FUNDING', v_blocked_reason, jsonb_build_object('missingFundingRaw', v_missing_funding));
        elsif p_dry_run then
          v_status := 'completed';
          v_step := 'dry_run_complete';
        else
          v_step := 'publish_weighted_winners';
          perform public.airdrop_publish_weighted_winners(p_epoch_id, v_epoch.target_winner_count);

          select count(*)::integer, coalesce(sum(amount_raw), 0)::numeric(78,0)
            into v_winner_count, v_total_payout
            from public.airdrop_winners
           where epoch_id = p_epoch_id;

          if v_winner_count = 0 then
            v_status := 'blocked';
            v_step := 'winner_generation';
            v_blocked_reason := 'Weighted winner generation produced no winners';
            perform public.airdrop_record_alert(p_epoch_id, v_run_id, 'critical', 'NO_AIRDROP_WINNERS', v_blocked_reason);
          elsif v_epoch.auto_publish = true then
            v_step := 'publish_epoch';
            update public.airdrop_epochs
               set status = case when auto_open_claims then 'claim_open' else 'drop_complete' end,
                   scoring_status = 'published',
                   published_at = coalesce(published_at, now()),
                   claims_open_at = case when auto_open_claims then coalesce(claims_open_at, now()) else claims_open_at end,
                   updated_at = now()
             where id = p_epoch_id;

            insert into public.airdrop_admin_reviews (epoch_id, action, target, new_value, reason)
            values (p_epoch_id, 'auto_publish_epoch', 'airdrop_epochs', jsonb_build_object('winnerCount', v_winner_count, 'autoOpenClaims', v_epoch.auto_open_claims), 'Automated weekly airdrop pipeline published the epoch');
          else
            v_step := 'review_required';
            update public.airdrop_epochs
               set automation_mode = 'manual_review',
                   status = 'ready',
                   scoring_status = 'reviewed',
                   updated_at = now()
             where id = p_epoch_id;
            perform public.airdrop_record_alert(p_epoch_id, v_run_id, 'info', 'MANUAL_REVIEW_REQUIRED', 'Automated scoring completed, but auto_publish is disabled');
          end if;
        end if;
      end if;
    end if;

    update public.airdrop_automation_runs
       set status = v_status,
           step = v_step,
           candidate_count = v_candidate_count,
           eligible_count = v_eligible_count,
           winner_count = v_winner_count,
           total_payout_raw = v_total_payout,
           blocked_reason = v_blocked_reason,
           completed_at = now()
     where id = v_run_id;

    perform public.airdrop_release_lock(v_lock_key);

    return query select v_run_id, v_status, v_step, v_blocked_reason, v_candidate_count, v_eligible_count, v_winner_count, v_total_payout;
  exception when others then
    update public.airdrop_automation_runs
       set status = 'failed',
           step = v_step,
           error = sqlerrm,
           completed_at = now()
     where id = v_run_id;
    perform public.airdrop_record_alert(p_epoch_id, v_run_id, 'critical', 'AUTOMATION_FAILED', sqlerrm);
    perform public.airdrop_release_lock(v_lock_key);
    raise;
  end;
end;
$$;

create or replace function public.airdrop_auto_run_due_epochs(p_chain_id integer default null)
returns table(run_id bigint, epoch_id bigint, status text, step text, blocked_reason text)
language plpgsql
as $$
declare
  r record;
  v_result record;
begin
  for r in
    select id
      from public.airdrop_epochs
     where automation_mode = 'auto'
       and status in ('funding', 'ready')
       and coalesce(ends_at, now()) <= now()
       and (p_chain_id is null or chain_id = p_chain_id)
     order by ends_at asc nulls last, id asc
     limit 10
  loop
    select * into v_result from public.airdrop_auto_run_epoch(r.id, 'weekly_auto', 1, false) limit 1;
    return query select v_result.run_id, r.id, v_result.status, v_result.step, v_result.blocked_reason;
  end loop;
end;
$$;
