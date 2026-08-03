-- =============================================================================
-- TESTNET cleanup: keep ONLY dual-test factories on chain 97 (BSC Chapel)
--
-- KEEP:
--   0xA2B19f194826b6D930D18F3fBCad662FaDC9459E  (previous / support-only)
--   0x8d4937D3BEe8A750411c0a24f888C0088754D3eD  (new dual-test / creation)
--
-- DROP everything else (e0FbBa, F787, blank factory_address, etc.)
--
-- Run in Supabase SQL editor (or psql) AFTER reviewing the dry-run SELECTs.
-- =============================================================================

-- 0) Preview
select lower(coalesce(factory_address,'')) as factory, count(*)::int as campaigns
from public.campaigns
where chain_id = 97
group by 1
order by campaigns desc;

select campaign_address, token_address, name, symbol, factory_address, created_block
from public.campaigns
where chain_id = 97
  and lower(coalesce(factory_address,'')) in (
    '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
    '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
  )
order by lower(coalesce(factory_address,'')), coalesce(created_at_chain, updated_at) desc nulls last;

select campaign_address, token_address, name, symbol, factory_address, created_block
from public.campaigns
where chain_id = 97
  and lower(coalesce(factory_address,'')) not in (
    '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
    '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
  )
order by coalesce(created_at_chain, updated_at) desc nulls last;

-- Factory discovery cursors currently present
select cursor, last_indexed_block, updated_at
from public.indexer_state
where chain_id = 97
  and cursor like 'factory:%'
order by cursor;

-- 1) BEGIN destructive section (uncomment to run)
/*
begin;

-- Related market / trade rows for non-keep factories
delete from public.curve_trades t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.token_candles t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.token_stats t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.token_comments t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.campaign_activity t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.campaign_follows t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.campaign_market_state t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.market_stats t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.dex_trades t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.dex_pools t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.votes t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.vote_aggregates t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.user_coin_edges t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

delete from public.activity_events t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

-- Indexer cursors for dropped campaigns
delete from public.indexer_state s
 using public.campaigns c
 where s.chain_id = 97
   and c.chain_id = 97
   and s.cursor = 'campaign:' || c.campaign_address
   and lower(coalesce(c.factory_address,'')) not in (
     '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
     '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
   );

-- Non-keep factory discovery cursors (keep both dual-test factory cursors)
delete from public.indexer_state
where chain_id = 97
  and cursor like 'factory:%'
  and cursor not in (
    'factory:0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
    'factory:0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
  );

-- Campaigns themselves
delete from public.campaigns
where chain_id = 97
  and lower(coalesce(factory_address,'')) not in (
    '0xa2b19f194826b6d930d18f3fbcad662fadc9459e',
    '0x8d4937d3bee8a750411c0a24f888c0088754d3ed'
  );

-- Verify
select lower(coalesce(factory_address,'')) as factory, count(*)::int as campaigns
from public.campaigns
where chain_id = 97
group by 1
order by campaigns desc;

select cursor, last_indexed_block
from public.indexer_state
where chain_id = 97 and cursor like 'factory:%'
order by cursor;

commit;
*/
