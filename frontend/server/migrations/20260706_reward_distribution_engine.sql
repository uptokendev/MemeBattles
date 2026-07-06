-- Generic Reward Distribution Engine.
-- Airdrops use this first, but league, tournament, recruiter, squad, and campaign rewards can plug in later.

create table if not exists public.reward_distribution_batches (
  id bigserial primary key,
  batch_key text not null unique,
  reward_type text not null check (reward_type in ('airdrop', 'league', 'tournament', 'battle', 'recruiter', 'squad', 'campaign', 'manual')),
  source_table text,
  source_id text,
  chain_id integer not null,
  token_symbol text not null default 'BNB',
  status text not null default 'draft' check (status in ('draft', 'computed', 'review_required', 'published', 'claim_open', 'closed', 'blocked', 'failed')),
  total_amount_raw numeric(78,0) not null default 0,
  recipient_count integer not null default 0,
  merkle_root text,
  contract_address text,
  metadata_json jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  claims_open_at timestamptz,
  claims_close_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_ledger_entries (
  id bigserial primary key,
  batch_id bigint references public.reward_distribution_batches(id) on delete set null,
  reward_key text not null unique,
  reward_type text not null check (reward_type in ('airdrop', 'league', 'tournament', 'battle', 'recruiter', 'squad', 'campaign', 'manual')),
  source_table text,
  source_id text,
  chain_id integer not null,
  token_symbol text not null default 'BNB',
  wallet_address text not null,
  role text,
  amount_raw numeric(78,0) not null,
  status text not null default 'claimable' check (status in ('draft', 'claimable', 'submitted', 'claimed', 'failed', 'expired', 'cancelled')),
  merkle_index integer,
  merkle_proof jsonb not null default '[]'::jsonb,
  claim_payload jsonb not null default '{}'::jsonb,
  tx_hash text,
  error text,
  metadata_json jsonb not null default '{}'::jsonb,
  claimable_at timestamptz,
  submitted_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_distribution_events (
  id bigserial primary key,
  batch_id bigint references public.reward_distribution_batches(id) on delete set null,
  ledger_entry_id bigint references public.reward_ledger_entries(id) on delete set null,
  event_type text not null,
  actor_type text not null default 'system' check (actor_type in ('system', 'admin', 'user', 'contract')),
  actor_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists reward_distribution_batches_type_status_idx on public.reward_distribution_batches(reward_type, status, created_at desc);
create index if not exists reward_distribution_batches_chain_status_idx on public.reward_distribution_batches(chain_id, status, created_at desc);
create index if not exists reward_ledger_wallet_status_idx on public.reward_ledger_entries(lower(wallet_address), status, created_at desc);
create index if not exists reward_ledger_batch_idx on public.reward_ledger_entries(batch_id, status, id);
create index if not exists reward_ledger_source_idx on public.reward_ledger_entries(source_table, source_id);
create index if not exists reward_distribution_events_batch_idx on public.reward_distribution_events(batch_id, created_at desc);
create index if not exists reward_distribution_events_entry_idx on public.reward_distribution_events(ledger_entry_id, created_at desc);

create or replace function public.reward_log_event(
  p_batch_id bigint,
  p_ledger_entry_id bigint,
  p_event_type text,
  p_actor_type text default 'system',
  p_actor_id text default null,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_reason text default null,
  p_tx_hash text default null
)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  insert into public.reward_distribution_events (
    batch_id,
    ledger_entry_id,
    event_type,
    actor_type,
    actor_id,
    old_value,
    new_value,
    reason,
    tx_hash
  ) values (
    p_batch_id,
    p_ledger_entry_id,
    p_event_type,
    coalesce(p_actor_type, 'system'),
    p_actor_id,
    p_old_value,
    p_new_value,
    p_reason,
    p_tx_hash
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.reward_sync_airdrop_epoch(p_epoch_id bigint)
returns table(batch_id bigint, ledger_count integer, total_amount_raw numeric)
language plpgsql
as $$
declare
  v_epoch public.airdrop_epochs%rowtype;
  v_batch_id bigint;
  v_ledger_count integer := 0;
  v_total_amount numeric(78,0) := 0;
begin
  select * into v_epoch
    from public.airdrop_epochs
   where id = p_epoch_id;

  if not found then
    raise exception 'airdrop epoch % not found', p_epoch_id;
  end if;

  insert into public.reward_distribution_batches (
    batch_key,
    reward_type,
    source_table,
    source_id,
    chain_id,
    token_symbol,
    status,
    total_amount_raw,
    recipient_count,
    merkle_root,
    contract_address,
    metadata_json,
    published_at,
    claims_open_at,
    claims_close_at,
    updated_at
  )
  select 'airdrop_epoch:' || v_epoch.id::text,
         'airdrop',
         'airdrop_epochs',
         v_epoch.id::text,
         v_epoch.chain_id,
         v_epoch.token_symbol,
         case
           when v_epoch.status = 'claim_open' then 'claim_open'
           when v_epoch.status in ('drop_complete', 'closed') then 'published'
           when v_epoch.status = 'ready' then 'computed'
           else 'draft'
         end,
         coalesce(sum(w.amount_raw), 0)::numeric(78,0),
         count(w.id)::integer,
         v_epoch.merkle_root,
         v_epoch.contract_address,
         jsonb_build_object('epochLabel', v_epoch.epoch_label, 'scoringVersion', v_epoch.scoring_version, 'automationMode', v_epoch.automation_mode),
         v_epoch.published_at,
         v_epoch.claims_open_at,
         v_epoch.claims_close_at,
         now()
    from public.airdrop_winners w
   where w.epoch_id = v_epoch.id
  on conflict (batch_key) do update set
    status = excluded.status,
    total_amount_raw = excluded.total_amount_raw,
    recipient_count = excluded.recipient_count,
    merkle_root = excluded.merkle_root,
    contract_address = excluded.contract_address,
    metadata_json = excluded.metadata_json,
    published_at = excluded.published_at,
    claims_open_at = excluded.claims_open_at,
    claims_close_at = excluded.claims_close_at,
    updated_at = now()
  returning id into v_batch_id;

  insert into public.reward_ledger_entries (
    batch_id,
    reward_key,
    reward_type,
    source_table,
    source_id,
    chain_id,
    token_symbol,
    wallet_address,
    role,
    amount_raw,
    status,
    merkle_index,
    merkle_proof,
    claim_payload,
    tx_hash,
    metadata_json,
    claimable_at,
    submitted_at,
    claimed_at,
    expires_at,
    updated_at
  )
  select v_batch_id,
         'airdrop_winner:' || w.id::text,
         'airdrop',
         'airdrop_winners',
         w.id::text,
         v_epoch.chain_id,
         v_epoch.token_symbol,
         w.wallet_address,
         w.role,
         w.amount_raw,
         coalesce(c.status, case when v_epoch.status = 'claim_open' then 'claimable' else 'draft' end),
         w.merkle_index,
         w.merkle_proof,
         coalesce(c.claim_payload, '{}'::jsonb),
         c.tx_hash,
         jsonb_build_object(
           'epochId', v_epoch.id,
           'epochLabel', v_epoch.epoch_label,
           'winnerRank', w.winner_rank,
           'weightTier', w.weight_tier,
           'weightValue', w.weight_value,
           'activityScore', w.activity_score,
           'airdropWinnerId', w.id
         ) || coalesce(w.metadata_json, '{}'::jsonb),
         v_epoch.claims_open_at,
         c.submitted_at,
         c.claimed_at,
         v_epoch.claims_close_at,
         now()
    from public.airdrop_winners w
    left join public.airdrop_claims c on c.winner_id = w.id
   where w.epoch_id = v_epoch.id
  on conflict (reward_key) do update set
    batch_id = excluded.batch_id,
    amount_raw = excluded.amount_raw,
    status = excluded.status,
    merkle_index = excluded.merkle_index,
    merkle_proof = excluded.merkle_proof,
    claim_payload = excluded.claim_payload,
    tx_hash = excluded.tx_hash,
    metadata_json = excluded.metadata_json,
    claimable_at = excluded.claimable_at,
    submitted_at = excluded.submitted_at,
    claimed_at = excluded.claimed_at,
    expires_at = excluded.expires_at,
    updated_at = now();

  select count(*)::integer, coalesce(sum(amount_raw), 0)::numeric(78,0)
    into v_ledger_count, v_total_amount
    from public.reward_ledger_entries
   where batch_id = v_batch_id;

  perform public.reward_log_event(v_batch_id, null, 'airdrop_epoch_synced', 'system', null, null, jsonb_build_object('epochId', p_epoch_id, 'ledgerCount', v_ledger_count, 'totalAmountRaw', v_total_amount), 'Synced airdrop winners into generic reward ledger', null);

  return query select v_batch_id, v_ledger_count, v_total_amount;
end;
$$;
