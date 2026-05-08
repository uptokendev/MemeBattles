BEGIN;

CREATE OR REPLACE VIEW public.wallet_reward_summaries AS
WITH wallet_base AS (
  SELECT wallet_address FROM public.wallet_attribution_states
  UNION
  SELECT wallet_address FROM public.reward_ledger_entries
  UNION
  SELECT wallet_address FROM public.claims
  UNION
  SELECT wallet_address FROM public.eligibility_results
), ledger_amounts AS (
  SELECT
    wallet_address,
    coalesce(sum(net_amount) FILTER (WHERE program = 'recruiter' AND status = 'pending'), 0)::numeric(78,0) AS pending_recruiter_amount,
    coalesce(sum(net_amount) FILTER (WHERE program = 'airdrop_trader' AND status = 'pending'), 0)::numeric(78,0) AS pending_airdrop_trader_amount,
    coalesce(sum(net_amount) FILTER (WHERE program = 'airdrop_creator' AND status = 'pending'), 0)::numeric(78,0) AS pending_airdrop_creator_amount,
    coalesce(sum(net_amount) FILTER (WHERE program = 'squad' AND status = 'pending'), 0)::numeric(78,0) AS pending_squad_amount,
    coalesce(sum(net_amount) FILTER (WHERE program = 'recruiter' AND status = 'claimable'), 0)::numeric(78,0) AS claimable_recruiter_amount,
    coalesce(sum(net_amount) FILTER (WHERE program = 'airdrop_trader' AND status = 'claimable'), 0)::numeric(78,0) AS claimable_airdrop_trader_amount,
    coalesce(sum(net_amount) FILTER (WHERE program = 'airdrop_creator' AND status = 'claimable'), 0)::numeric(78,0) AS claimable_airdrop_creator_amount,
    coalesce(sum(net_amount) FILTER (WHERE program = 'squad' AND status = 'claimable'), 0)::numeric(78,0) AS claimable_squad_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'claimable'), 0)::numeric(78,0) AS total_claimable_amount
  FROM public.reward_ledger_entries
  GROUP BY wallet_address
), claim_amounts AS (
  SELECT
    wallet_address,
    coalesce(sum(claimed_amount) FILTER (WHERE program = 'recruiter' AND status = 'recorded'), 0)::numeric(78,0) AS claimed_recruiter_amount,
    coalesce(sum(claimed_amount) FILTER (WHERE program = 'airdrop_trader' AND status = 'recorded'), 0)::numeric(78,0) AS claimed_airdrop_trader_amount,
    coalesce(sum(claimed_amount) FILTER (WHERE program = 'airdrop_creator' AND status = 'recorded'), 0)::numeric(78,0) AS claimed_airdrop_creator_amount,
    coalesce(sum(claimed_amount) FILTER (WHERE program = 'squad' AND status = 'recorded'), 0)::numeric(78,0) AS claimed_squad_amount,
    coalesce(sum(claimed_amount) FILTER (WHERE status = 'recorded'), 0)::numeric(78,0) AS claimed_lifetime_amount,
    max(claimed_at) FILTER (WHERE status = 'recorded') AS last_claimed_at
  FROM public.claims
  GROUP BY wallet_address
), latest_eligibility AS (
  SELECT
    wallet_address,
    jsonb_object_agg(
      program,
      jsonb_build_object(
        'epochId', epoch_id,
        'eligible', is_eligible,
        'score', score,
        'reasonCodes', reason_codes,
        'computedAt', computed_at
      )
      ORDER BY program
    ) AS latest_eligibility_by_program
  FROM public.wallet_latest_eligibility_results
  GROUP BY wallet_address
), latest_reason_codes AS (
  SELECT
    wallet_address,
    jsonb_object_agg(program, to_jsonb(reason_codes) ORDER BY program) AS latest_reason_codes_by_program
  FROM public.wallet_latest_eligibility_results
  GROUP BY wallet_address
), open_flags AS (
  SELECT
    wallet_address,
    count(*) FILTER (WHERE severity = 'hard')::bigint AS open_hard_flag_count,
    count(*) FILTER (WHERE severity = 'review')::bigint AS open_review_flag_count
  FROM public.reward_exclusion_open_flags
  GROUP BY wallet_address
)
SELECT
  wb.wallet_address,
  was.first_seen_at,
  was.first_activity_at,
  coalesce(was.has_activity, false) AS has_activity,
  coalesce(was.created_campaign_count, 0) AS created_campaign_count,
  coalesce(was.trade_count, 0) AS trade_count,
  was.recruiter_link_state,
  was.squad_state,
  was.last_detach_reason,
  was.recruiter_id,
  was.recruiter_wallet_address,
  was.recruiter_code,
  was.recruiter_display_name,
  was.recruiter_is_og,
  was.recruiter_status,
  was.link_source,
  was.linked_at,
  was.locked_at,
  was.squad_recruiter_id,
  was.squad_recruiter_code,
  was.squad_recruiter_display_name,
  was.squad_joined_at,
  coalesce(la.pending_recruiter_amount, 0)::numeric(78,0) AS pending_recruiter_amount,
  coalesce(la.pending_airdrop_trader_amount, 0)::numeric(78,0) AS pending_airdrop_trader_amount,
  coalesce(la.pending_airdrop_creator_amount, 0)::numeric(78,0) AS pending_airdrop_creator_amount,
  coalesce(la.pending_squad_amount, 0)::numeric(78,0) AS pending_squad_amount,
  coalesce(la.claimable_recruiter_amount, 0)::numeric(78,0) AS claimable_recruiter_amount,
  coalesce(la.claimable_airdrop_trader_amount, 0)::numeric(78,0) AS claimable_airdrop_trader_amount,
  coalesce(la.claimable_airdrop_creator_amount, 0)::numeric(78,0) AS claimable_airdrop_creator_amount,
  coalesce(la.claimable_squad_amount, 0)::numeric(78,0) AS claimable_squad_amount,
  coalesce(la.total_claimable_amount, 0)::numeric(78,0) AS total_claimable_amount,
  coalesce(ca.claimed_recruiter_amount, 0)::numeric(78,0) AS claimed_recruiter_amount,
  coalesce(ca.claimed_airdrop_trader_amount, 0)::numeric(78,0) AS claimed_airdrop_trader_amount,
  coalesce(ca.claimed_airdrop_creator_amount, 0)::numeric(78,0) AS claimed_airdrop_creator_amount,
  coalesce(ca.claimed_squad_amount, 0)::numeric(78,0) AS claimed_squad_amount,
  coalesce(ca.claimed_lifetime_amount, 0)::numeric(78,0) AS claimed_lifetime_amount,
  ca.last_claimed_at,
  coalesce(le.latest_eligibility_by_program, '{}'::jsonb) AS latest_eligibility_by_program,
  coalesce(lr.latest_reason_codes_by_program, '{}'::jsonb) AS latest_reason_codes_by_program,
  coalesce(ofl.open_hard_flag_count, 0)::bigint AS open_hard_flag_count,
  coalesce(ofl.open_review_flag_count, 0)::bigint AS open_review_flag_count,
  now() AS materialized_at
