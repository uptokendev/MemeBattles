-- Keep ticker ownership isolated by deployment cluster so devnet/test work
-- cannot consume or collide with production ticker reservations.

update public.ticker_reservations
   set cluster = 'solana-mainnet-beta',
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'clusterNormalizedAt', now(),
         'previousCluster', cluster
       ),
       updated_at = now()
 where chain_id = 101
   and cluster = 'solana-legacy-101';

update public.ticker_reservations
   set cluster = 'solana-devnet',
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'clusterNormalizedAt', now(),
         'previousCluster', cluster
       ),
       updated_at = now()
 where chain_id = 102
   and cluster = 'solana-legacy-102';

drop index if exists public.ticker_reservations_blocking_ticker_uidx;
create unique index ticker_reservations_blocking_ticker_uidx
  on public.ticker_reservations (chain_id, cluster, normalized_ticker)
  where status not in ('DRAFT_UNRESERVED', 'RELEASED');

drop index if exists public.ticker_reservations_creator_history_idx;
create index ticker_reservations_creator_history_idx
  on public.ticker_reservations (chain_id, cluster, creator_wallet, created_at desc);

comment on index public.ticker_reservations_blocking_ticker_uidx is
  'One blocking ticker reservation per chain cluster; devnet/test reservations do not consume mainnet tickers.';
