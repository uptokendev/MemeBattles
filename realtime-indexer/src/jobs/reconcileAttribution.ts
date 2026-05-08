import "dotenv/config";
import { pool } from "../db.js";

async function main() {
  console.log("[reconcile-attribution] start");

  await pool.query(`
    insert into public.wallet_profiles(
      wallet_address, first_seen_at, first_activity_at, has_activity,
      created_campaign_count, trade_count, last_campaign_created_at, updated_at
    )
    select
      lower(c.creator_address) as wallet_address,
      min(coalesce(c.created_at_chain, c.created_at, now())) as first_seen_at,
      min(coalesce(c.created_at_chain, c.created_at, now())) as first_activity_at,
      true as has_activity,
      count(*)::int as created_campaign_count,
      0::int as trade_count,
      max(coalesce(c.created_at_chain, c.created_at, now())) as last_campaign_created_at,
      now() as updated_at
    from public.campaigns c
    where c.creator_address is not null
    group by lower(c.creator_address)
    on conflict (wallet_address) do update set
      first_seen_at = least(public.wallet_profiles.first_seen_at, excluded.first_seen_at),
      first_activity_at = case
        when public.wallet_profiles.first_activity_at is null then excluded.first_activity_at
        else least(public.wallet_profiles.first_activity_at, excluded.first_activity_at)
      end,
      has_activity = public.wallet_profiles.has_activity or excluded.has_activity,
      created_campaign_count = greatest(public.wallet_profiles.created_campaign_count, excluded.created_campaign_count),
      last_campaign_created_at = greatest(
        coalesce(public.wallet_profiles.last_campaign_created_at, to_timestamp(0)),
        coalesce(excluded.last_campaign_created_at, to_timestamp(0))
      ),
      updated_at = now()
  `);

  await pool.query(`
    insert into public.wallet_profiles(
      wallet_address, first_seen_at, first_activity_at, has_activity,
      created_campaign_count, trade_count, last_trade_at, updated_at
    )
    select
      lower(t.wallet) as wallet_address,
      min(t.block_time) as first_seen_at,
      min(t.block_time) as first_activity_at,
      true as has_activity,
      0::int as created_campaign_count,
      count(*)::int as trade_count,
      max(t.block_time) as last_trade_at,
      now() as updated_at
    from public.curve_trades t
    group by lower(t.wallet)
    on conflict (wallet_address) do update set
      first_seen_at = least(public.wallet_profiles.first_seen_at, excluded.first_seen_at),
      first_activity_at = case
        when public.wallet_profiles.first_activity_at is null then excluded.first_activity_at
        else least(public.wallet_profiles.first_activity_at, excluded.first_activity_at)
      end,
      has_activity = public.wallet_profiles.has_activity or excluded.has_activity,
      trade_count = greatest(public.wallet_profiles.trade_count, excluded.trade_count),
      last_trade_at = greatest(
        coalesce(public.wallet_profiles.last_trade_at, to_timestamp(0)),
        coalesce(excluded.last_trade_at, to_timestamp(0))
      ),
      updated_at = now()
  `);

  const locked = await pool.query(`
    update public.wallet_recruiter_links l
       set locked_at = coalesce(l.locked_at, p.first_activity_at),
           updated_at = now()
      from public.wallet_profiles p
     where l.wallet_address = p.wallet_address
       and l.is_active = true
       and p.has_activity = true
       and p.first_activity_at is not null
       and l.locked_at is null
    returning l.id
  `);

  const squads = await pool.query(`
    insert into public.wallet_squad_memberships(
      wallet_address, recruiter_id, joined_at, is_active, created_at, updated_at
    )
    select
      l.wallet_address,
      l.recruiter_id,
      l.linked_at,
      true,
      now(),
      now()
    from public.wallet_recruiter_links l
    where l.is_active = true
      and not exists (
        select 1
        from public.wallet_squad_memberships s
        where s.wallet_address = l.wallet_address
          and s.is_active = true
      )
    returning id
  `);

  console.log("[reconcile-attribution] done", {
    lockedLinks: locked.rowCount ?? 0,
    createdActiveSquads: squads.rowCount ?? 0,
  });
}

main()
  .catch((err) => {
    console.error("[reconcile-attribution] failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