FROM wallet_base wb
LEFT JOIN public.wallet_attribution_states was ON was.wallet_address = wb.wallet_address
LEFT JOIN ledger_amounts la ON la.wallet_address = wb.wallet_address
LEFT JOIN claim_amounts ca ON ca.wallet_address = wb.wallet_address
LEFT JOIN latest_eligibility le ON le.wallet_address = wb.wallet_address
LEFT JOIN latest_reason_codes lr ON lr.wallet_address = wb.wallet_address
LEFT JOIN open_flags ofl ON ofl.wallet_address = wb.wallet_address;

CREATE OR REPLACE VIEW public.recruiter_summaries AS
WITH active_links AS (
  SELECT recruiter_id, wallet_address
  FROM public.wallet_recruiter_links
  WHERE is_active = true
), active_memberships AS (
  SELECT recruiter_id, wallet_address
  FROM public.wallet_squad_memberships
  WHERE is_active = true
), link_counts AS (
  SELECT
    al.recruiter_id,
    count(*)::bigint AS linked_wallet_count,
    count(*) FILTER (WHERE coalesce(wp.created_campaign_count, 0) > 0)::bigint AS linked_creators_count,
    count(*) FILTER (WHERE coalesce(wp.trade_count, 0) > 0)::bigint AS linked_traders_count,
    max(wp.first_activity_at) AS latest_linked_activity_at
  FROM active_links al
  LEFT JOIN public.wallet_profiles wp ON wp.wallet_address = al.wallet_address
  GROUP BY al.recruiter_id
), squad_counts AS (
  SELECT recruiter_id, count(*)::bigint AS active_squad_member_count
  FROM active_memberships
  GROUP BY recruiter_id
), event_matches AS (
  SELECT
    l.recruiter_id,
    re.epoch_id,
    re.occurred_at,
    re.route_kind,
    re.raw_amount,
    re.recruiter_amount
  FROM public.reward_events re
  JOIN public.wallet_recruiter_links l
    ON re.route_kind = 'trade'
   AND re.wallet_address IS NOT NULL
   AND l.wallet_address = re.wallet_address
   AND l.linked_at <= re.occurred_at
   AND (l.detached_at IS NULL OR l.detached_at > re.occurred_at)
  UNION ALL
  SELECT
    l.recruiter_id,
    re.epoch_id,
    re.occurred_at,
    re.route_kind,
    re.raw_amount,
    re.recruiter_amount
  FROM public.reward_events re
  JOIN public.campaigns c
    ON re.route_kind = 'finalize'
   AND c.chain_id = re.chain_id
   AND c.campaign_address = re.campaign_address
  JOIN public.wallet_recruiter_links l
    ON l.wallet_address = lower(c.creator_address)
   AND l.linked_at <= re.occurred_at
   AND (l.detached_at IS NULL OR l.detached_at > re.occurred_at)
), event_totals AS (
  SELECT
    recruiter_id,
    count(*)::bigint AS referred_event_count,
    coalesce(sum(raw_amount), 0)::numeric(78,0) AS referred_volume_raw,
    coalesce(sum(recruiter_amount), 0)::numeric(78,0) AS recruiter_route_amount_raw,
    max(occurred_at) AS last_referred_event_at
  FROM event_matches
  GROUP BY recruiter_id
), ledger_totals AS (
  SELECT
    wallet_address,
    coalesce(sum(net_amount) FILTER (WHERE program = 'recruiter' AND status = 'pending'), 0)::numeric(78,0) AS pending_earnings_raw,
    coalesce(sum(net_amount) FILTER (WHERE program = 'recruiter' AND status = 'claimable'), 0)::numeric(78,0) AS claimable_earnings_raw,
    coalesce(sum(net_amount) FILTER (WHERE program = 'recruiter' AND status IN ('pending', 'claimable', 'claimed', 'expired', 'rolled_over')), 0)::numeric(78,0) AS total_earned_raw
  FROM public.reward_ledger_entries
  GROUP BY wallet_address
), claim_totals AS (
  SELECT
    wallet_address,
    coalesce(sum(claimed_amount) FILTER (WHERE program = 'recruiter' AND status = 'recorded'), 0)::numeric(78,0) AS claimed_lifetime_raw,
    max(claimed_at) FILTER (WHERE program = 'recruiter' AND status = 'recorded') AS last_claimed_at
  FROM public.claims
  GROUP BY wallet_address
)
SELECT
  r.id AS recruiter_id,
  r.wallet_address,
  r.code,
  r.display_name,
  r.is_og,
  r.status,
  r.closed_at,
  coalesce(lc.linked_wallet_count, 0)::bigint AS linked_wallet_count,
  coalesce(lc.linked_creators_count, 0)::bigint AS linked_creators_count,
  coalesce(lc.linked_traders_count, 0)::bigint AS linked_traders_count,
  coalesce(sc.active_squad_member_count, 0)::bigint AS active_squad_member_count,
  coalesce(et.referred_event_count, 0)::bigint AS referred_event_count,
  coalesce(et.referred_volume_raw, 0)::numeric(78,0) AS referred_volume_raw,
  coalesce(et.recruiter_route_amount_raw, 0)::numeric(78,0) AS recruiter_route_amount_raw,
  et.last_referred_event_at,
  lc.latest_linked_activity_at,
  coalesce(lt.pending_earnings_raw, 0)::numeric(78,0) AS pending_earnings_raw,
  coalesce(lt.claimable_earnings_raw, 0)::numeric(78,0) AS claimable_earnings_raw,
  coalesce(lt.total_earned_raw, 0)::numeric(78,0) AS total_earned_raw,
  coalesce(ct.claimed_lifetime_raw, 0)::numeric(78,0) AS claimed_lifetime_raw,
  ct.last_claimed_at,
  r.created_at,
  r.updated_at,
  now() AS materialized_at
