-- =============================================================================
-- TESTNET CLEAN SLATE (chain 97)
-- Removes ALL live tickers (campaigns + trades + market rows + campaign cursors)
-- PRESERVES: campaign_drafts and all draft_* tables
--
-- Run in Supabase SQL editor.
-- =============================================================================

-- Preview
select count(*)::int as campaigns_to_delete from public.campaigns where chain_id = 97;
select status, count(*)::int as n from public.campaign_drafts where chain_id = 97 group by 1 order by 1;
select count(*)::int as trades_to_delete from public.curve_trades where chain_id = 97;

begin;

delete from public.curve_trades where chain_id = 97;
delete from public.token_candles where chain_id = 97;
delete from public.token_stats where chain_id = 97;
delete from public.campaign_market_state where chain_id = 97;

-- Optional related tables (ignore if missing in your schema)
delete from public.dex_trades where chain_id = 97;
delete from public.dex_pools where chain_id = 97;
delete from public.votes where chain_id = 97;
delete from public.vote_aggregates where chain_id = 97;
delete from public.activity_events where chain_id = 97;

delete from public.indexer_state
where chain_id = 97
  and (cursor like 'campaign:%' or cursor like 'factory:%');

delete from public.campaigns where chain_id = 97;

-- Verify
select count(*)::int as campaigns_left from public.campaigns where chain_id = 97;
select count(*)::int as drafts_left from public.campaign_drafts where chain_id = 97;
select count(*)::int as trades_left from public.curve_trades where chain_id = 97;

commit;
