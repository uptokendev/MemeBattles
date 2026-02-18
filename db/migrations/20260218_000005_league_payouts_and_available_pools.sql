-- =========================================
-- League payouts ledger + "available pool" support
--
-- Goal:
-- - Track payouts executed from the TreasuryVault/multisig so UI can show
--   *true remaining prize pools* that reconcile with the vault balance.
-- - Keep weekly/monthly accounting independent (payouts subtract only from
--   the matching period/category), while still using a single on-chain vault.
-- =========================================

begin;

-- 1) Payout ledger (one row per winner rank paid)
--
-- Primary key matches a unique winner slot for an epoch.
create table if not exists public.league_epoch_payouts (
  chain_id int not null,
  period text not null check (period in ('weekly','monthly')),
  epoch_start timestamptz not null,
  category text not null,
  rank int not null check (rank >= 1 and rank <= 5),
  recipient_address text not null,
  amount_raw numeric(78,0) not null default 0,
  tx_hash text null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (chain_id, period, epoch_start, category, rank)
);

create index if not exists league_epoch_payouts_idx_chain_period_epoch
  on public.league_epoch_payouts(chain_id, period, epoch_start);

create index if not exists league_epoch_payouts_idx_chain_tx
  on public.league_epoch_payouts(chain_id, tx_hash);

-- 2) Convenience view: paid totals per epoch+category
create or replace view public.league_epoch_paid_totals as
select
  chain_id,
  period,
  epoch_start,
  category,
  coalesce(sum(amount_raw),0)::numeric(78,0) as paid_raw,
  max(paid_at) as last_paid_at
from public.league_epoch_payouts
group by chain_id, period, epoch_start, category;

commit;
