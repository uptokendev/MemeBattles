-- Backfill legacy coming-soon recruiter squads into canonical attribution tables.
--
-- Context:
--   The old coming-soon recruiter portal stored approved recruiters in
--   public.recruiter_waitlist and bound creator/trader squad members in
--   public.ref_wallets.
--
--   Migration 20260512_000021 mirrors approved recruiter_waitlist rows into
--   public.recruiters, but it does not move the old team roster from
--   ref_wallets. That leaves migrated recruiters visible in the new app while
--   their old squad/team appears empty.
--
-- This migration:
--   1. Adds lightweight roster metadata to wallet_squad_memberships so we can
--      preserve legacy role/source values for recruiter dashboard counts.
--   2. Backfills ref_wallets into wallet_recruiter_links.
--   3. Backfills ref_wallets into wallet_squad_memberships.
--   4. Marks existing/new legacy links locked at their original bound time so
--      the migrated attribution behaves like a signed wallet binding.
--
-- Safe behavior:
--   * If ref_wallets does not exist in an environment, the migration no-ops.
--   * If a wallet is already actively linked to any recruiter, it is not moved.
--   * If a wallet is already actively in any squad, it is not moved.
--   * Self-referrals are skipped.

begin;

alter table public.wallet_squad_memberships
  add column if not exists member_role text not null default 'member';

alter table public.wallet_squad_memberships
  add column if not exists link_source text not null default 'recruiter';

alter table public.wallet_squad_memberships
  add column if not exists legacy_ref_wallet_id bigint null;

create index if not exists wallet_squad_memberships_recruiter_role_idx
  on public.wallet_squad_memberships (recruiter_id, member_role, is_active);

create index if not exists wallet_squad_memberships_legacy_ref_wallet_idx
  on public.wallet_squad_memberships (legacy_ref_wallet_id)
  where legacy_ref_wallet_id is not null;

do $$
begin
  if to_regclass('public.ref_wallets') is null then
    raise notice 'Skipping legacy recruiter squad backfill: public.ref_wallets does not exist.';
    return;
  end if;

  -- Backfill wallet_recruiter_links from legacy ref_wallets.
  -- Join by recruiter_waitlist.id -> recruiters.code first, because old
  -- ref_wallets.recruiter_id points to recruiter_waitlist.id, not recruiters.id.
  execute $sql$
    with legacy as (
      select distinct on (lower(rw.wallet_address))
        lower(rw.wallet_address) as wallet_address,
        r.id as recruiter_id,
        coalesce(rw.bound_at, now()) as linked_at,
        rw.role,
        rw.source,
        rw.recruiter_code,
        rw.recruiter_id as legacy_recruiter_id
      from public.ref_wallets rw
      join public.recruiter_waitlist wl on wl.id = rw.recruiter_id
      join public.recruiters r on lower(r.code) = lower(coalesce(rw.recruiter_code, wl.recruiter_code))
      where rw.wallet_address is not null
        and length(trim(rw.wallet_address)) > 0
        and lower(rw.wallet_address) <> lower(r.wallet_address)
        and coalesce(r.status, '') in ('active', 'approved')
      order by lower(rw.wallet_address), coalesce(rw.bound_at, now()) asc
    )
    insert into public.wallet_recruiter_links (
      wallet_address,
      recruiter_id,
      link_source,
      linked_at,
      locked_at,
      is_active,
      metadata,
      created_at,
      updated_at
    )
    select
      l.wallet_address,
      l.recruiter_id,
      'migration',
      l.linked_at,
      l.linked_at,
      true,
      jsonb_build_object(
        'source', 'legacy_ref_wallets',
        'legacyRecruiterId', l.legacy_recruiter_id,
        'legacyRecruiterCode', l.recruiter_code,
        'legacyRole', l.role,
        'legacySource', l.source
      ),
      l.linked_at,
      now()
    from legacy l
    where not exists (
      select 1
      from public.wallet_recruiter_links existing
      where existing.wallet_address = l.wallet_address
        and existing.is_active = true
    )
  $sql$;

  -- Backfill wallet_squad_memberships from legacy ref_wallets.
  execute $sql$
    with legacy as (
      select distinct on (lower(rw.wallet_address))
        rw.id as legacy_ref_wallet_id,
        lower(rw.wallet_address) as wallet_address,
        r.id as recruiter_id,
        case
          when lower(coalesce(rw.role, '')) in ('creator', 'trader') then lower(rw.role)
          else 'member'
        end as member_role,
        coalesce(nullif(lower(coalesce(rw.source, '')), ''), 'migration') as link_source,
        coalesce(rw.bound_at, now()) as joined_at,
        rw.recruiter_code,
        rw.recruiter_id as legacy_recruiter_id
      from public.ref_wallets rw
      join public.recruiter_waitlist wl on wl.id = rw.recruiter_id
      join public.recruiters r on lower(r.code) = lower(coalesce(rw.recruiter_code, wl.recruiter_code))
      where rw.wallet_address is not null
        and length(trim(rw.wallet_address)) > 0
        and lower(rw.wallet_address) <> lower(r.wallet_address)
        and coalesce(r.status, '') in ('active', 'approved')
      order by lower(rw.wallet_address), coalesce(rw.bound_at, now()) asc
    )
    insert into public.wallet_squad_memberships (
      wallet_address,
      recruiter_id,
      joined_at,
      is_active,
      member_role,
      link_source,
      legacy_ref_wallet_id,
      created_at,
      updated_at
    )
    select
      l.wallet_address,
      l.recruiter_id,
      l.joined_at,
      true,
      l.member_role,
      l.link_source,
      l.legacy_ref_wallet_id,
      l.joined_at,
      now()
    from legacy l
    where not exists (
      select 1
      from public.wallet_squad_memberships existing
      where existing.wallet_address = l.wallet_address
        and existing.is_active = true
    )
  $sql$;

  raise notice 'Legacy recruiter squad backfill from public.ref_wallets completed.';
end $$;

comment on column public.wallet_squad_memberships.member_role is
  'Roster role for recruiter dashboard counts. Legacy ref_wallets values preserve creator/trader where available; defaults to member.';

comment on column public.wallet_squad_memberships.link_source is
  'How the squad membership was created, for example recruiter, session, referral_cookie, or migration.';

comment on column public.wallet_squad_memberships.legacy_ref_wallet_id is
  'Original public.ref_wallets.id when this squad membership was backfilled from the coming-soon recruiter portal.';

commit;
