alter table public.token_candles
  add column if not exists price_o numeric,
  add column if not exists price_h numeric,
  add column if not exists price_l numeric,
  add column if not exists price_c numeric,
  add column if not exists mcap_o numeric,
  add column if not exists mcap_h numeric,
  add column if not exists mcap_l numeric,
  add column if not exists mcap_c numeric,
  add column if not exists canonical_version smallint,
  add column if not exists canonical_updated_at timestamptz;

comment on column public.token_candles.price_o is 'Canonical server-materialized price open in native coin per token.';
comment on column public.token_candles.price_h is 'Canonical server-materialized price high in native coin per token.';
comment on column public.token_candles.price_l is 'Canonical server-materialized price low in native coin per token.';
comment on column public.token_candles.price_c is 'Canonical server-materialized price close in native coin per token.';
comment on column public.token_candles.mcap_o is 'Canonical server-materialized market-cap open in native coin.';
comment on column public.token_candles.mcap_h is 'Canonical server-materialized market-cap high in native coin.';
comment on column public.token_candles.mcap_l is 'Canonical server-materialized market-cap low in native coin.';
comment on column public.token_candles.mcap_c is 'Canonical server-materialized market-cap close in native coin.';
comment on column public.token_candles.canonical_version is 'Version of canonical candle materialization logic.';
comment on column public.token_candles.canonical_updated_at is 'Last time canonical price/market-cap OHLC was materialized.';
