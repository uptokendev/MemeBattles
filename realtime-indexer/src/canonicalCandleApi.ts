import type { Express, NextFunction, Request, Response } from "express";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { isEvmAddress, isSolanaAddress, resolveMarketIdentityOrPassthrough } from "./marketIdentity.js";
import { TIMEFRAMES } from "./timeframes.js";

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAddress(value: unknown, chainId: number): string {
  const raw = String(value ?? "").trim();
  return chainId === 101 ? raw : raw.toLowerCase();
}

function validAddress(value: string, chainId: number): boolean {
  return chainId === 101 ? isSolanaAddress(value) : isEvmAddress(value);
}

function enabledOnly(_req: Request, res: Response, next: NextFunction) {
  if (!ENV.ENABLE_UNIFIED_MARKET_API) {
    return res.status(503).json({
      ok: false,
      code: "UNIFIED_MARKET_API_DISABLED",
      error: "Unified market API is not enabled for this deployment.",
    });
  }
  next();
}

async function campaignFromParam(chainId: number, raw: string): Promise<string | null> {
  const input = normalizeAddress(raw, chainId);
  if (!validAddress(input, chainId)) return null;
  const identity = await resolveMarketIdentityOrPassthrough(chainId, input);
  return identity.campaignAddress;
}

function sendServerError(res: Response, error: unknown) {
  console.error("[canonical-candles] API error", error instanceof Error ? error.message : String(error));
  return res.status(500).json({
    ok: false,
    code: "CANONICAL_CANDLE_API_ERROR",
    error: "Canonical market data is temporarily unavailable.",
  });
}

export function registerCanonicalCandleRoutes(app: Express) {
  app.get("/api/token/:campaign/canonical-market-candles", enabledOnly, async (req, res) => {
    try {
      const chainId = asNumber(req.query.chainId, 97);
      const campaign = await campaignFromParam(chainId, req.params.campaign);
      const resolution = String(req.query.resolution || req.query.tf || "1m").trim();
      const limit = Math.max(1, Math.min(asNumber(req.query.limit, 1000), 5000));
      const from = req.query.from == null ? null : new Date(asNumber(req.query.from, 0) * 1000);
      const to = req.query.to == null ? null : new Date(asNumber(req.query.to, 0) * 1000);

      if (!campaign || !Number.isInteger(chainId) || chainId <= 0) {
        return res.status(400).json({ error: "Invalid campaign or chainId" });
      }
      if (!(TIMEFRAMES as string[]).includes(resolution)) {
        return res.status(400).json({ error: "Unsupported candle resolution" });
      }

      const result = await pool.query(
        `select
           bucket_start,o,h,l,c,
           price_o,price_h,price_l,price_c,
           mcap_o,mcap_h,mcap_l,mcap_c,
           canonical_version,canonical_updated_at,
           volume_bnb,trades_count,source_mask,
           bonding_trade_count,dex_trade_count,bonding_volume_bnb,dex_volume_bnb,
           last_block_number,last_log_index
         from public.token_candles
         where chain_id=$1 and campaign_address=$2 and timeframe=$3
           and ($4::timestamptz is null or bucket_start >= $4)
           and ($5::timestamptz is null or bucket_start <= $5)
         order by bucket_start desc
         limit $6`,
        [chainId, campaign, resolution, from, to, limit],
      );

      const stateResult = await pool.query(
        `select
           cms.market_stage,cms.graduation_time,cms.graduation_tx_hash,cms.graduation_block,
           cms.final_curve_price_bnb,cms.initial_dex_price_bnb,cms.dex_pair_address,
           cms.graduated_liquidity_bnb_raw,cms.post_burn_total_supply_raw
         from public.campaign_market_state cms
         where cms.chain_id=$1 and cms.campaign_address=$2
         limit 1`,
        [chainId, campaign],
      );
      const state = stateResult.rows[0] || null;

      return res.json({
        items: result.rows.reverse(),
        graduationMarker: state?.graduation_time
          ? {
              time: state.graduation_time,
              txHash: state.graduation_tx_hash ?? null,
              blockNumber: state.graduation_block == null ? 0 : Number(state.graduation_block),
              finalCurvePriceBnb: state.final_curve_price_bnb == null ? null : String(state.final_curve_price_bnb),
              initialDexPriceBnb: state.initial_dex_price_bnb == null ? null : String(state.initial_dex_price_bnb),
              pairAddress: state.dex_pair_address ?? null,
              initialLiquidityBnbRaw: state.graduated_liquidity_bnb_raw ?? null,
              postBurnTotalSupplyRaw: state.post_burn_total_supply_raw ?? null,
            }
          : null,
        marketStage: state?.market_stage ?? "BONDING",
        canonicalVersion: 1,
      });
    } catch (error) {
      return sendServerError(res, error);
    }
  });
}
