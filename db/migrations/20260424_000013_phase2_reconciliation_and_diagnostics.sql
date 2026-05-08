BEGIN;

CREATE OR REPLACE VIEW public.reward_program_epoch_reconciliations AS
WITH event_program_totals AS (
  SELECT epoch_id, 'recruiter'::text AS program, coalesce(sum(recruiter_amount), 0)::numeric(78,0) AS event_pool_amount
  FROM public.reward_events
  GROUP BY epoch_id
  UNION ALL
  SELECT epoch_id, 'airdrop_trader'::text AS program, (coalesce(sum(airdrop_amount), 0)::numeric(78,0) / 2) AS event_pool_amount
  FROM public.reward_events
  GROUP BY epoch_id
  UNION ALL
  SELECT epoch_id, 'airdrop_creator'::text AS program, coalesce(sum(airdrop_amount), 0)::numeric(78,0) - (coalesce(sum(airdrop_amount), 0)::numeric(78,0) / 2) AS event_pool_amount
  FROM public.reward_events
  GROUP BY epoch_id
  UNION ALL
  SELECT epoch_id, 'squad'::text AS program, coalesce(sum(squad_amount), 0)::numeric(78,0) AS event_pool_amount
  FROM public.reward_events
  GROUP BY epoch_id
), ledger_totals AS (
  SELECT
    epoch_id,
    program,
    count(*)::bigint AS ledger_entry_count,
    coalesce(sum(gross_amount), 0)::numeric(78,0) AS ledger_gross_amount,
    coalesce(sum(net_amount), 0)::numeric(78,0) AS ledger_net_amount,
    coalesce(sum(gross_amount) FILTER (WHERE status = 'cancelled'), 0)::numeric(78,0) AS cancelled_gross_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'cancelled'), 0)::numeric(78,0) AS cancelled_net_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'pending'), 0)::numeric(78,0) AS pending_net_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'claimable'), 0)::numeric(78,0) AS claimable_net_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'claimed'), 0)::numeric(78,0) AS claimed_net_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'expired'), 0)::numeric(78,0) AS expired_net_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'rolled_over'), 0)::numeric(78,0) AS rolled_over_net_amount
  FROM public.reward_ledger_entries
  GROUP BY epoch_id, program
), claim_totals AS (
  SELECT
    epoch_id,
    program,
    count(*) FILTER (WHERE status = 'recorded')::bigint AS claim_count,
    coalesce(sum(claimed_amount) FILTER (WHERE status = 'recorded'), 0)::numeric(78,0) AS claim_recorded_amount
  FROM public.claims
  GROUP BY epoch_id, program
), rollovers AS (
  SELECT
    l.epoch_id,
    r.program,
    count(*)::bigint AS rollover_count,
    coalesce(sum(r.amount), 0)::numeric(78,0) AS rollover_amount
  FROM public.claim_rollovers r
  JOIN public.reward_ledger_entries l
    ON l.id = r.from_ledger_entry_id
  GROUP BY l.epoch_id, r.program
), universe AS (
  SELECT epoch_id, program FROM event_program_totals
  UNION
  SELECT epoch_id, program FROM ledger_totals
  UNION
  SELECT epoch_id, program FROM claim_totals
  UNION
  SELECT epoch_id, program FROM rollovers
)
SELECT
  u.epoch_id,
  e.chain_id,
  e.epoch_type,
  e.start_at,
  e.end_at,
  e.status AS epoch_status,
  u.program,
  coalesce(ep.event_pool_amount, 0)::numeric(78,0) AS event_pool_amount,
  coalesce(lt.ledger_entry_count, 0)::bigint AS ledger_entry_count,
  coalesce(lt.ledger_gross_amount, 0)::numeric(78,0) AS ledger_gross_amount,
  coalesce(lt.ledger_net_amount, 0)::numeric(78,0) AS ledger_net_amount,
  coalesce(lt.cancelled_gross_amount, 0)::numeric(78,0) AS cancelled_gross_amount,
  coalesce(lt.cancelled_net_amount, 0)::numeric(78,0) AS cancelled_net_amount,
  coalesce(lt.pending_net_amount, 0)::numeric(78,0) AS pending_net_amount,
  coalesce(lt.claimable_net_amount, 0)::numeric(78,0) AS claimable_net_amount,
  coalesce(lt.claimed_net_amount, 0)::numeric(78,0) AS claimed_net_amount,
  coalesce(lt.expired_net_amount, 0)::numeric(78,0) AS expired_net_amount,
  coalesce(lt.rolled_over_net_amount, 0)::numeric(78,0) AS rolled_over_net_amount,
  coalesce(ct.claim_count, 0)::bigint AS claim_count,
  coalesce(ct.claim_recorded_amount, 0)::numeric(78,0) AS claim_recorded_amount,
  coalesce(ro.rollover_count, 0)::bigint AS rollover_count,
  coalesce(ro.rollover_amount, 0)::numeric(78,0) AS rollover_amount,
  greatest(coalesce(ep.event_pool_amount, 0)::numeric(78,0) - coalesce(lt.ledger_gross_amount, 0)::numeric(78,0), 0)::numeric(78,0) AS unallocated_event_amount,
  greatest(coalesce(lt.ledger_gross_amount, 0)::numeric(78,0) - coalesce(ep.event_pool_amount, 0)::numeric(78,0), 0)::numeric(78,0) AS overallocated_event_amount,
  now() AS materialized_at
FROM universe u
JOIN public.epochs e ON e.id = u.epoch_id
LEFT JOIN event_program_totals ep ON ep.epoch_id = u.epoch_id AND ep.program = u.program
LEFT JOIN ledger_totals lt ON lt.epoch_id = u.epoch_id AND lt.program = u.program
LEFT JOIN claim_totals ct ON ct.epoch_id = u.epoch_id AND ct.program = u.program
LEFT JOIN rollovers ro ON ro.epoch_id = u.epoch_id AND ro.program = u.program;

CREATE OR REPLACE VIEW public.recruiter_closure_diagnostics AS
WITH detached_links AS (
  SELECT
    recruiter_id,
    count(*)::bigint AS detached_wallet_count,
    max(detached_at) AS last_detached_at
  FROM public.wallet_recruiter_links
  WHERE detached_at IS NOT NULL
  GROUP BY recruiter_id
), detached_squads AS (
  SELECT
    recruiter_id,
    count(*)::bigint AS detached_squad_membership_count,
    max(left_at) AS last_squad_left_at
  FROM public.wallet_squad_memberships
  WHERE left_at IS NOT NULL
  GROUP BY recruiter_id
)
SELECT
  r.id AS recruiter_id,
  r.wallet_address,
  r.code,
  r.display_name,
  r.status,
  r.closed_at,
  coalesce(dl.detached_wallet_count, 0)::bigint AS detached_wallet_count,
  dl.last_detached_at,
  coalesce(ds.detached_squad_membership_count, 0)::bigint AS detached_squad_member_count,
  ds.last_squad_left_at,
  now() AS materialized_at
FROM public.recruiters r
LEFT JOIN detached_links dl ON dl.recruiter_id = r.id
LEFT JOIN detached_squads ds ON ds.recruiter_id = r.id
WHERE r.status IN ('inactive', 'closed', 'suspended')
   OR coalesce(dl.detached_wallet_count, 0) > 0
   OR coalesce(ds.detached_squad_membership_count, 0) > 0;

COMMIT;
