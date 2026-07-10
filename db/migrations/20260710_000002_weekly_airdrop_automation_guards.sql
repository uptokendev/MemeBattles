-- Database-level idempotency guards for automated weekly airdrops.
-- The scheduler also uses a PostgreSQL advisory lock, but these indexes remain the
-- final protection against duplicate epoch/program batches or duplicate ledger rows.

begin;

create unique index if not exists reward_batches_unique_weekly_airdrop_epoch_program
  on public.reward_batches (
    chain,
    (metadata ->> 'epochId'),
    (metadata ->> 'program')
  )
  where reward_type = 'airdrop'
    and status <> 'archived'
    and metadata ? 'epochId'
    and metadata ? 'program';

create unique index if not exists reward_ledger_unique_weekly_airdrop_source
  on public.reward_ledger (chain, reward_type, source_id)
  where reward_type = 'airdrop'
    and source_label = 'weekly_airdrop_scheduler'
    and source_id is not null;

create index if not exists reward_batches_weekly_airdrop_status_idx
  on public.reward_batches (
    chain,
    (metadata ->> 'epochId'),
    (metadata ->> 'program'),
    status
  )
  where reward_type = 'airdrop';

commit;
