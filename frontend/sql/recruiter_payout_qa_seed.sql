-- Optional QA seed for recruiter native payout drills.
-- Run only on local/dev/test databases. Do not run on production.
-- It creates one recruiter with both BNB and Solana payout wallets,
-- claimable and pending native ledger rows, and one created claim request.

create extension if not exists pgcrypto;

with recruiter as (
  insert into public.recruiter_accounts (signup_wallet, code, display_name, total_estimated_usd, status)
  values ('0x1111111111111111111111111111111111111111', 'QA-RECRUITER', 'QA Recruiter', 842.12, 'active')
  on conflict (code) do update
    set display_name = excluded.display_name,
        total_estimated_usd = excluded.total_estimated_usd,
        updated_at = now()
  returning recruiter_id
), wallets as (
  insert into public.recruiter_payout_wallets (recruiter_id, chain, wallet_address, verified_at, verification_message)
  select recruiter_id, 'bnb', '0x2222222222222222222222222222222222222222', now(), 'QA verified BNB payout wallet'
    from recruiter
  union all
  select recruiter_id, 'solana', 'So11111111111111111111111111111111111111112', now(), 'QA verified Solana payout wallet'
    from recruiter
  on conflict (recruiter_id, chain, wallet_address) do update
    set verified_at = excluded.verified_at,
        verification_message = excluded.verification_message,
        updated_at = now()
), fee_events as (
  insert into public.recruiter_fee_events (
    recruiter_id, trader_wallet, source_chain, fee_token, raw_fee_amount,
    recruiter_share_raw, tx_hash, finality_status, claim_status, metadata
  )
  select recruiter_id, '0x3333333333333333333333333333333333333333', 'bnb', 'BNB',
         500000000000000000, 1500000000000000, '0xqa-bnb-fee-event-1', 'confirmed', 'claimable', '{"qa":true}'::jsonb
    from recruiter
  union all
  select recruiter_id, 'So22222222222222222222222222222222222222222', 'solana', 'SOL',
         1000000000, 3000000, 'qa-sol-fee-event-1', 'confirmed', 'claimable', '{"qa":true}'::jsonb
    from recruiter
  union all
  select recruiter_id, '0x4444444444444444444444444444444444444444', 'bnb', 'BNB',
         200000000000000000, 600000000000000, '0xqa-bnb-fee-event-2', 'pending', 'pending', '{"qa":true}'::jsonb
    from recruiter
  on conflict (source_chain, tx_hash, recruiter_id) do update
    set raw_fee_amount = excluded.raw_fee_amount,
        recruiter_share_raw = excluded.recruiter_share_raw,
        finality_status = excluded.finality_status,
        claim_status = excluded.claim_status,
        updated_at = now()
  returning id, recruiter_id, source_chain, fee_token, recruiter_share_raw, claim_status
), clear_qa_ledger as (
  delete from public.recruiter_reward_ledger l
  using recruiter r
  where l.recruiter_id = r.recruiter_id
    and l.metadata ->> 'qa' = 'true'
  returning l.id
), ledger_rows as (
  insert into public.recruiter_reward_ledger (recruiter_id, chain, token, amount_raw, status, source_event_id, metadata)
  select recruiter_id,
         source_chain,
         fee_token,
         recruiter_share_raw,
         case when claim_status = 'claimable' then 'claimable' else 'pending_finality' end,
         id,
         '{"qa":true}'::jsonb
    from fee_events
  returning id, recruiter_id, chain, token, amount_raw, status
), bnb_claim as (
  insert into public.recruiter_reward_claims (recruiter_id, chain, token, amount_raw, payout_wallet, status)
  select recruiter_id, 'bnb', 'BNB', 1500000000000000, '0x2222222222222222222222222222222222222222', 'created'
    from recruiter
  returning id, recruiter_id
)
update public.recruiter_reward_ledger l
   set status = 'created',
       claim_id = c.id,
       updated_at = now()
  from bnb_claim c
 where l.recruiter_id = c.recruiter_id
   and l.chain = 'bnb'
   and l.token = 'BNB'
   and l.amount_raw = 1500000000000000
   and l.metadata ->> 'qa' = 'true';

select 'QA recruiter payout seed complete' as status;
