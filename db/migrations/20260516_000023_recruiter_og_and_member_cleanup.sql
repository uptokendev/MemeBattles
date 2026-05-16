-- Pre-launch recruiter cleanup.
--
-- We have not launched full live deployment yet, so all existing recruiters are
-- treated as OG recruiters. This also fixes legacy coming-soon recruiters that
-- were mirrored with is_og = false by the first waitlist sync migration.
--
-- The previous frontend attribution flow could also create squad rows with
-- member_role = 'member' through a referral cookie before the user explicitly
-- chose Creator or Trader. Recruiter wallets themselves must never be added as
-- squad members via referral cookies, so this migration detaches those obvious
-- accidental self/recruiter-wallet links while preserving real creator/trader
-- rows and legacy migrated squad rows.

begin;

update public.recruiters
   set is_og = true,
       updated_at = now(),
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'prelaunchOgCleanupAt', now(),
         'prelaunchOg', true
       )
 where coalesce(is_og, false) = false;

-- Detach recruiter wallets accidentally added as squad members through the
-- referral-cookie/member fallback before role selection was enforced.
update public.wallet_squad_memberships s
   set is_active = false,
       left_at = coalesce(left_at, now()),
       leave_reason = coalesce(leave_reason, 'cleanup_recruiter_wallet_cookie_self_link'),
       updated_at = now()
  from public.recruiters r
 where s.is_active = true
   and lower(s.wallet_address) = lower(r.wallet_address)
   and coalesce(s.member_role, 'member') = 'member'
   and coalesce(s.link_source, '') in ('referral_cookie', 'recruiter', '');

update public.wallet_recruiter_links l
   set is_active = false,
       detached_at = coalesce(detached_at, now()),
       detach_reason = coalesce(detach_reason, 'cleanup_recruiter_wallet_cookie_self_link'),
       updated_at = now()
  from public.recruiters r
 where l.is_active = true
   and lower(l.wallet_address) = lower(r.wallet_address)
   and coalesce(l.link_source, '') in ('referral_cookie', 'manual', 'admin_override', 'migration');

comment on table public.recruiters is
  'Recruiters are pre-launch OG by default until full live deployment rules change.';

commit;
