BEGIN;

ALTER TABLE public.curve_trades
  ADD COLUMN IF NOT EXISTS sold_tokens_after_raw NUMERIC(78, 0);

COMMENT ON COLUMN public.curve_trades.sold_tokens_after_raw IS
  'Authoritative post-trade bonding-curve sold token supply from the on-chain trade event. Raw token units.';

COMMIT;
