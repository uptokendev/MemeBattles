-- Mirror approved recruiter_waitlist rows into public.recruiters.
--
-- Context: the admin approval funnel lives in public.recruiter_waitlist
-- (status = 'approved'), but the entire app — signup status checks, rewards
-- attribution, eligibility, ledger — reads from public.recruiters. Without
-- this mirror, approved recruiters from the waitlist are invisible to the app.
--
-- This migration does two things:
--   1. One-time backfill of currently approved waitlist rows.
--   2. AFTER INSERT/UPDATE trigger on recruiter_waitlist that upserts on
--      transitions into (status = 'approved' AND recruiter_code present).
--
-- Notes:
--   * recruiters.code is NOT NULL; waitlist rows without recruiter_code are
--     intentionally skipped. Admin must set the code before the row syncs.
--   * Conflict policy is DO NOTHING on (wallet_address). If a recruiter row
--     already exists (e.g. created via the app's direct signup), it stays
--     authoritative; the trigger won't overwrite it.
--   * Code uniqueness is enforced by recruiters_code_ci_uidx. The backfill
--     dedupes by code, and the trigger wraps the insert to swallow code
--     collisions so a malformed approval can never block the waitlist UPDATE.

begin;

-- One-time backfill ---------------------------------------------------------
-- Dedupe by (lower) recruiter_code first so the second-write-wins case is
-- deterministic: oldest approved wins, with id as a stable tiebreaker.
with ranked as (
  select
    lower(w.wallet_address) as wallet_address,
    lower(w.recruiter_code) as code,
    w.name as display_name,
    w.squad_image_url,
    coalesce(w.approved_at, w.created_at) as created_at,
    jsonb_build_object(
      'source', 'recruiter_waitlist',
      'waitlistId', w.id,
      'signup', jsonb_build_object(
        'email', w.email,
        'telegram', w.telegram_handle,
        'xHandle', w.x_handle,
        'source', w.source,
        'approvedAt', w.approved_at,
        'focus', w.focus,
        'languages', w.languages,
        'countryRegion', w.country_region,
        'consentText', w.consent_text
      )
    ) as metadata,
    row_number() over (
      partition by lower(w.recruiter_code)
      order by w.approved_at nulls last, w.id
    ) as rn_code
  from public.recruiter_waitlist w
  where w.status = 'approved'
    and w.recruiter_code is not null
    and length(trim(w.recruiter_code)) > 0
    and w.wallet_address is not null
    and length(trim(w.wallet_address)) > 0
)
insert into public.recruiters (
  wallet_address,
  code,
  display_name,
  is_og,
  status,
  metadata,
  squad_image_url,
  created_at,
  updated_at
)
select
  wallet_address,
  code,
  display_name,
  false,
  'active',
  metadata,
  squad_image_url,
  created_at,
  now()
from ranked
where rn_code = 1
on conflict (wallet_address) do nothing;

-- Trigger function ----------------------------------------------------------
create or replace function public.sync_recruiter_from_waitlist()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved'
     and new.recruiter_code is not null
     and length(trim(new.recruiter_code)) > 0
     and new.wallet_address is not null
     and length(trim(new.wallet_address)) > 0
  then
    begin
      insert into public.recruiters (
        wallet_address,
        code,
        display_name,
        is_og,
        status,
        metadata,
        squad_image_url,
        created_at,
        updated_at
      )
      values (
        lower(new.wallet_address),
        lower(new.recruiter_code),
        new.name,
        false,
        'active',
        jsonb_build_object(
          'source', 'recruiter_waitlist',
          'waitlistId', new.id,
          'signup', jsonb_build_object(
            'email', new.email,
            'telegram', new.telegram_handle,
            'xHandle', new.x_handle,
            'source', new.source,
            'approvedAt', new.approved_at,
            'focus', new.focus,
            'languages', new.languages,
            'countryRegion', new.country_region,
            'consentText', new.consent_text
          )
        ),
        new.squad_image_url,
        coalesce(new.approved_at, new.created_at, now()),
        now()
      )
      on conflict (wallet_address) do nothing;
    exception
      when unique_violation then
        -- Most likely a code collision (recruiters_code_ci_uidx). Don't fail
        -- the waitlist UPDATE; leave the row unmirrored for admin to retry.
        raise notice
          'sync_recruiter_from_waitlist: skipped waitlist id=% wallet=% code=% due to %',
          new.id, new.wallet_address, new.recruiter_code, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists recruiter_waitlist_sync_trg on public.recruiter_waitlist;

create trigger recruiter_waitlist_sync_trg
after insert or update of status, recruiter_code, wallet_address, name, squad_image_url
on public.recruiter_waitlist
for each row
execute function public.sync_recruiter_from_waitlist();

comment on function public.sync_recruiter_from_waitlist() is
  'Mirrors approved recruiter_waitlist rows into public.recruiters. App reads only from recruiters; waitlist remains the admin approval funnel. Conflicts on wallet_address or code are no-ops.';

commit;
