-- Phase 8: Token metadata registry.
-- Stores stable public metadata URLs and mirrors for launchpad/indexer use.

create table if not exists public.token_metadata_registry (
  id bigserial primary key,
  chain_id integer not null,
  campaign_address text,
  token_address text,
  creator_address text,
  name text,
  symbol text,
  description text,
  logo_uri text,
  metadata_uri text,
  external_url text,
  website text,
  x_account text,
  telegram text,
  discord text,
  source text not null default 'memewarzone',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint token_metadata_registry_campaign_check check (campaign_address is null or campaign_address ~* '^0x[0-9a-f]{40}$'),
  constraint token_metadata_registry_token_check check (token_address is null or token_address ~* '^0x[0-9a-f]{40}$'),
  constraint token_metadata_registry_creator_check check (creator_address is null or creator_address ~* '^0x[0-9a-f]{40}$'),
  constraint token_metadata_registry_has_address check (campaign_address is not null or token_address is not null)
);

create unique index if not exists token_metadata_registry_campaign_uidx
  on public.token_metadata_registry (chain_id, lower(campaign_address))
  where campaign_address is not null;

create unique index if not exists token_metadata_registry_token_uidx
  on public.token_metadata_registry (chain_id, lower(token_address))
  where token_address is not null;

create index if not exists token_metadata_registry_symbol_idx
  on public.token_metadata_registry (chain_id, lower(symbol));

create or replace function public.touch_token_metadata_registry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists token_metadata_registry_touch_updated_at on public.token_metadata_registry;
create trigger token_metadata_registry_touch_updated_at
before update on public.token_metadata_registry
for each row execute function public.touch_token_metadata_registry_updated_at();
