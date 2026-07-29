import type { Express, NextFunction, Request, Response } from "express";
import { pool } from "./db.js";

function normalizeAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function validAddress(value: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(value);
}

function validChainId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function marketApiEnabled(): boolean {
  return String(process.env.ENABLE_UNIFIED_MARKET_API || "0").trim() === "1";
}

function enabledOnly(_req: Request, res: Response, next: NextFunction) {
  if (!marketApiEnabled()) {
    return res.status(503).json({
      ok: false,
      code: "UNIFIED_MARKET_API_DISABLED",
      error: "Unified market API is not enabled for this deployment.",
    });
  }
  next();
}

async function readMarketState(chainId: number, campaign: string) {
  const result = await pool.query(
    `select
       cms.chain_id,
       cms.campaign_address,
       cms.token_address,
       cms.factory_address,
       cms.campaign_generation,
       cms.market_stage,
       cms.graduation_tx_hash,
       cms.graduation_block,
       cms.graduation_time,
       cms.dex_pair_address,
       cms.dex_router_address,
       cms.dex_factory_address,
       cms.wrapped_native_address,
       cms.pool_stable,
       cms.pool_fee_bps,
       cms.final_curve_price_bnb,
       cms.initial_dex_price_bnb,
       cms.graduated_liquidity_token_raw,
       cms.graduated_liquidity_bnb_raw,
       cms.graduated_lp_raw,
       cms.burned_unsold_token_raw,
       cms.burned_unused_lp_token_raw,
       cms.post_burn_total_supply_raw,
       cms.pool_verified,
       cms.indexing_enabled,
       cms.last_verified_at,
       cms.last_error,
       c.bonding_active,
       c.support_enabled,
       c.indexing_enabled as campaign_indexing_enabled,
       dp.last_indexed_block,
       dp.last_finalized_block,
       dp.last_swap_at,
       dp.last_sync_at,
       dp.reserve_token_raw,
       dp.reserve_native_raw,
       dp.support_enabled as pool_support_enabled,
       dp.indexing_enabled as pool_indexing_enabled
     from public.campaign_market_state cms
     join public.campaigns c
       on c.chain_id=cms.chain_id and c.campaign_address=cms.campaign_address
     left join public.dex_pools dp
       on dp.chain_id=cms.chain_id and dp.pair_address=cms.dex_pair_address
     where cms.chain_id=$1 and cms.campaign_address=$2
     limit 1`,
    [chainId, campaign],
  );

  const row = result.rows[0];
  if (!row) return null;

  const topazActive = row.market_stage === "TOPAZ_ACTIVE";
  const bondingActive = row.market_stage === "BONDING" && Boolean(row.bonding_active);
  const tradingEnabled =
    Boolean(row.support_enabled) &&
    (bondingActive ||
      (topazActive &&
        Boolean(row.pool_verified) &&
        Boolean(row.pool_support_enabled) &&
        Boolean(row.pool_indexing_enabled)));

  const lagSeconds = row.last_sync_at
    ? Math.max(0, Math.floor((Date.now() - new Date(row.last_sync_at).getTime()) / 1000))
    : null;

  return {
    chainId: Number(row.chain_id),
    campaignAddress: row.campaign_address,
    tokenAddress: row.token_address,
    factoryAddress: row.factory_address,
    campaignGeneration: row.campaign_generation,
    marketStage: row.market_stage,
    graduation: row.graduation_block
      ? {
          txHash: row.graduation_tx_hash,
          blockNumber: Number(row.graduation_block),
          time: row.graduation_time,
          finalCurvePriceBnb: row.final_curve_price_bnb,
          initialDexPriceBnb: row.initial_dex_price_bnb,
          liquidityTokenRaw: row.graduated_liquidity_token_raw,
          liquidityBnbRaw: row.graduated_liquidity_bnb_raw,
          liquidityLpRaw: row.graduated_lp_raw,
          burnedUnsoldTokenRaw: row.burned_unsold_token_raw,
          burnedUnusedLpTokenRaw: row.burned_unused_lp_token_raw,
          postBurnTotalSupplyRaw: row.post_burn_total_supply_raw,
        }
      : null,
    pairAddress: row.dex_pair_address,
    routerAddress: row.dex_router_address,
    dexFactoryAddress: row.dex_factory_address,
    wrappedNativeAddress: row.wrapped_native_address,
    stable: row.pool_stable,
    feeBps: row.pool_fee_bps == null ? null : Number(row.pool_fee_bps),
    poolVerified: Boolean(row.pool_verified),
    supportEnabled: Boolean(row.support_enabled),
    bondingActive: Boolean(row.bonding_active),
    tradingEnabled,
    indexingStatus: {
      enabled: Boolean(row.indexing_enabled) && Boolean(row.campaign_indexing_enabled),
      poolEnabled: row.pool_indexing_enabled == null ? false : Boolean(row.pool_indexing_enabled),
      lastIndexedBlock: row.last_indexed_block == null ? null : Number(row.last_indexed_block),
      lastFinalizedBlock: row.last_finalized_block == null ? null : Number(row.last_finalized_block),
      lastSwapAt: row.last_swap_at,
      lastSyncAt: row.last_sync_at,
      dataLagSeconds: lagSeconds,
    },
    reserves: {
      tokenRaw: row.reserve_token_raw,
      nativeRaw: row.reserve_native_raw,
    },
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
  };
}

