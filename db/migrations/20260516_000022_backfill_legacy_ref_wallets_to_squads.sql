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
--   4. Upgrades previously-imported legacy member rows to creator/trader where
--      public.ref_wallets.role has that old coming-soon status.
--   5. Marks legacy links locked at their original bound time so the migrated
--      attribution behaves like a signed wallet binding.
--
-- Safe behavior:
--   * If ref_wallets does not exist in an environment, the migration no-ops.
--   * If a wallet is already actively linked to any recruiter, it is not moved.
--   * If a wallet is already actively in any squad, it is not moved.
--   * Existing legacy-imported member rows are upgraded to creator/trader only
--     when the old ref_wallets.role is creator/trader.
--   * Self-referrals are skipped.
--
-- Production compatibility note:
--   Some legacy ref_wallets tables do not have an id column, so this migration
--   stores a deterministic legacy_ref_wallet_key instead of referencing rw.id.

begin;

alter table public.wallet_squad_memberships
  add column if not exists member_role text not null default 'member';

alter table public.wallet_squad_memberships
  add column if not exists link_source text not null default 'recruiter';

alter table public.wallet_squad_memberships
  add column if not exists legacy_ref_wallet_key text null;

create index if not exists wallet_squad_memberships_recruiter_role_idx
  on public.wallet_squad_memberships (recruiter_id, member_role, is_active);

create index if not exists wallet_squad_memberships_legacy_ref_wallet_key_idx
  on public.wallet_squad_memberships (legacy_ref_wallet_key)
  where legacy_ref_wallet_key is not null;

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
        coalesce(rw.bound_at, now()) as linked_at
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
        md5(
          lower(coalesce(rw.wallet_address, '')) || ':' ||
          lower(coalesce(rw.recruiter_code, wl.recruiter_code, '')) || ':' ||
          coalesce(rw.bound_at::text, '')
        ) as legacy_ref_wallet_key,
        lower(rw.wallet_address) as wallet_address,
        r.id as recruiter_id,
        case
          when lower(coalesce(rw.role, '')) in ('creator', 'trader') then lower(rw.role)
          else 'member'
        end as member_role,
        coalesce(nullif(lower(coalesce(rw.source, '')), ''), 'migration') as link_source,
        coalesce(rw.bound_at, now()) as joined_at
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
      legacy_ref_wallet_key,
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
      l.legacy_ref_wallet_key,
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

  -- If an earlier run inserted legacy rows as member/unknown, upgrade them
  -- using the old coming-soon role value from public.ref_wallets.
  execute $sql$
    with legacy as (
      select distinct on (lower(rw.wallet_address))
        md5(
          lower(coalesce(rw.wallet_address, '')) || ':' ||
          lower(coalesce(rw.recruiter_code, wl.recruiter_code, '')) || ':' ||
          coalesce(rw.bound_at::text, '')
        ) as legacy_ref_wallet_key,
        lower(rw.wallet_address) as wallet_address,
        r.id as recruiter_id,
        case
          when lower(coalesce(rw.role, '')) in ('creator', 'trader') then lower(rw.role)
          else null
        end as legacy_role,
        coalesce(nullif(lower(coalesce(rw.source, '')), ''), 'migration') as legacy_source
      from public.ref_wallets rw
      join public.recruiter_waitlist wl on wl.id = rw.recruiter_id
      join public.recruiters r on lower(r.code) = lower(coalesce(rw.recruiter_code, wl.recruiter_code))
      where rw.wallet_address is not null
        and length(trim(rw.wallet_address)) > 0
        and lower(rw.wallet_address) <> lower(r.wallet_address)
        and coalesce(r.status, '') in ('active', 'approved')
      order by lower(rw.wallet_address), coalesce(rw.bound_at, now()) asc
    )
    update public.wallet_squad_memberships s
       set member_role = legacy.legacy_role,
           link_source = coalesce(nullif(s.link_source, ''), legacy.legacy_source, 'migration'),
           legacy_ref_wallet_key = coalesce(s.legacy_ref_wallet_key, legacy.legacy_ref_wallet_key),
           updated_at = now()
      from legacy
     where legacy.legacy_role in ('creator', 'trader')
       and s.is_active = true
       and s.recruiter_id = legacy.recruiter_id
       and lower(s.wallet_address) = legacy.wallet_address
       and coalesce(s.member_role, 'member') not in ('creator', 'trader')
  $sql$;

  raise notice 'Legacy recruiter squad backfill from public.ref_wallets completed.';
end $$;

comment on column public.wallet_squad_memberships.member_role is
  'Roster role for recruiter dashboard counts. Legacy ref_wallets values preserve creator/trader where available; defaults to member.';

comment on column public.wallet_squad_memberships.link_source is
  'How the squad membership was created, for example recruiter, session, referral_cookie, or migration.';

comment on column public.wallet_squad_memberships.legacy_ref_wallet_key is
  'Deterministic hash for the original public.ref_wallets row when this squad membership was backfilled from the coming-soon recruiter portal.';

commit;
