create table if not exists public.airdrop_epochs (
  id bigserial primary key,
  epoch_label text not null,
  chain_id integer not null,
  token_symbol text not null default 'BNB',
  prize_pool_amount numeric(78,0) not null default 0,
  prize_pool_usd numeric(20,2),
  status text not null default 'funding' check (status in ('funding', 'ready', 'drop_complete', 'claim_open', 'closed')),
  starts_at timestamptz,
  ends_at timestamptz,
  next_drop_at timestamptz,
  published_at timestamptz,
  claims_open_at timestamptz,
  claims_close_at timestamptz,
  merkle_root text,
  contract_address text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.airdrop_candidates (
  id bigserial primary key,
  epoch_id bigint not null references public.airdrop_epochs(id) on delete cascade,
  wallet_address text not null,
  role text not null check (role in ('creator', 'trader')),
  is_eligible boolean not null default false,
  reason_codes text[] not null default '{}',
  activity_score numeric(30,8) not null default 0,
  smaller_user_score numeric(30,8) not null default 0,
  whale_penalty numeric(30,8) not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (epoch_id, wallet_address, role)
);

create table if not exists public.airdrop_winners (
  id bigserial primary key,
  epoch_id bigint not null references public.airdrop_epochs(id) on delete cascade,
  candidate_id bigint references public.airdrop_candidates(id) on delete set null,
  wallet_address text not null,
  role text not null check (role in ('creator', 'trader')),
  winner_rank integer not null,
  weight_tier integer not null default 0,
  weight_value numeric(30,8) not null default 0,
  activity_score numeric(30,8) not null default 0,
  amount_raw numeric(78,0) not null,
  merkle_index integer,
  merkle_proof jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (epoch_id, wallet_address),
  unique (epoch_id, winner_rank)
);

create table if not exists public.airdrop_claims (
  id bigserial primary key,
  winner_id bigint not null references public.airdrop_winners(id) on delete cascade,
  wallet_address text not null,
  chain_id integer not null,
  status text not null default 'claimable' check (status in ('claimable', 'submitted', 'claimed', 'failed', 'expired')),
  tx_hash text,
  error text,
  claim_payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (winner_id)
);

create table if not exists public.airdrop_admin_reviews (
  id bigserial primary key,
  epoch_id bigint references public.airdrop_epochs(id) on delete set null,
  admin_email text,
  action text not null,
  target text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists airdrop_epochs_chain_status_idx on public.airdrop_epochs(chain_id, status, starts_at desc);
create index if not exists airdrop_epochs_created_at_idx on public.airdrop_epochs(created_at desc);
create index if not exists airdrop_candidates_wallet_idx on public.airdrop_candidates(lower(wallet_address));
create index if not exists airdrop_candidates_epoch_role_idx on public.airdrop_candidates(epoch_id, role, is_eligible);
create index if not exists airdrop_winners_wallet_idx on public.airdrop_winners(lower(wallet_address));
create index if not exists airdrop_winners_epoch_rank_idx on public.airdrop_winners(epoch_id, winner_rank);
create index if not exists airdrop_claims_wallet_status_idx on public.airdrop_claims(lower(wallet_address), status);
create index if not exists airdrop_claims_chain_status_idx on public.airdrop_claims(chain_id, status);
create index if not exists airdrop_admin_reviews_epoch_idx on public.airdrop_admin_reviews(epoch_id, created_at desc);
