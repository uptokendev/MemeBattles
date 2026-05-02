-- Prepare Mode / Draft Campaign foundation
-- Adds draft token creation, promotion pages, draft engagement, and metrics.

create extension if not exists pgcrypto;

create table if not exists public.campaign_drafts (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null default 97,
  creator_wallet text not null,
  name text not null,
  ticker text not null,
  description text,
  category text not null default 'meme',
  logo_url text,
  website_url text,
  x_url text,
  other_url text,
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft', 'promotion_published', 'ready_to_launch', 'deployed', 'archived')),
  visibility text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  campaign_address text,
  token_address text,
  deploy_tx_hash text,
  archived_at timestamptz,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists campaign_drafts_active_ticker_uidx
  on public.campaign_drafts (chain_id, lower(ticker))
  where status <> 'archived';

create index if not exists campaign_drafts_creator_idx
  on public.campaign_drafts (creator_wallet, created_at desc);

create index if not exists campaign_drafts_public_idx
  on public.campaign_drafts (visibility, status, created_at desc);

create table if not exists public.campaign_draft_promotion (
  draft_id uuid primary key references public.campaign_drafts(id) on delete cascade,
  mission_statement text not null default '',
  roadmap jsonb not null default '[]'::jsonb,
  launch_strategy text not null default '',
  telegram_url text not null default '',
  discord_url text not null default '',
  x_url text not null default '',
  website_url text not null default '',
  docs jsonb not null default '[]'::jsonb,
  creator_note text not null default '',
  banner_url text not null default '',
  share_message text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_draft_follows (
  draft_id uuid not null references public.campaign_drafts(id) on delete cascade,
  wallet_address text not null,
  created_at timestamptz not null default now(),
  primary key (draft_id, wallet_address)
);

create index if not exists campaign_draft_follows_wallet_idx
  on public.campaign_draft_follows (wallet_address, created_at desc);

create table if not exists public.campaign_draft_comments (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.campaign_drafts(id) on delete cascade,
  wallet_address text not null,
  body text not null,
  parent_comment_id uuid references public.campaign_draft_comments(id) on delete cascade,
  reaction_count integer not null default 0,
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden', 'flagged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_draft_comments_draft_idx
  on public.campaign_draft_comments (draft_id, created_at desc);

create table if not exists public.campaign_draft_reactions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.campaign_drafts(id) on delete cascade,
  comment_id uuid references public.campaign_draft_comments(id) on delete cascade,
  wallet_address text not null,
  reaction_type text not null default 'upvote',
  created_at timestamptz not null default now(),
  unique (draft_id, comment_id, wallet_address, reaction_type)
);

create table if not exists public.campaign_draft_metrics (
  draft_id uuid primary key references public.campaign_drafts(id) on delete cascade,
  views integer not null default 0,
  follows integer not null default 0,
  comments integer not null default 0,
  reactions integer not null default 0,
  shares integer not null default 0,
  signed_actions integer not null default 0,
  popularity_percentage integer not null default 0,
  heat_label text not null default 'Cold',
  ranking_score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prepare_mode_notifications (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  event_type text not null,
  target_type text not null default 'draft',
  target_id text not null,
  title text not null,
  body text not null default '',
  is_read boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists prepare_mode_notifications_wallet_idx
  on public.prepare_mode_notifications (wallet_address, is_read, created_at desc);
