alter table public.campaign_market_state
  drop constraint if exists campaign_market_state_pool_volatile;

alter table public.campaign_market_state
  add constraint campaign_market_state_pool_volatile check (
    pool_stable is distinct from true
    or market_stage in ('TOPAZ_DEGRADED','UNSUPPORTED')
  );

comment on constraint campaign_market_state_pool_volatile on public.campaign_market_state is
  'Stable-pool evidence may be retained only for degraded/unsupported diagnostics. Tradable dex_pools remain volatile-only.';
