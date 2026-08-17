-- Explicitly scope Solana recruiter accounting to production (101) or isolated devnet certification (102).
-- Historical Solana rows are intentionally left NULL because their original network cannot be proven safely.

alter table public.recruiter_reward_ledger
  add column if not exists chain_id integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'recruiter_reward_ledger_solana_chain_id_check'
       and conrelid = 'public.recruiter_reward_ledger'::regclass
  ) then
    alter table public.recruiter_reward_ledger
      add constraint recruiter_reward_ledger_solana_chain_id_check
      check (
        chain_id is null
        or (chain = 'solana' and chain_id in (101, 102))
      );
  end if;
end
$$;

create index if not exists idx_recruiter_reward_ledger_solana_chain_scope
  on public.recruiter_reward_ledger (chain_id, recruiter_id, status)
  where chain = 'solana';

create or replace function public.recruiter_reward_ledger_default_solana_chain_id()
returns trigger
language plpgsql
as $$
begin
  if new.chain = 'solana' and new.chain_id is null then
    new.chain_id := 101;
  end if;
  return new;
end;
$$;

drop trigger if exists recruiter_reward_ledger_default_solana_chain_id
  on public.recruiter_reward_ledger;

create trigger recruiter_reward_ledger_default_solana_chain_id
before insert on public.recruiter_reward_ledger
for each row
execute function public.recruiter_reward_ledger_default_solana_chain_id();

comment on column public.recruiter_reward_ledger.chain_id is
  'Explicit Solana reward rail chain scope: 101=production/mainnet, 102=isolated devnet certification. Historical ambiguous Solana rows remain NULL and are excluded from chain-scoped publication.';
