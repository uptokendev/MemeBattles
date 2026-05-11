-- Adds recruiter squad recognition image support for Command Center.
-- Import this in Supabase before enabling the recruiter portal setSquadImage action.

alter table public.recruiter_waitlist
add column if not exists squad_image_url text;

alter table public.recruiter_waitlist
drop constraint if exists recruiter_waitlist_squad_image_url_check;

alter table public.recruiter_waitlist
add constraint recruiter_waitlist_squad_image_url_check
check (
  squad_image_url is null
  or squad_image_url = ''
  or squad_image_url ~* '^https?://'
  or squad_image_url ~* '^ipfs://'
);

comment on column public.recruiter_waitlist.squad_image_url is
'Squad recognition image URL set by approved recruiters from Command Center / recruiter portal.';
