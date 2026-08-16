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

type MarketStateRow = {
  market_stage?: string | null;
  graduation_time?: string | Date | null;
  graduation_tx_hash?: string | null;
  graduation_block?: number | string | null;
  final_curve_price_bnb?: string | number | null;
  initial_dex_price_bnb?: string | number | null;
  dex_pair_address?: string | null;
  graduated_liquidity_bnb_raw?: string | null;
  post_burn_total_supply_raw?: string | null;
};

function bucketKey(row: any): number {
  const ms = new Date(row?.bucket_start ?? 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function mergeOneSecondRows(storedRows: any[], recoveredRows: any[], limit: number): any[] {
  // Recovered rows are a compatibility backfill view. If a materialized canonical
  // candle exists for the same second, it wins unconditionally.
  const byBucket = new Map<number, any>();
  for (const row of recoveredRows) byBucket.set(bucketKey(row), row);
  for (const row of storedRows) byBucket.set(bucketKey(row), row);
  return Array.from(byBucket.values())
    .filter((row) => bucketKey(row) > 0)
    .sort((a, b) => bucketKey(a) - bucketKey(b))
    .slice(-limit);
}

async function resolveFixedSupplyWhole(
  chainId: number,
  campaign: string,
  state: MarketStateRow | null,
): Promise<number> {
  if (chainId !== 101) {
    const raw = String(state?.post_burn_total_supply_raw ?? "").trim();
    if (/^\d+$/.test(raw)) {
      const whole = Number(raw) / 1e18;
      if (Number.isFinite(whole) && whole > 0) return whole;
    }
  }

  // Chain-neutral fallback: the final canonical bonding candle already encodes
  // mcap = marginal price * sold/fixed supply. The ratio preserves each chain's
  // token decimals without introducing an RPC dependency into this read API.
  const ratio = await pool.query(
    `select (mcap_c / nullif(price_c,0)) as supply_whole
       from public.token_candles
      where chain_id=$1 and campaign_address=$2
        and price_c is not null and price_c > 0
        and mcap_c is not null and mcap_c > 0
        and coalesce(dex_trade_count,0)=0
        and ($3::timestamptz is null or bucket_start <= $3)
      order by bucket_start desc
      limit 1`,
    [chainId, campaign, state?.graduation_time ?? null],
  );
  const whole = Number(ratio.rows[0]?.supply_whole ?? 0);
  return Number.isFinite(whole) && whole > 0 ? whole : 0;
}

async function recoverHistoricalDexOneSecondRows(input: {
  chainId: number;
  campaign: string;
  state: MarketStateRow | null;
  from: Date | null;
  to: Date | null;
  limit: number;
}): Promise<any[]> {
  const graduationTime = input.state?.graduation_time ?? null;
  if (!graduationTime) return [];

  const supplyWhole = await resolveFixedSupplyWhole(input.chainId, input.campaign, input.state);
  const queryLimit = Math.max(1, Math.min(input.limit, 5000));

  if (input.chainId === 101) {
    const result = await pool.query(
      `with base as (
         select
           date_trunc('second', block_time) as bucket_start,
           price_bnb::numeric as price,
           coalesce(bnb_amount,0)::numeric as volume_native,
           block_number,
           log_index
         from public.curve_trades
         where chain_id=$1 and campaign_address=$2
           and block_time >= $3::timestamptz
           and sold_tokens_after_raw is null
           and price_bnb is not null and price_bnb > 0
           and ($4::timestamptz is null or block_time >= $4)
           and ($5::timestamptz is null or block_time <= $5)
       ), grouped as (
         select
           bucket_start,
           (array_agg(price order by block_number,log_index))[1] as o,
           max(price) as h,
           min(price) as l,
           (array_agg(price order by block_number desc,log_index desc))[1] as c,
           sum(volume_native) as volume_bnb,
           count(*)::int as trades_count,
           (array_agg(block_number order by block_number desc,log_index desc))[1] as last_block_number,
           (array_agg(log_index order by block_number desc,log_index desc))[1] as last_log_index
         from base
         group by bucket_start
       )
       select
         bucket_start,o,h,l,c,
         o as price_o,h as price_h,l as price_l,c as price_c,
         case when $7::numeric > 0 then o*$7::numeric else null end as mcap_o,
         case when $7::numeric > 0 then h*$7::numeric else null end as mcap_h,
         case when $7::numeric > 0 then l*$7::numeric else null end as mcap_l,
         case when $7::numeric > 0 then c*$7::numeric else null end as mcap_c,
         3 as canonical_version,now() as canonical_updated_at,
         volume_bnb,trades_count,2::smallint as source_mask,
         0 as bonding_trade_count,trades_count as dex_trade_count,
         0::numeric as bonding_volume_bnb,volume_bnb as dex_volume_bnb,
         last_block_number,last_log_index
       from grouped
       order by bucket_start desc
       limit $6`,
      [
        input.chainId,
        input.campaign,
        graduationTime,
        input.from,
        input.to,
        queryLimit,
        supplyWhole,
      ],
    );
    return result.rows.reverse();
  }

  const result = await pool.query(
    `with base as (
       select
         date_trunc('second', block_time) as bucket_start,
         price_bnb::numeric as price,
         coalesce(native_amount,(native_amount_raw::numeric / 1e18),0)::numeric as volume_native,
         block_number,
         log_index
       from public.dex_trades
       where chain_id=$1 and campaign_address=$2
         and status='confirmed'
         and block_time >= $3::timestamptz
         and price_bnb is not null and price_bnb > 0
         and ($4::timestamptz is null or block_time >= $4)
         and ($5::timestamptz is null or block_time <= $5)
     ), grouped as (
       select
         bucket_start,
         (array_agg(price order by block_number,log_index))[1] as o,
         max(price) as h,
         min(price) as l,
         (array_agg(price order by block_number desc,log_index desc))[1] as c,
         sum(volume_native) as volume_bnb,
         count(*)::int as trades_count,
         (array_agg(block_number order by block_number desc,log_index desc))[1] as last_block_number,
         (array_agg(log_index order by block_number desc,log_index desc))[1] as last_log_index
       from base
       group by bucket_start
     )
     select
       bucket_start,o,h,l,c,
       o as price_o,h as price_h,l as price_l,c as price_c,
       case when $7::numeric > 0 then o*$7::numeric else null end as mcap_o,
       case when $7::numeric > 0 then h*$7::numeric else null end as mcap_h,
       case when $7::numeric > 0 then l*$7::numeric else null end as mcap_l,
       case when $7::numeric > 0 then c*$7::numeric else null end as mcap_c,
       3 as canonical_version,now() as canonical_updated_at,
       volume_bnb,trades_count,2::smallint as source_mask,
       0 as bonding_trade_count,trades_count as dex_trade_count,
       0::numeric as bonding_volume_bnb,volume_bnb as dex_volume_bnb,
       last_block_number,last_log_index
     from grouped
     order by bucket_start desc
     limit $6`,
    [
      input.chainId,
      input.campaign,
      graduationTime,
      input.from,
      input.to,
      queryLimit,
      supplyWhole,
    ],
  );
  return result.rows.reverse();
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
      const state = (stateResult.rows[0] || null) as MarketStateRow | null;
      const storedRows = result.rows.reverse();
      const recoveredRows = resolution === "1s"
        ? await recoverHistoricalDexOneSecondRows({ chainId, campaign, state, from, to, limit })
        : [];
      const items = resolution === "1s"
        ? mergeOneSecondRows(storedRows, recoveredRows, limit)
        : storedRows;

      return res.json({
        items,
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
        serverTime: new Date().toISOString(),
        canonicalVersion: 3,
      });
    } catch (error) {
      return sendServerError(res, error);
    }
  });
}
