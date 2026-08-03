import type { Express, NextFunction, Request, Response } from "express";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { rewindEmptyCampaignTradeCursor } from "./emptyTradeCursorRewind.js";
import { isEvmAddress, resolveMarketIdentity, resolveMarketIdentityOrPassthrough } from "./marketIdentity.js";

function normalizeAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function validAddress(value: string): boolean {
  return isEvmAddress(value);
}

function validChainId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Path param may be campaign or public ERC-20 token; always query by campaign. */
async function campaignFromParam(chainId: number, raw: string): Promise<string | null> {
  const input = normalizeAddress(raw);
  if (!validAddress(input) || !validChainId(chainId)) return null;
  const identity = await resolveMarketIdentityOrPassthrough(chainId, input);
  return identity.campaignAddress;
}

function marketApiEnabled(): boolean {
  return ENV.ENABLE_UNIFIED_MARKET_API;
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

function sendServerError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown market API error");
  console.error("[wtr] market API error", message);
  return res.status(500).json({
    ok: false,
    code: "MARKET_API_ERROR",
    error: "Market data is temporarily unavailable.",
  });
}

/**
 * When the campaign exists but campaign_market_state was never seeded (common for
 * older factories / pre-WTR rows), create a BONDING skeleton so market-state is
 * 200 instead of 404 and graduation reconciler can pick the campaign up.
 */
async function ensureBondingMarketState(chainId: number, campaign: string): Promise<boolean> {
  try {
    const inserted = await pool.query(
      `insert into public.campaign_market_state(
         chain_id,campaign_address,token_address,factory_address,market_stage,
         pool_verified,indexing_enabled,created_at,updated_at
       )
       select
         c.chain_id,
         c.campaign_address,
         coalesce(nullif(c.token_address,''), c.campaign_address),
         c.factory_address,
         'BONDING',
         false,
         true,
         now(),
         now()
       from public.campaigns c
       where c.chain_id=$1 and c.campaign_address=$2
       on conflict (chain_id,campaign_address) do nothing
       returning campaign_address`,
      [chainId, campaign],
    );
    return (inserted.rowCount ?? 0) > 0;
  } catch (error) {
    console.warn("[wtr] ensureBondingMarketState failed", {
      chainId,
      campaign,
      error: String((error as any)?.message || error),
    });
    return false;
  }
}

