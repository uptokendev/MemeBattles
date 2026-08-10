-- Allow $6 test graduation target on Solana product chains (101/102), not only BSC testnet (97).
-- Previously:
--   graduation_target_wei = 6e18 was only legal when chain_id = 97
-- That caused Solana draft create to fail with:
--   campaign_drafts_graduation_target_check (SQLSTATE 23514)

begin;

alter table public.campaign_drafts
  drop constraint if exists campaign_drafts_graduation_target_check;

alter table public.campaign_drafts
  add constraint campaign_drafts_graduation_target_check
  check (
    graduation_target_wei in (
      6000000000000000000,
      15000000000000000000000,
      30000000000000000000000,
      50000000000000000000000
    )
    and (
      graduation_target_wei <> 6000000000000000000
      or chain_id in (97, 101, 102)
    )
  );

comment on constraint campaign_drafts_graduation_target_check on public.campaign_drafts is
  'Allowed graduation USD-wad targets. $6 (6e18) is test-only for BNB testnet (97) and Solana (101/102).';

commit;
