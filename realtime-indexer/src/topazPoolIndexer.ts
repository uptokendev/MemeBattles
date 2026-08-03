import { ethers } from "ethers";
import { ablyRest, tokenChannel } from "./ably.js";
import { TOPAZ_POOL_ABI } from "./abis.js";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { createWorkingProvider, maskRpcUrl, parseRpcList } from "./rpcProvider.js";
import { normalizeTopazSwap, priceBnbFromRaw } from "./topazPoolCore.js";

type ChainConfig = {
  chainId: number;
  rpcUrls: string[];
};

type IndexedPool = {
  chainId: number;
  pairAddress: string;
  campaignAddress: string;
  tokenAddress: string;
  wrappedNativeAddress: string;
  token0Address: string;
  token1Address: string;
  graduationBlock: number;
  lastIndexedBlock: number | null;
};

type CandleResolution = "5s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

const RESOLUTION_MS: Record<CandleResolution, number> = {
  "5s": 5_000,
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

const LOOP_SYMBOL = Symbol.for("memewarzone.wtrTopazPoolIndexerStarted");
const globalState = globalThis as any;
const ERC20_METADATA_ABI = ["function decimals() view returns (uint8)"];

function chainConfigs(): ChainConfig[] {
  const result: ChainConfig[] = [];
  const testnet = parseRpcList(ENV.BSC_RPC_HTTP_97);
  const mainnet = parseRpcList(ENV.BSC_RPC_HTTP_56);
  if (testnet.length) result.push({ chainId: 97, rpcUrls: testnet });
  if (mainnet.length) result.push({ chainId: 56, rpcUrls: mainnet });
  return result;
}

function bucketStart(blockTime: Date, resolution: CandleResolution): Date {
  const duration = RESOLUTION_MS[resolution];
  return new Date(Math.floor(blockTime.getTime() / duration) * duration);
}

async function listPools(chainId: number): Promise<IndexedPool[]> {
  const maxPools = Math.max(1, Number(process.env.TOPAZ_POOL_INDEXER_MAX_POOLS || 100));
  const result = await pool.query(
    `select
       dp.chain_id,
       dp.pair_address,
       dp.campaign_address,
       dp.token_address,
       dp.wrapped_native_address,
       dp.token0_address,
       dp.token1_address,
       dp.graduation_block,
       dp.last_indexed_block
     from public.dex_pools dp
     join public.campaign_market_state cms
       on cms.chain_id=dp.chain_id and cms.campaign_address=dp.campaign_address
     where dp.chain_id=$1
       and dp.support_enabled=true
       and dp.indexing_enabled=true
       and dp.stable=false
       and cms.pool_verified=true
       and cms.market_stage='TOPAZ_ACTIVE'
     order by coalesce(dp.last_indexed_block,dp.graduation_block) asc
     limit $2`,
    [chainId, maxPools],
  );

  return result.rows.map((row: any) => ({
    chainId: Number(row.chain_id),
    pairAddress: String(row.pair_address).toLowerCase(),
    campaignAddress: String(row.campaign_address).toLowerCase(),
    tokenAddress: String(row.token_address).toLowerCase(),
    wrappedNativeAddress: String(row.wrapped_native_address).toLowerCase(),
    token0Address: String(row.token0_address).toLowerCase(),
    token1Address: String(row.token1_address).toLowerCase(),
    graduationBlock: Number(row.graduation_block),
    lastIndexedBlock: row.last_indexed_block == null ? null : Number(row.last_indexed_block),
  }));
}

async function getLogsAdaptive(
  provider: ethers.JsonRpcProvider,
  pairAddress: string,
  topics: string[],
  fromBlock: number,
  toBlock: number,
): Promise<ethers.Log[]> {
  if (fromBlock > toBlock) return [];
  const span = toBlock - fromBlock + 1;
  try {
    return await provider.getLogs({
      address: pairAddress,
      topics: [topics],
      fromBlock,
      toBlock,
    });
  } catch (error) {
    if (span <= Math.max(1, ENV.MIN_LOG_CHUNK_SIZE)) throw error;
    const mid = Math.floor((fromBlock + toBlock) / 2);
    const left = await getLogsAdaptive(provider, pairAddress, topics, fromBlock, mid);
    const right = await getLogsAdaptive(provider, pairAddress, topics, mid + 1, toBlock);
    return left.concat(right);
  }
}

async function upsertDexCandle(input: {
  indexedPool: IndexedPool;
  blockTime: Date;
  blockNumber: number;
  logIndex: number;
  priceBnb: string;
  nativeAmountRaw: bigint;
}) {
  const volumeBnb = ethers.formatUnits(input.nativeAmountRaw, 18);
  const resolutions = Object.keys(RESOLUTION_MS) as CandleResolution[];

  for (const resolution of resolutions) {
    await pool.query(
      `insert into public.token_candles(
         chain_id,campaign_address,timeframe,bucket_start,
         o,h,l,c,volume_bnb,trades_count,
         source_mask,bonding_trade_count,dex_trade_count,
         bonding_volume_bnb,dex_volume_bnb,last_block_number,last_log_index,updated_at
       ) values(
         $1,$2,$3,$4,$5,$5,$5,$5,$6,1,
         2,0,1,0,$6,$7,$8,now()
       )
       on conflict(chain_id,campaign_address,timeframe,bucket_start) do update set
         h=greatest(public.token_candles.h,excluded.h),
         l=least(public.token_candles.l,excluded.l),
         c=case
           when coalesce(public.token_candles.last_block_number,-1) < excluded.last_block_number then excluded.c
           when public.token_candles.last_block_number = excluded.last_block_number
            and coalesce(public.token_candles.last_log_index,-1) <= excluded.last_log_index then excluded.c
           else public.token_candles.c
         end,
         volume_bnb=public.token_candles.volume_bnb+excluded.volume_bnb,
         trades_count=public.token_candles.trades_count+1,
         source_mask=(public.token_candles.source_mask::int | 2)::smallint,
         dex_trade_count=public.token_candles.dex_trade_count+1,
         dex_volume_bnb=public.token_candles.dex_volume_bnb+excluded.dex_volume_bnb,
         last_block_number=greatest(coalesce(public.token_candles.last_block_number,-1),excluded.last_block_number),
         last_log_index=case
           when coalesce(public.token_candles.last_block_number,-1) < excluded.last_block_number then excluded.last_log_index
           when public.token_candles.last_block_number = excluded.last_block_number then greatest(coalesce(public.token_candles.last_log_index,-1),excluded.last_log_index)
           else public.token_candles.last_log_index
         end,
         updated_at=now()`,
      [
        input.indexedPool.chainId,
        input.indexedPool.campaignAddress,
        resolution,
        bucketStart(input.blockTime, resolution),
        input.priceBnb,
        volumeBnb,
        input.blockNumber,
        input.logIndex,
      ],
    );
  }
}

async function publishMarketEvent(
  indexedPool: IndexedPool,
  name: string,
  data: Record<string, unknown>,
) {
  try {
    const channel = ablyRest.channels.get(tokenChannel(indexedPool.chainId, indexedPool.campaignAddress));
    await channel.publish(name, {
      chainId: indexedPool.chainId,
      campaignAddress: indexedPool.campaignAddress,
      pairAddress: indexedPool.pairAddress,
      ...data,
    });
  } catch (error: any) {
    console.warn("[wtr] realtime publish failed", name, error?.message || String(error));
  }
}

async function insertSwap(input: {
  indexedPool: IndexedPool;
  log: ethers.Log;
  parsed: ethers.LogDescription;
  block: ethers.Block;
  transactionFrom: string | null;
  tokenDecimals: number;
}): Promise<boolean> {
  const token0IsLaunchToken = input.indexedPool.token0Address === input.indexedPool.tokenAddress;
  const normalized = normalizeTopazSwap(token0IsLaunchToken, {
    amount0In: BigInt(input.parsed.args.amount0In ?? input.parsed.args[1]),
    amount1In: BigInt(input.parsed.args.amount1In ?? input.parsed.args[2]),
    amount0Out: BigInt(input.parsed.args.amount0Out ?? input.parsed.args[3]),
    amount1Out: BigInt(input.parsed.args.amount1Out ?? input.parsed.args[4]),
  });
  if (!normalized) return false;

  const priceBnb = priceBnbFromRaw(
    normalized.tokenAmountRaw,
    normalized.nativeAmountRaw,
    input.tokenDecimals,
    18,
  );
  if (!priceBnb) return false;

  const txHash = input.log.transactionHash.toLowerCase();
  const intent = await pool.query(
    `select intent_id
       from public.trade_intents
      where chain_id=$1 and lower(transaction_hash)=lower($2)
      order by created_at desc
      limit 1`,
    [input.indexedPool.chainId, txHash],
  );
  const tradeIntentId = intent.rows[0]?.intent_id ?? null;
  const sender = String(input.parsed.args.sender ?? input.parsed.args[0] ?? "").toLowerCase() || null;
  const recipient = String(input.parsed.args.to ?? input.parsed.args[5] ?? "").toLowerCase() || null;
  const logIndex = Number(input.log.index);
  const blockTime = new Date(Number(input.block.timestamp) * 1000);

  const inserted = await pool.query(
    `insert into public.dex_trades(
       chain_id,campaign_address,token_address,pair_address,
       tx_hash,log_index,block_number,block_hash,block_time,status,side,
       sender_address,recipient_address,transaction_from,
       token_amount_raw,native_amount_raw,token_amount,native_amount,price_bnb,
       execution_source,origin,trade_intent_id,created_at,updated_at
     ) values(
       $1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed',$10,
       $11,$12,$13,$14,$15,
       ($14::numeric / power(10::numeric,$16)),($15::numeric / 1e18),$17,
       'topaz_v2',$18,$19,now(),now()
     )
     on conflict(chain_id,tx_hash,log_index) do nothing
     returning tx_hash`,
    [
      input.indexedPool.chainId,
      input.indexedPool.campaignAddress,
      input.indexedPool.tokenAddress,
      input.indexedPool.pairAddress,
      txHash,
      logIndex,
      input.log.blockNumber,
      input.block.hash,
      blockTime,
      normalized.side,
      sender,
      recipient,
      input.transactionFrom,
      normalized.tokenAmountRaw.toString(),
      normalized.nativeAmountRaw.toString(),
      input.tokenDecimals,
      priceBnb,
      tradeIntentId ? "memewarzone" : "topaz",
      tradeIntentId,
    ],
  );

  if (!inserted.rowCount) return false;

  await upsertDexCandle({
    indexedPool: input.indexedPool,
    blockTime,
    blockNumber: input.log.blockNumber,
    logIndex,
    priceBnb,
    nativeAmountRaw: normalized.nativeAmountRaw,
  });

  await publishMarketEvent(input.indexedPool, "market_trade", {
    eventId: `${input.indexedPool.chainId}:${txHash}:${logIndex}`,
    source: "topaz",
    origin: tradeIntentId ? "memewarzone" : "topaz",
    side: normalized.side,
    wallet: input.transactionFrom,
    recipient,
    tokenAmountRaw: normalized.tokenAmountRaw.toString(),
    nativeAmountRaw: normalized.nativeAmountRaw.toString(),
    priceBnb,
    txHash,
    logIndex,
    blockNumber: input.log.blockNumber,
    blockTime: blockTime.toISOString(),
    status: "confirmed",
  });

  for (const resolution of Object.keys(RESOLUTION_MS) as CandleResolution[]) {
    await publishMarketEvent(input.indexedPool, "market_candle_upsert", {
      eventId: `${input.indexedPool.chainId}:${input.indexedPool.campaignAddress}:${resolution}:${bucketStart(blockTime, resolution).toISOString()}:${input.log.blockNumber}:${logIndex}`,
      resolution,
      bucketStart: bucketStart(blockTime, resolution).toISOString(),
      priceBnb,
      nativeVolumeRaw: normalized.nativeAmountRaw.toString(),
      blockNumber: input.log.blockNumber,
      logIndex,
      sourceMask: 2,
    });
  }

  return true;
}

async function refreshMarketStats(
  indexedPool: IndexedPool,
  reserveTokenRaw: bigint,
  reserveNativeRaw: bigint,
) {
  const aggregates = await pool.query(
    `select
       coalesce(sum(case when "blockTime">=now()-interval '5 minutes' then ("nativeAmountRaw"::numeric/1e18) else 0 end),0) as volume_5m_bnb,
       coalesce(sum(case when "blockTime">=now()-interval '1 hour' then ("nativeAmountRaw"::numeric/1e18) else 0 end),0) as volume_1h_bnb,
       coalesce(sum(case when "blockTime">=now()-interval '4 hours' then ("nativeAmountRaw"::numeric/1e18) else 0 end),0) as volume_4h_bnb,
       coalesce(sum(case when "blockTime">=now()-interval '24 hours' then ("nativeAmountRaw"::numeric/1e18) else 0 end),0) as volume_24h_bnb,
       coalesce(sum(case when source='bonding' and "blockTime">=now()-interval '24 hours' then ("nativeAmountRaw"::numeric/1e18) else 0 end),0) as bonding_volume_24h_bnb,
       coalesce(sum(case when source='topaz' and "blockTime">=now()-interval '24 hours' then ("nativeAmountRaw"::numeric/1e18) else 0 end),0) as dex_volume_24h_bnb,
       coalesce(sum(case when side='buy' and "blockTime">=now()-interval '24 hours' then ("nativeAmountRaw"::numeric/1e18) else 0 end),0) as buy_volume_24h_bnb,
       coalesce(sum(case when side='sell' and "blockTime">=now()-interval '24 hours' then ("nativeAmountRaw"::numeric/1e18) else 0 end),0) as sell_volume_24h_bnb,
       count(*) filter(where "blockTime">=now()-interval '24 hours')::int as trades_24h,
       count(*) filter(where side='buy' and "blockTime">=now()-interval '24 hours')::int as buys_24h,
       count(*) filter(where side='sell' and "blockTime">=now()-interval '24 hours')::int as sells_24h
     from public.market_trades_v
     where "chainId"=$1 and "campaignAddress"=$2 and status='confirmed'`,
    [indexedPool.chainId, indexedPool.campaignAddress],
  );

  const latest = await pool.query(
    `select "priceBnb","blockNumber","blockTime"
       from public.market_trades_v
      where "chainId"=$1 and "campaignAddress"=$2 and status='confirmed'
      order by "blockNumber" desc,"logIndex" desc
      limit 1`,
    [indexedPool.chainId, indexedPool.campaignAddress],
  );
  const marketState = await pool.query(
    `select post_burn_total_supply_raw
       from public.campaign_market_state
      where chain_id=$1 and campaign_address=$2
      limit 1`,
    [indexedPool.chainId, indexedPool.campaignAddress],
  );

  const aggregate = aggregates.rows[0] || {};
  const latestTrade = latest.rows[0] || {};
  const lastPrice = latestTrade.priceBnb ?? null;
  const supplyRaw = marketState.rows[0]?.post_burn_total_supply_raw ?? null;
  const liquidityBnb = Number(ethers.formatUnits(reserveNativeRaw, 18)) * 2;

  await pool.query(
    `insert into public.market_stats(
       chain_id,campaign_address,market_stage,last_price_bnb,market_cap_bnb,
       liquidity_bnb,bonding_reserve_bnb,
       volume_5m_bnb,volume_1h_bnb,volume_4h_bnb,volume_24h_bnb,
       buy_volume_24h_bnb,sell_volume_24h_bnb,bonding_volume_24h_bnb,dex_volume_24h_bnb,
       trades_24h,buys_24h,sells_24h,post_burn_total_supply_raw,supply_basis,
       last_trade_block,last_trade_at,data_lag_seconds,updated_at
     ) values(
       $1,$2,'TOPAZ_ACTIVE',$3,
       case when $3::numeric is null or $4::numeric is null then null else $3::numeric*($4::numeric/1e18) end,
       $5,(select reserve_bnb from public.token_stats where chain_id=$1 and campaign_address=$2),
       $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$4,'post_burn_total_supply',
       $17,$18,0,now()
     )
     on conflict(chain_id,campaign_address) do update set
       market_stage='TOPAZ_ACTIVE',
       last_price_bnb=excluded.last_price_bnb,
       market_cap_bnb=excluded.market_cap_bnb,
       liquidity_bnb=excluded.liquidity_bnb,
       bonding_reserve_bnb=excluded.bonding_reserve_bnb,
       volume_5m_bnb=excluded.volume_5m_bnb,
       volume_1h_bnb=excluded.volume_1h_bnb,
       volume_4h_bnb=excluded.volume_4h_bnb,
       volume_24h_bnb=excluded.volume_24h_bnb,
       buy_volume_24h_bnb=excluded.buy_volume_24h_bnb,
       sell_volume_24h_bnb=excluded.sell_volume_24h_bnb,
       bonding_volume_24h_bnb=excluded.bonding_volume_24h_bnb,
       dex_volume_24h_bnb=excluded.dex_volume_24h_bnb,
       trades_24h=excluded.trades_24h,
       buys_24h=excluded.buys_24h,
       sells_24h=excluded.sells_24h,
       post_burn_total_supply_raw=excluded.post_burn_total_supply_raw,
       supply_basis=excluded.supply_basis,
       last_trade_block=excluded.last_trade_block,
       last_trade_at=excluded.last_trade_at,
       data_lag_seconds=0,
       updated_at=now()`,
    [
      indexedPool.chainId,
      indexedPool.campaignAddress,
      lastPrice,
      supplyRaw,
      liquidityBnb,
      aggregate.volume_5m_bnb,
      aggregate.volume_1h_bnb,
      aggregate.volume_4h_bnb,
      aggregate.volume_24h_bnb,
      aggregate.buy_volume_24h_bnb,
      aggregate.sell_volume_24h_bnb,
      aggregate.bonding_volume_24h_bnb,
      aggregate.dex_volume_24h_bnb,
      aggregate.trades_24h,
      aggregate.buys_24h,
      aggregate.sells_24h,
      latestTrade.blockNumber ?? null,
      latestTrade.blockTime ?? null,
    ],
  );

  const summary = {
    marketStage: "TOPAZ_ACTIVE",
    lastPriceBnb: lastPrice,
    marketCapBnb: lastPrice && supplyRaw ? Number(lastPrice) * Number(ethers.formatUnits(supplyRaw, 18)) : null,
    liquidityBnb,
    volume5mBnb: aggregate.volume_5m_bnb,
    volume1hBnb: aggregate.volume_1h_bnb,
    volume4hBnb: aggregate.volume_4h_bnb,
    volume24hBnb: aggregate.volume_24h_bnb,
    bondingVolume24hBnb: aggregate.bonding_volume_24h_bnb,
    dexVolume24hBnb: aggregate.dex_volume_24h_bnb,
    trades24h: aggregate.trades_24h,
    buys24h: aggregate.buys_24h,
    sells24h: aggregate.sells_24h,
    lastTradeBlock: latestTrade.blockNumber ?? null,
    lastTradeAt: latestTrade.blockTime ?? null,
    dataLagSeconds: 0,
  };
  await publishMarketEvent(indexedPool, "market_stats_patch", summary);
  return summary;
}

async function scanPool(
  provider: ethers.JsonRpcProvider,
  indexedPool: IndexedPool,
  finalizedHead: number,
) {
  const startBlock = Math.max(
    indexedPool.graduationBlock,
    indexedPool.lastIndexedBlock == null ? indexedPool.graduationBlock : indexedPool.lastIndexedBlock + 1,
  );
  const pair = new ethers.Contract(indexedPool.pairAddress, TOPAZ_POOL_ABI, provider) as any;
  const token = new ethers.Contract(indexedPool.tokenAddress, ERC20_METADATA_ABI, provider) as any;
  const tokenDecimals = Number(await token.decimals());
  const iface = new ethers.Interface(TOPAZ_POOL_ABI);
  const swapEvent = iface.getEvent("Swap");
  const syncEvent = iface.getEvent("Sync");
  if (!swapEvent || !syncEvent) throw new Error("Topaz Swap/Sync ABI missing");

  let insertedTrades = 0;
  let lastSwapAt: Date | null = null;
  let lastSyncAt: Date | null = null;
  let reserve0 = 0n;
  let reserve1 = 0n;

  if (startBlock <= finalizedHead) {
    const logs = await getLogsAdaptive(
      provider,
      indexedPool.pairAddress,
      [swapEvent.topicHash, syncEvent.topicHash],
      startBlock,
      finalizedHead,
    );
    logs.sort((a, b) => a.blockNumber - b.blockNumber || Number(a.index) - Number(b.index));

    const blockCache = new Map<number, ethers.Block>();
    const txFromCache = new Map<string, string | null>();
    for (const log of logs) {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      let block = blockCache.get(log.blockNumber);
      if (!block) {
        const fetched = await provider.getBlock(log.blockNumber);
        if (!fetched) throw new Error(`Missing block ${log.blockNumber}`);
        block = fetched;
        blockCache.set(log.blockNumber, block);
      }
      const eventTime = new Date(Number(block.timestamp) * 1000);

      if (parsed.name === "Sync") {
        reserve0 = BigInt(parsed.args.reserve0 ?? parsed.args[0]);
        reserve1 = BigInt(parsed.args.reserve1 ?? parsed.args[1]);
        lastSyncAt = eventTime;
        continue;
      }
      if (parsed.name !== "Swap") continue;

      const txHash = log.transactionHash.toLowerCase();
      let transactionFrom = txFromCache.get(txHash);
      if (transactionFrom === undefined) {
        const transaction = await provider.getTransaction(txHash);
        transactionFrom = transaction?.from?.toLowerCase() ?? null;
        txFromCache.set(txHash, transactionFrom);
      }

      if (
        await insertSwap({
          indexedPool,
          log,
          parsed,
          block,
          transactionFrom,
          tokenDecimals,
        })
      ) {
        insertedTrades += 1;
      }
      lastSwapAt = eventTime;
    }
  }

  const reserves = await pair.getReserves();
  reserve0 = BigInt(reserves[0]);
  reserve1 = BigInt(reserves[1]);
  const token0IsLaunch = indexedPool.token0Address === indexedPool.tokenAddress;
  const reserveTokenRaw = token0IsLaunch ? reserve0 : reserve1;
  const reserveNativeRaw = token0IsLaunch ? reserve1 : reserve0;

  await pool.query(
    `update public.dex_pools
        set last_indexed_block=$3,
            last_finalized_block=$3,
            last_swap_at=coalesce($4,last_swap_at),
            last_sync_at=coalesce($5,now()),
            reserve_token_raw=$6,
            reserve_native_raw=$7,
            updated_at=now()
      where chain_id=$1 and pair_address=$2`,
    [
      indexedPool.chainId,
      indexedPool.pairAddress,
      finalizedHead,
      lastSwapAt,
      lastSyncAt,
      reserveTokenRaw.toString(),
      reserveNativeRaw.toString(),
    ],
  );

  const summary = await refreshMarketStats(indexedPool, reserveTokenRaw, reserveNativeRaw);
  return { insertedTrades, startBlock, finalizedHead, reserveTokenRaw, reserveNativeRaw, summary };
}

export async function runTopazPoolIndexerOnce() {
  if (!ENV.ENABLE_TOPAZ_POOL_INDEXER) {
    return { enabled: false, pools: 0, insertedTrades: 0, errors: 0 };
  }

  let pools = 0;
  let insertedTrades = 0;
  let errors = 0;

  for (const config of chainConfigs()) {
    let provider: ethers.JsonRpcProvider | null = null;
    try {
      const working = await createWorkingProvider(config.rpcUrls, config.chainId, {
        label: `topaz-pool-indexer chain ${config.chainId}`,
        timeoutMs: ENV.RPC_REQUEST_TIMEOUT_MS,
      });
      provider = working.provider;
      const finalizedHead = Math.max(0, working.headBlock - Math.max(0, ENV.CONFIRMATIONS));
      const indexedPools = await listPools(config.chainId);
      for (const indexedPool of indexedPools) {
        pools += 1;
        try {
          const result = await scanPool(provider, indexedPool, finalizedHead);
          insertedTrades += result.insertedTrades;
          if (result.insertedTrades) {
            console.log("[wtr] Topaz pool indexed", {
              chainId: config.chainId,
              pair: indexedPool.pairAddress,
              campaign: indexedPool.campaignAddress,
              insertedTrades: result.insertedTrades,
              finalizedHead,
              rpc: maskRpcUrl(working.url),
            });
          }
        } catch (error: any) {
          errors += 1;
          await pool.query(
            `update public.campaign_market_state
                set market_stage='TOPAZ_DEGRADED',
                    pool_verified=false,
                    last_error=$3,
                    updated_at=now()
              where chain_id=$1 and campaign_address=$2`,
            [config.chainId, indexedPool.campaignAddress, error?.shortMessage || error?.message || String(error)],
          );
          console.error("[wtr] Topaz pool indexing failed", {
            chainId: config.chainId,
            pair: indexedPool.pairAddress,
            campaign: indexedPool.campaignAddress,
            error: error?.shortMessage || error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      errors += 1;
      console.error("[wtr] Topaz pool indexer RPC unavailable", {
        chainId: config.chainId,
        error: error?.shortMessage || error?.message || String(error),
      });
    } finally {
      provider?.destroy();
    }
  }

  return { enabled: true, pools, insertedTrades, errors };
}

export function startTopazPoolIndexerLoop() {
  if (!ENV.ENABLE_TOPAZ_POOL_INDEXER || globalState[LOOP_SYMBOL]) return;
  globalState[LOOP_SYMBOL] = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runTopazPoolIndexerOnce();
      if (result.insertedTrades || result.errors) console.log("[wtr] Topaz indexer pass", result);
    } catch (error: any) {
      console.error("[wtr] Topaz indexer loop failed", error?.message || String(error));
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(() => void tick(), 4_000);
  initial.unref?.();
  const intervalMs = Math.max(5_000, Number(process.env.TOPAZ_POOL_INDEXER_INTERVAL_MS || 8_000));
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
}