async function maybeRewindEmptyTradeCursor(chainId: number, campaign: string): Promise<void> {
  await rewindEmptyCampaignTradeCursor(chainId, campaign);
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

  let row = result.rows[0];
  if (!row) {
    // Seed CMS + optionally rewind empty trade cursor, then re-read.
    await ensureBondingMarketState(chainId, campaign);
    await maybeRewindEmptyTradeCursor(chainId, campaign);
    const retry = await pool.query(
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
    row = retry.rows[0];
  }
  if (!row) {
    // Campaign not in campaigns table at all.
    return null;
  }

  const topazActive = row.market_stage === "TOPAZ_ACTIVE";
  const bondingActive = row.market_stage === "BONDING" && Boolean(row.bonding_active);
  const topazRouteReady =
    topazActive &&
    Boolean(row.pool_verified) &&
    Boolean(row.pool_support_enabled) &&
    Boolean(row.pool_indexing_enabled);
  const quotesEnabled =
    Boolean(row.support_enabled) &&
    (bondingActive || (topazRouteReady && ENV.ENABLE_TOPAZ_QUOTES));
  const tradingEnabled =
    Boolean(row.support_enabled) &&
    (bondingActive || (topazRouteReady && ENV.ENABLE_TOPAZ_QUOTES && ENV.ENABLE_TOPAZ_TRADING));

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
    quotesEnabled,
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
  // Always-on identity resolve (no market API flag). Public URL = token; DB key = campaign.
  app.get("/api/market/resolve", async (req, res) => {
    try {
      const chainId = asNumber(req.query.chainId, 97);
      const address = normalizeAddress(req.query.address || req.query.id || "");
      if (!validAddress(address) || !validChainId(chainId)) {
        return res.status(400).json({ error: "Invalid address or chainId" });
      }
      const identity = await resolveMarketIdentity(chainId, address);
      if (!identity) {
        return res.status(404).json({
          ok: false,
          error: "No campaign found for this address (tried campaign + token columns).",
          chainId,
          address,
        });
      }
      return res.json({
        ok: true,
        chainId: identity.chainId,
        inputAddress: identity.inputAddress,
        matchedBy: identity.matchedBy,
        campaignAddress: identity.campaignAddress,
        tokenAddress: identity.tokenAddress || null,
        publicUrlAddress: identity.tokenAddress || identity.campaignAddress,
        marketKey: identity.campaignAddress,
      });
    } catch (error) {
      return sendServerError(res, error);
    }
  });

  app.get("/api/token/:campaign/market-state", enabledOnly, async (req, res) => {
    try {
      const chainId = asNumber(req.query.chainId, 97);
      const campaign = await campaignFromParam(chainId, req.params.campaign);
      if (!campaign || !validChainId(chainId)) {
        return res.status(400).json({ error: "Invalid campaign or chainId" });
      }

      // Seeds CMS when missing (older campaigns) — returns 200 BONDING skeleton.
      const state = await readMarketState(chainId, campaign);
      if (!state) {
        return res.status(404).json({
          error: "Market state not found",
          hint: "No campaigns row for this address. Factory discovery may not have indexed it yet.",
          chainId,
          campaignAddress: campaign,
        });
      }
      return res.json(state);
    } catch (error) {
      return sendServerError(res, error);
    }
  });

  app.get("/api/token/:campaign/trade-route", enabledOnly, async (req, res) => {
    try {
      const chainId = asNumber(req.query.chainId, 97);
      const campaign = await campaignFromParam(chainId, req.params.campaign);
      if (!campaign || !validChainId(chainId)) {
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
        quotesEnabled: state.quotesEnabled,
        tradingEnabled: state.tradingEnabled,
        verifiedAt: state.lastVerifiedAt,
        lastError: state.lastError,
      });
    } catch (error) {
      return sendServerError(res, error);
    }
  });

  app.get("/api/token/:campaign/market-trades", enabledOnly, async (req, res) => {
    try {
      const chainId = asNumber(req.query.chainId, 97);
      const campaign = await campaignFromParam(chainId, req.params.campaign);
      const limit = Math.max(1, Math.min(asNumber(req.query.limit, 100), 500));
      const stage = String(req.query.marketStage || "all").trim().toLowerCase();
      const cursor = String(req.query.cursor || "").trim();
      if (!campaign || !validChainId(chainId)) {
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
      return sendServerError(res, error);
    }
  });

  app.get("/api/token/:campaign/market-candles", enabledOnly, async (req, res) => {
    try {
      const chainId = asNumber(req.query.chainId, 97);
      const campaign = await campaignFromParam(chainId, req.params.campaign);
      const resolution = String(req.query.resolution || req.query.tf || "1m").trim();
      const limit = Math.max(1, Math.min(asNumber(req.query.limit, 1000), 5000));
      const from = req.query.from == null ? null : new Date(asNumber(req.query.from, 0) * 1000);
      const to = req.query.to == null ? null : new Date(asNumber(req.query.to, 0) * 1000);
      if (!campaign || !validChainId(chainId)) {
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
      return sendServerError(res, error);
    }
  });

  app.get("/api/token/:campaign/market-summary", enabledOnly, async (req, res) => {
    try {
      const chainId = asNumber(req.query.chainId, 97);
      const campaign = await campaignFromParam(chainId, req.params.campaign);
      if (!campaign || !validChainId(chainId)) {
        return res.status(400).json({ error: "Invalid campaign or chainId" });
      }

      // Prefer a lightweight stats row; never hard-fail quotes/UI if one side of the join is slow.
      let statsRow: Record<string, unknown> | null = null;
      let state: Awaited<ReturnType<typeof readMarketState>> | null = null;
      let partialError: string | null = null;

      try {
        const result = await pool.query(
          `select * from public.market_stats where chain_id=$1 and campaign_address=$2 limit 1`,
          [chainId, campaign],
        );
        statsRow = result.rows[0] || null;
      } catch (error: any) {
        partialError = error?.message || String(error);
        console.error("[wtr] market-summary stats query failed", partialError);
      }

      try {
        state = await readMarketState(chainId, campaign);
      } catch (error: any) {
        partialError = error?.message || String(error);
        console.error("[wtr] market-summary state query failed", partialError);
      }

      if (!state && !statsRow) {
        // Degraded empty summary so the UI can fall through to on-chain Topaz quotes
        // instead of spinning forever on HTTP 500.
        return res.status(200).json({
          marketStage: "BONDING",
          poolVerified: false,
          quotesEnabled: false,
          tradingEnabled: false,
          dataLagSeconds: null,
          degraded: true,
          lastError: partialError,
        });
      }

      return res.json({
        ...(statsRow || {}),
        marketStage: state?.marketStage ?? (statsRow as any)?.market_stage ?? "BONDING",
        poolVerified: state?.poolVerified ?? false,
        quotesEnabled: state?.quotesEnabled ?? false,
        tradingEnabled: state?.tradingEnabled ?? false,
        dataLagSeconds: state?.indexingStatus.dataLagSeconds ?? (statsRow as any)?.data_lag_seconds ?? null,
        degraded: Boolean(partialError),
        lastError: partialError,
      });
    } catch (error) {
      return sendServerError(res, error);
    }
  });
}
