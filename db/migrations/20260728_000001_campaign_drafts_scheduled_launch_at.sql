-- Version the scheduled draft launch timestamp already applied to the live database.
-- Safe to run repeatedly across restored and secondary environments.

alter table if exists public.campaign_drafts
  add column if not exists scheduled_launch_at timestamptz;

create index if not exists campaign_drafts_scheduled_launch_at_idx
  on public.campaign_drafts (scheduled_launch_at)
  where scheduled_launch_at is not null;