export function registerMarketContinuityRoutes(app: Express) {
  app.get("/api/token/:campaign/market-state", enabledOnly, async (req, res, next) => {
    try {
      const campaign = normalizeAddress(req.params.campaign);
      const chainId = asNumber(req.query.chainId, 97);
      if (!validAddress(campaign) || !validChainId(chainId)) {
        return res.status(400).json({ error: "Invalid campaign or chainId" });
      }

      const state = await readMarketState(chainId, campaign);
      if (!state) return res.status(404).json({ error: "Market state not found" });
      return res.json(state);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/token/:campaign/trade-route", enabledOnly, async (req, res, next) => {
    try {
      const campaign = normalizeAddress(req.params.campaign);
      const chainId = asNumber(req.query.chainId, 97);
      if (!validAddress(campaign) || !validChainId(chainId)) {
        return res.status(400).json({ error: "Invalid campaign or chainId" });
      }

      const state = await readMarketState(chainId, campaign);
      if (!state) return res.status(404).json({ error: "Market state not found" });

      return res.json({
        chainId: state.chainId,
        marketStage: state.marketStage,
        campaignAddress: state.campaignAddress,
        token: state.tokenAddress,
        pair: state.pairAddress,
        router: state.routerAddress,
        factory: state.dexFactoryAddress,
        wrappedNative: state.wrappedNativeAddress,
        stable: state.stable,
        feeBps: state.feeBps,
        verified: state.poolVerified,
        tradingEnabled: state.tradingEnabled,
        verifiedAt: state.lastVerifiedAt,
        lastError: state.lastError,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/token/:campaign/market-trades", enabledOnly, async (req, res, next) => {
    try {
      const campaign = normalizeAddress(req.params.campaign);
      const chainId = asNumber(req.query.chainId, 97);
      const limit = Math.max(1, Math.min(asNumber(req.query.limit, 100), 500));
      const stage = String(req.query.marketStage || "all").trim().toLowerCase();
      const cursor = String(req.query.cursor || "").trim();
      if (!validAddress(campaign) || !validChainId(chainId)) {
        return res.status(400).json({ error: "Invalid campaign or chainId" });
      }
      if (!["all", "bonding", "topaz"].includes(stage)) {
        return res.status(400).json({ error: "marketStage must be all, bonding, or topaz" });
      }

      let cursorBlock: number | null = null;
      let cursorLog: number | null = null;
      if (cursor) {
        const [blockRaw, logRaw] = cursor.split(":");
        const block = Number(blockRaw);
        const log = Number(logRaw);
        if (Number.isInteger(block) && Number.isInteger(log)) {
          cursorBlock = block;
          cursorLog = log;
        }
      }

      const result = await pool.query(
        `select
           "chainId","campaignAddress","tokenAddress","pairAddress","marketStage",source,
           side,wallet,recipient,"tokenAmountRaw","nativeAmountRaw","priceBnb",
           "txHash","logIndex","blockNumber","blockTime",status
         from public.market_trades_v
         where "chainId"=$1 and "campaignAddress"=$2
           and ($3='all' or source=$3)
           and ($4::bigint is null or "blockNumber" < $4 or ("blockNumber"=$4 and "logIndex" < $5))
         order by "blockNumber" desc,"logIndex" desc
         limit $6`,
        [chainId, campaign, stage, cursorBlock, cursorLog, limit],
      );

      const items = result.rows;
      const last = items[items.length - 1];
      return res.json({
        items,
        nextCursor: last ? `${last.blockNumber}:${last.logIndex}` : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/token/:campaign/market-candles", enabledOnly, async (req, res, next) => {
    try {
      const campaign = normalizeAddress(req.params.campaign);
      const chainId = asNumber(req.query.chainId, 97);
      const resolution = String(req.query.resolution || req.query.tf || "1m").trim();
      const limit = Math.max(1, Math.min(asNumber(req.query.limit, 1000), 5000));
      const from = req.query.from == null ? null : new Date(asNumber(req.query.from, 0) * 1000);
      const to = req.query.to == null ? null : new Date(asNumber(req.query.to, 0) * 1000);
      if (!validAddress(campaign) || !validChainId(chainId)) {
        return res.status(400).json({ error: "Invalid campaign or chainId" });
      }
      if (!["5s", "1m", "5m", "15m", "30m", "1h", "4h", "1d"].includes(resolution)) {
        return res.status(400).json({ error: "Unsupported candle resolution" });
      }

      const result = await pool.query(
        `select
           bucket_start,o,h,l,c,volume_bnb,trades_count,source_mask,
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
      const state = await readMarketState(chainId, campaign);

      return res.json({
        items: result.rows.reverse(),
        graduationMarker: state?.graduation
          ? {
              time: state.graduation.time,
              txHash: state.graduation.txHash,
              blockNumber: state.graduation.blockNumber,
              finalCurvePriceBnb: state.graduation.finalCurvePriceBnb,
              initialDexPriceBnb: state.graduation.initialDexPriceBnb,
              pairAddress: state.pairAddress,
              initialLiquidityBnbRaw: state.graduation.liquidityBnbRaw,
              postBurnTotalSupplyRaw: state.graduation.postBurnTotalSupplyRaw,
            }
          : null,
        marketStage: state?.marketStage ?? "BONDING",
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/token/:campaign/market-summary", enabledOnly, async (req, res, next) => {
    try {
      const campaign = normalizeAddress(req.params.campaign);
      const chainId = asNumber(req.query.chainId, 97);
      if (!validAddress(campaign) || !validChainId(chainId)) {
        return res.status(400).json({ error: "Invalid campaign or chainId" });
      }

      const result = await pool.query(
        `select * from public.market_stats where chain_id=$1 and campaign_address=$2 limit 1`,
        [chainId, campaign],
      );
      const state = await readMarketState(chainId, campaign);
      if (!state && !result.rows[0]) return res.status(404).json({ error: "Market not found" });

      return res.json({
        ...(result.rows[0] || {}),
        marketStage: state?.marketStage ?? result.rows[0]?.market_stage ?? "BONDING",
        poolVerified: state?.poolVerified ?? false,
        tradingEnabled: state?.tradingEnabled ?? false,
        dataLagSeconds: state?.indexingStatus.dataLagSeconds ?? result.rows[0]?.data_lag_seconds ?? null,
      });
    } catch (error) {
      next(error);
    }
  });
}
