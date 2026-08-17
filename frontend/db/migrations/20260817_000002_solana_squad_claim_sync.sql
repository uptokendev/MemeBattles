-- Keep the backend-only Solana Squad settlement companion row synchronized with
-- the canonical reward_ledger lifecycle, and backfill the proof metadata used by
-- the generic Command Center claim path.

update public.reward_ledger rl
   set metadata = coalesce(rl.metadata, '{}'::jsonb) || jsonb_build_object(
     'solanaRewardLane',
     jsonb_build_object(
       'lane', src.lane,
       'epochId', lane_batch.epoch_id::text,
       'proof', src.merkle_proof
     )
   ),
       updated_at = now()
  from public.solana_reward_lane_claims src
  join public.solana_reward_lane_batches lane_batch on lane_batch.id = src.batch_id
 where src.lane = 'squad'
   and src.source_type = 'reward_ledger'
   and src.source_ref = rl.id::text
   and rl.reward_type = 'squad';

create or replace function public.sync_solana_squad_lane_claim_from_reward_ledger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reward_type <> 'squad' then
    return new;
  end if;

  if new.status = 'claim_pending' then
    update public.solana_reward_lane_claims
       set status = 'claim_pending',
           error = null,
           updated_at = now()
     where lane = 'squad'
       and source_type = 'reward_ledger'
       and source_ref = new.id::text
       and status in ('prepared', 'claimable', 'failed', 'claim_pending');
  elsif new.status = 'claimed' then
    update public.solana_reward_lane_claims
       set status = 'claimed',
           tx_hash = new.claim_tx_hash,
           error = null,
           claimed_at = coalesce(new.claimed_at, claimed_at, now()),
           updated_at = now()
     where lane = 'squad'
       and source_type = 'reward_ledger'
       and source_ref = new.id::text
       and status <> 'claimed';
  elsif new.status = 'failed' then
    update public.solana_reward_lane_claims
       set status = 'claimable',
           error = new.claim_error,
           updated_at = now()
     where lane = 'squad'
       and source_type = 'reward_ledger'
       and source_ref = new.id::text
       and status in ('prepared', 'claimable', 'claim_pending', 'failed');
  elsif new.status = 'claimable' then
    update public.solana_reward_lane_claims
       set status = 'claimable',
           error = null,
           updated_at = now()
     where lane = 'squad'
       and source_type = 'reward_ledger'
       and source_ref = new.id::text
       and status in ('prepared', 'claimable', 'claim_pending', 'failed');
  elsif new.status = 'expired' then
    update public.solana_reward_lane_claims
       set status = 'expired',
           updated_at = now()
     where lane = 'squad'
       and source_type = 'reward_ledger'
       and source_ref = new.id::text
       and status <> 'claimed';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_solana_squad_lane_claim_from_reward_ledger() from public;

drop trigger if exists trg_sync_solana_squad_lane_claim_from_reward_ledger on public.reward_ledger;
create trigger trg_sync_solana_squad_lane_claim_from_reward_ledger
after update of status, claim_tx_hash, claim_error, claimed_at on public.reward_ledger
for each row
when (
  old.status is distinct from new.status
  or old.claim_tx_hash is distinct from new.claim_tx_hash
  or old.claim_error is distinct from new.claim_error
  or old.claimed_at is distinct from new.claimed_at
)
execute function public.sync_solana_squad_lane_claim_from_reward_ledger();