FROM public.recruiters r
LEFT JOIN link_counts lc ON lc.recruiter_id = r.id
LEFT JOIN squad_counts sc ON sc.recruiter_id = r.id
LEFT JOIN event_totals et ON et.recruiter_id = r.id
LEFT JOIN ledger_totals lt ON lt.wallet_address = r.wallet_address
LEFT JOIN claim_totals ct ON ct.wallet_address = r.wallet_address;

CREATE OR REPLACE VIEW public.squad_summaries AS
WITH current_epoch AS (
  SELECT e.*
  FROM public.epochs e
  ORDER BY e.end_at DESC, e.id DESC
  LIMIT 1
), active_memberships AS (
  SELECT recruiter_id, wallet_address
  FROM public.wallet_squad_memberships
  WHERE is_active = true
), current_epoch_scores AS (
  SELECT
    am.recruiter_id,
    count(*) FILTER (WHERE er.is_eligible)::bigint AS eligible_member_count,
    coalesce(sum(er.score) FILTER (WHERE er.is_eligible), 0)::numeric(78,0) AS total_eligible_score
  FROM active_memberships am
  CROSS JOIN current_epoch ce
  LEFT JOIN public.eligibility_results er
    ON er.wallet_address = am.wallet_address
   AND er.epoch_id = ce.id
   AND er.program = 'squad'
  GROUP BY am.recruiter_id
), active_member_counts AS (
  SELECT recruiter_id, count(*)::bigint AS active_member_count
  FROM active_memberships
  GROUP BY recruiter_id
), event_matches AS (
  SELECT
    l.recruiter_id,
    re.epoch_id,
    re.occurred_at,
    re.squad_amount
  FROM public.reward_events re
  JOIN public.wallet_recruiter_links l
    ON re.route_kind = 'trade'
   AND re.wallet_address IS NOT NULL
   AND l.wallet_address = re.wallet_address
   AND l.linked_at <= re.occurred_at
   AND (l.detached_at IS NULL OR l.detached_at > re.occurred_at)
  UNION ALL
  SELECT
    l.recruiter_id,
    re.epoch_id,
    re.occurred_at,
    re.squad_amount
  FROM public.reward_events re
  JOIN public.campaigns c
    ON re.route_kind = 'finalize'
   AND c.chain_id = re.chain_id
   AND c.campaign_address = re.campaign_address
  JOIN public.wallet_recruiter_links l
    ON l.wallet_address = lower(c.creator_address)
   AND l.linked_at <= re.occurred_at
   AND (l.detached_at IS NULL OR l.detached_at > re.occurred_at)
), event_totals AS (
  SELECT
    em.recruiter_id,
    count(*)::bigint AS routed_event_count,
    coalesce(sum(em.squad_amount), 0)::numeric(78,0) AS routed_squad_amount_total,
    coalesce(sum(em.squad_amount) FILTER (WHERE em.epoch_id = ce.id), 0)::numeric(78,0) AS current_epoch_routed_squad_amount,
    max(em.occurred_at) AS last_routed_at,
    ce.id AS current_epoch_id,
    ce.start_at AS current_epoch_start_at,
    ce.end_at AS current_epoch_end_at
  FROM event_matches em
  CROSS JOIN current_epoch ce
  GROUP BY em.recruiter_id, ce.id, ce.start_at, ce.end_at
)
SELECT
  r.id AS recruiter_id,
  r.wallet_address AS recruiter_wallet_address,
  r.code AS recruiter_code,
  r.display_name AS recruiter_display_name,
  r.is_og AS recruiter_is_og,
  r.status AS recruiter_status,
  coalesce(amc.active_member_count, 0)::bigint AS active_member_count,
  coalesce(ces.eligible_member_count, 0)::bigint AS eligible_member_count,
  coalesce(ces.total_eligible_score, 0)::numeric(78,0) AS total_eligible_score,
  coalesce(et.routed_event_count, 0)::bigint AS routed_event_count,
  coalesce(et.routed_squad_amount_total, 0)::numeric(78,0) AS routed_squad_amount_total,
  coalesce(et.current_epoch_routed_squad_amount, 0)::numeric(78,0) AS current_epoch_routed_squad_amount,
  coalesce(et.current_epoch_routed_squad_amount, 0)::numeric(78,0) AS estimated_pending_pool_amount,
  et.last_routed_at,
  et.current_epoch_id,
  et.current_epoch_start_at,
  et.current_epoch_end_at,
  now() AS materialized_at
