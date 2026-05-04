-- Prepare Mode lifecycle update
-- Allows published pre-launch campaigns to move into a scheduled state before deployment.

alter table if exists public.campaign_drafts
  drop constraint if exists campaign_drafts_status_check;

alter table if exists public.campaign_drafts
  add constraint campaign_drafts_status_check
  check (status in ('draft', 'promotion_published', 'ready_to_launch', 'scheduled', 'deployed', 'archived'));
