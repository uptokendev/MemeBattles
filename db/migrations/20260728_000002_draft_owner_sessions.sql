-- Server-issued Prepare Mode owner sessions.
-- Only a SHA-256 hash of each bearer token is stored. Raw session tokens stay client-side.

create table if not exists public.draft_owner_sessions (
  token_hash text primary key,
  draft_id text not null,
  chain_id integer not null,
  wallet_address text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint draft_owner_sessions_token_hash_length check (length(token_hash) = 64)
);

create index if not exists draft_owner_sessions_scope_idx
  on public.draft_owner_sessions (draft_id, chain_id, wallet_address, expires_at desc)
  where revoked_at is null;

create index if not exists draft_owner_sessions_expiry_idx
  on public.draft_owner_sessions (expires_at)
  where revoked_at is null;

alter table public.draft_owner_sessions enable row level security;

-- These records are backend credentials and must never be readable through public Supabase roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.draft_owner_sessions from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.draft_owner_sessions from authenticated;
  end if;
end
$$;
