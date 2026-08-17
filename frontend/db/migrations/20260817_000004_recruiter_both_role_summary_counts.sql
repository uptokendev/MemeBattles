create or replace view public.recruiter_summaries as
with active_links as (
  select recruiter_id, wallet_address
    from public.wallet_recruiter_links
   where is_active = true
),
active_memberships as (
  select recruiter_id,
         wallet_address,
         lower(coalesce(member_role, 'member')) as member_role
    from public.wallet_squad_memberships
   where is_active = true
),
member_roles as (
  select recruiter_id,
         lower(wallet_address) as wallet_key,
         bool_or(member_role in ('creator','trader','both')) as has_explicit_role,
         bool_or(member_role in ('creator','both')) as is_creator_role,
         bool_or(member_role in ('trader','both')) as is_trader_role
    from active_memberships
   group by recruiter_id, lower(wallet_address)
),
link_counts as (
  select al.recruiter_id,
         count(*) as linked_wallet_count,
         count(*) filter (
           where case
             when coalesce(mr.has_explicit_role, false) then coalesce(mr.is_creator_role, false)
             else coalesce(wp.created_campaign_count, 0) > 0
           end
         ) as linked_creators_count,
         count(*) filter (
           where case
             when coalesce(mr.has_explicit_role, false) then coalesce(mr.is_trader_role, false)
             else coalesce(wp.trade_count, 0) > 0
           end
         ) as linked_traders_count,
         max(wp.first_activity_at) as latest_linked_activity_at
    from active_links al
    left join public.wallet_profiles wp
      on wp.wallet_address = al.wallet_address
    left join member_roles mr
      on mr.recruiter_id = al.recruiter_id
     and mr.wallet_key = lower(al.wallet_address)
   group by al.recruiter_id
),
squad_counts as (
  select recruiter_id,
         count(*) as active_squad_member_count
    from active_memberships
   group by recruiter_id
),
event_matches as (
  select l.recruiter_id,
         re.epoch_id,
         re.occurred_at,
         re.route_kind,
         re.raw_amount,
         re.recruiter_amount
    from public.reward_events re
    join public.wallet_recruiter_links l
      on re.route_kind = 'trade'
     and re.wallet_address is not null
     and l.wallet_address = re.wallet_address
     and l.linked_at <= re.occurred_at
     and (l.detached_at is null or l.detached_at > re.occurred_at)
  union all
  select l.recruiter_id,
         re.epoch_id,
         re.occurred_at,
         re.route_kind,
         re.raw_amount,
         re.recruiter_amount
    from public.reward_events re
    join public.campaigns c
      on re.route_kind = 'finalize'
     and c.chain_id = re.chain_id
     and c.campaign_address = re.campaign_address
    join public.wallet_recruiter_links l
      on l.wallet_address = lower(c.creator_address)
     and l.linked_at <= re.occurred_at
     and (l.detached_at is null or l.detached_at > re.occurred_at)
),
event_totals as (
  select recruiter_id,
         count(*) as referred_event_count,
         coalesce(sum(raw_amount), 0::numeric)::numeric(78,0) as referred_volume_raw,
         coalesce(sum(recruiter_amount), 0::numeric)::numeric(78,0) as recruiter_route_amount_raw,
         max(occurred_at) as last_referred_event_at
    from event_matches
   group by recruiter_id
),
ledger_totals as (
  select wallet_address,
         coalesce(sum(net_amount) filter (where program = 'recruiter' and status = 'pending'), 0::numeric)::numeric(78,0) as pending_earnings_raw,
         coalesce(sum(net_amount) filter (where program = 'recruiter' and status = 'claimable'), 0::numeric)::numeric(78,0) as claimable_earnings_raw,
         coalesce(sum(net_amount) filter (where program = 'recruiter' and status in ('pending','claimable','claimed','expired','rolled_over')), 0::numeric)::numeric(78,0) as total_earned_raw
    from public.reward_ledger_entries
   group by wallet_address
),
claim_totals as (
  select wallet_address,
         coalesce(sum(claimed_amount) filter (where program = 'recruiter' and status = 'recorded'), 0::numeric)::numeric(78,0) as claimed_lifetime_raw,
         max(claimed_at) filter (where program = 'recruiter' and status = 'recorded') as last_claimed_at
    from public.claims
   group by wallet_address
)
select r.id as recruiter_id,
       r.wallet_address,
       r.code,
       r.display_name,
       r.is_og,
       r.status,
       r.closed_at,
       coalesce(lc.linked_wallet_count, 0::bigint) as linked_wallet_count,
       coalesce(lc.linked_creators_count, 0::bigint) as linked_creators_count,
       coalesce(lc.linked_traders_count, 0::bigint) as linked_traders_count,
       coalesce(sc.active_squad_member_count, 0::bigint) as active_squad_member_count,
       coalesce(et.referred_event_count, 0::bigint) as referred_event_count,
       coalesce(et.referred_volume_raw, 0::numeric)::numeric(78,0) as referred_volume_raw,
       coalesce(et.recruiter_route_amount_raw, 0::numeric)::numeric(78,0) as recruiter_route_amount_raw,
       et.last_referred_event_at,
       lc.latest_linked_activity_at,
       coalesce(lt.pending_earnings_raw, 0::numeric)::numeric(78,0) as pending_earnings_raw,
       coalesce(lt.claimable_earnings_raw, 0::numeric)::numeric(78,0) as claimable_earnings_raw,
       coalesce(lt.total_earned_raw, 0::numeric)::numeric(78,0) as total_earned_raw,
       coalesce(ct.claimed_lifetime_raw, 0::numeric)::numeric(78,0) as claimed_lifetime_raw,
       ct.last_claimed_at,
       r.created_at,
       r.updated_at,
       now() as materialized_at
  from public.recruiters r
  left join link_counts lc on lc.recruiter_id = r.id
  left join squad_counts sc on sc.recruiter_id = r.id
  left join event_totals et on et.recruiter_id = r.id
  left join ledger_totals lt on lt.wallet_address = r.wallet_address
  left join claim_totals ct on ct.wallet_address = r.wallet_address;
