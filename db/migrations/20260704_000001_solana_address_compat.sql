-- db/migrations/20260704_000001_solana_address_compat.sql
--
-- Solana public keys are case-sensitive base58 strings. The original BNB-only
-- indexer schema enforced lowercase addresses on shared launchpad tables, which
-- would reject valid Solana campaign, wallet, and transaction identifiers.
--
-- Application code still lowercases EVM addresses before writes; this migration
-- simply lets chain-specific normalizers store Solana values without corruption.

BEGIN;

ALTER TABLE IF EXISTS public.curve_trades
  DROP CONSTRAINT IF EXISTS curve_trades_campaign_lowercase,
  DROP CONSTRAINT IF EXISTS curve_trades_txhash_lowercase,
  DROP CONSTRAINT IF EXISTS curve_trades_wallet_lowercase;

ALTER TABLE IF EXISTS public.token_candles
  DROP CONSTRAINT IF EXISTS token_candles_campaign_lowercase;

ALTER TABLE IF EXISTS public.token_stats
  DROP CONSTRAINT IF EXISTS token_stats_campaign_lowercase;

COMMENT ON COLUMN public.curve_trades.campaign_address IS 'Chain-normalized campaign id: lowercase EVM address or case-sensitive Solana public key.';
COMMENT ON COLUMN public.curve_trades.tx_hash IS 'Chain-normalized transaction id: lowercase EVM hash or Solana signature.';
COMMENT ON COLUMN public.curve_trades.wallet IS 'Chain-normalized wallet id: lowercase EVM address or case-sensitive Solana public key.';
COMMENT ON COLUMN public.token_candles.campaign_address IS 'Chain-normalized campaign id: lowercase EVM address or case-sensitive Solana public key.';
COMMENT ON COLUMN public.token_stats.campaign_address IS 'Chain-normalized campaign id: lowercase EVM address or case-sensitive Solana public key.';

COMMIT;