FROM public.recruiters r
LEFT JOIN active_member_counts amc ON amc.recruiter_id = r.id
LEFT JOIN current_epoch_scores ces ON ces.recruiter_id = r.id
LEFT JOIN event_totals et ON et.recruiter_id = r.id;

CREATE OR REPLACE VIEW public.reward_admin_epoch_summaries AS
WITH ledger_totals AS (
  SELECT
    epoch_id,
    count(*)::bigint AS ledger_entry_count,
    count(*) FILTER (WHERE status = 'pending')::bigint AS ledger_pending_count,
    count(*) FILTER (WHERE status = 'claimable')::bigint AS ledger_claimable_count,
    count(*) FILTER (WHERE status = 'claimed')::bigint AS ledger_claimed_count,
    count(*) FILTER (WHERE status = 'expired')::bigint AS ledger_expired_count,
    count(*) FILTER (WHERE status = 'rolled_over')::bigint AS ledger_rolled_over_count,
    coalesce(sum(net_amount) FILTER (WHERE status = 'claimable'), 0)::numeric(78,0) AS ledger_claimable_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'claimed'), 0)::numeric(78,0) AS ledger_claimed_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'expired'), 0)::numeric(78,0) AS ledger_expired_amount,
    coalesce(sum(net_amount) FILTER (WHERE status = 'rolled_over'), 0)::numeric(78,0) AS ledger_rolled_over_amount
  FROM public.reward_ledger_entries
  GROUP BY epoch_id
), claim_totals AS (
  SELECT
    epoch_id,
    count(*) FILTER (WHERE status = 'recorded')::bigint AS claim_record_count,
    coalesce(sum(claimed_amount) FILTER (WHERE status = 'recorded'), 0)::numeric(78,0) AS claim_recorded_amount
  FROM public.claims
  GROUP BY epoch_id
), eligibility_totals AS (
  SELECT
    epoch_id,
    count(*)::bigint AS eligibility_result_count,
    count(*) FILTER (WHERE is_eligible)::bigint AS eligibility_eligible_count,
    count(*) FILTER (WHERE NOT is_eligible)::bigint AS eligibility_ineligible_count
  FROM public.eligibility_results
  GROUP BY epoch_id
), exclusion_totals AS (
  SELECT
    epoch_id,
    count(*) FILTER (WHERE severity = 'hard' AND resolved_at IS NULL)::bigint AS open_hard_flag_count,
    count(*) FILTER (WHERE severity = 'review' AND resolved_at IS NULL)::bigint AS open_review_flag_count,
    count(*)::bigint AS total_exclusion_flag_count
  FROM public.exclusion_flags
  GROUP BY epoch_id
)
SELECT
  ees.epoch_id,
  ees.chain_id,
  ees.epoch_type,
  ees.start_at,
  ees.end_at,
  ees.status,
  ees.reward_event_count,
  ees.raw_amount_total,
  ees.league_amount_total,
  ees.recruiter_amount_total,
  ees.airdrop_amount_total,
  ees.squad_amount_total,
  ees.protocol_amount_total,
  ees.first_reward_event_at,
  ees.last_reward_event_at,
  coalesce(lt.ledger_entry_count, 0)::bigint AS ledger_entry_count,
  coalesce(lt.ledger_pending_count, 0)::bigint AS ledger_pending_count,
  coalesce(lt.ledger_claimable_count, 0)::bigint AS ledger_claimable_count,
  coalesce(lt.ledger_claimed_count, 0)::bigint AS ledger_claimed_count,
  coalesce(lt.ledger_expired_count, 0)::bigint AS ledger_expired_count,
  coalesce(lt.ledger_rolled_over_count, 0)::bigint AS ledger_rolled_over_count,
  coalesce(lt.ledger_claimable_amount, 0)::numeric(78,0) AS ledger_claimable_amount,
  coalesce(lt.ledger_claimed_amount, 0)::numeric(78,0) AS ledger_claimed_amount,
  coalesce(lt.ledger_expired_amount, 0)::numeric(78,0) AS ledger_expired_amount,
  coalesce(lt.ledger_rolled_over_amount, 0)::numeric(78,0) AS ledger_rolled_over_amount,
  coalesce(ct.claim_record_count, 0)::bigint AS claim_record_count,
  coalesce(ct.claim_recorded_amount, 0)::numeric(78,0) AS claim_recorded_amount,
  coalesce(et.eligibility_result_count, 0)::bigint AS eligibility_result_count,
  coalesce(et.eligibility_eligible_count, 0)::bigint AS eligibility_eligible_count,
  coalesce(et.eligibility_ineligible_count, 0)::bigint AS eligibility_ineligible_count,
  coalesce(ext.open_hard_flag_count, 0)::bigint AS open_hard_flag_count,
  coalesce(ext.open_review_flag_count, 0)::bigint AS open_review_flag_count,
  coalesce(ext.total_exclusion_flag_count, 0)::bigint AS total_exclusion_flag_count,
  e.finalized_at,
  now() AS materialized_at
FROM public.reward_event_epoch_summaries ees
JOIN public.epochs e ON e.id = ees.epoch_id
LEFT JOIN ledger_totals lt ON lt.epoch_id = ees.epoch_id
LEFT JOIN claim_totals ct ON ct.epoch_id = ees.epoch_id
LEFT JOIN eligibility_totals et ON et.epoch_id = ees.epoch_id
LEFT JOIN exclusion_totals ext ON ext.epoch_id = ees.epoch_id;

COMMIT;
