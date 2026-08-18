-- Launch financial safety: one deterministic entitlement per reward type/chain/source.
-- Existing rows were checked for duplicates before this migration was applied.
create unique index if not exists uq_reward_ledger_source_entitlement
  on public.reward_ledger (reward_type, chain, source_id)
  where source_id is not null;
