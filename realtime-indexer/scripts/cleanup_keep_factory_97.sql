-- =============================================================================
-- TESTNET cleanup: keep only LaunchFactory 0xA2B19f194826b6D930D18F3fBCad662FaDC9459E
-- Chain 97 (BSC Chapel)
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
  and lower(coalesce(factory_address,'')) = '0xa2b19f194826b6d930d18f3fbcad662fadc9459e'
order by coalesce(created_at_chain, updated_at) desc nulls last;

select campaign_address, token_address, name, symbol, factory_address, created_block
from public.campaigns
where chain_id = 97
  and lower(coalesce(factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e'
order by coalesce(created_at_chain, updated_at) desc nulls last;

-- 1) BEGIN destructive section (uncomment to run)
/*
begin;

-- Related market / trade rows for non-keep factories
delete from public.curve_trades t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.token_candles t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.token_stats t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.token_comments t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.campaign_activity t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.campaign_follows t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.campaign_market_state t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.market_stats t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.dex_trades t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.dex_pools t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.votes t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.vote_aggregates t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.user_coin_edges t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

delete from public.activity_events t
 using public.campaigns c
 where c.chain_id = 97
   and t.chain_id = c.chain_id
   and t.campaign_address = c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

-- Indexer cursors for dropped campaigns
delete from public.indexer_state s
 using public.campaigns c
 where s.chain_id = 97
   and c.chain_id = 97
   and s.cursor = 'campaign:' || c.campaign_address
   and lower(coalesce(c.factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

-- Non-keep factory discovery cursors
delete from public.indexer_state
where chain_id = 97
  and cursor like 'factory:%'
  and cursor <> 'factory:0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

-- Campaigns themselves
delete from public.campaigns
where chain_id = 97
  and lower(coalesce(factory_address,'')) <> '0xa2b19f194826b6d930d18f3fbcad662fadc9459e';

-- Verify
select lower(coalesce(factory_address,'')) as factory, count(*)::int as campaigns
from public.campaigns
where chain_id = 97
group by 1;

commit;
*/
