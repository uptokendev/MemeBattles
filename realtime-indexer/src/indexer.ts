import { ethers } from "ethers";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { LAUNCH_FACTORY_ABI, LAUNCH_CAMPAIGN_ABI } from "./abis.js";
import { TIMEFRAMES, bucketStart, TF } from "./timeframes.js";
import { publishTrade, publishCandle, publishStats } from "./ably.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDec18(x: bigint): number {
  return Number(ethers.formatUnits(x, 18));
}

function parseRpcList(v: string): string[] {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRateLimitError(e: any): boolean {
  const msg = String(e?.shortMessage || e?.message || "").toLowerCase();
  if (msg.includes("rate limit")) return true;

  // ethers v6 BAD_DATA wrapping JSON-RPC batch errors
  const v = e?.value;
  if (Array.isArray(v) && v[0]?.error?.code === -32005) return true;
  const infoV = e?.info?.value;
  if (Array.isArray(infoV) && infoV[0]?.error?.code === -32005) return true;
  const inner = e?.error;
  if (inner?.code === -32005) return true;
  return false;
}

function isPrunedHistoryError(e: any): boolean {
  // Seen on some providers (e.g., Allnodes) for old eth_getLogs ranges
  const code = e?.error?.code ?? e?.code;
  if (code === -32701) return true;
  const msg = String(e?.shortMessage || e?.message || e?.error?.message || "").toLowerCase();
  if (msg.includes("history has been pruned")) return true;
  if (msg.includes("pruned")) return true;
  return false;
}

function isRpcTransportError(e: any): boolean {
  const msg = String(e?.shortMessage || e?.message || "").toLowerCase();

  // Common transient gateway/network failures from public RPCs
  if (msg.includes("service unavailable") || msg.includes("503")) return true;
  if (msg.includes("bad gateway") || msg.includes("502")) return true;
  if (msg.includes("gateway timeout") || msg.includes("504")) return true;
  if (msg.includes("overflow")) return true;

  // TLS/connection problems (Railway/Node networking)
  if (msg.includes("handshake failure")) return true;
  if (msg.includes("eproto")) return true;
  if (msg.includes("econnreset") || msg.includes("connection reset")) return true;
  if (msg.includes("etimedout") || msg.includes("timeout")) return true;

  // Ethers sometimes nests these
  const code = String(e?.code || "");
  if (code === "SERVER_ERROR") return true;

  return false;
}

async function getLogsSafe(provider: ethers.JsonRpcProvider, filter: any, depth = 0): Promise<ethers.Log[]> {
  try {
    return await provider.getLogs(filter);
  } catch (e: any) {
    // Pruned history should not be retried on the SAME provider.
    if (isPrunedHistoryError(e)) throw e;

    if (!isRateLimitError(e)) throw e;

    const from = typeof filter?.fromBlock === "number" ? filter.fromBlock : null;
    const to = typeof filter?.toBlock === "number" ? filter.toBlock : null;

    // If the range is large, split it (dramatically reduces eth_getLogs load on public RPCs)
    if (from !== null && to !== null) {
      const span = to - from + 1;
      if (span > ENV.MIN_LOG_CHUNK_SIZE && depth < 12) {
        const mid = Math.floor((from + to) / 2);
        const left = await getLogsSafe(provider, { ...filter, fromBlock: from, toBlock: mid }, depth + 1);
        const right = await getLogsSafe(provider, { ...filter, fromBlock: mid + 1, toBlock: to }, depth + 1);
        return left.concat(right);
      }
    }

    // Otherwise, backoff + retry a few times
    let delay = 750;
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(delay + Math.floor(Math.random() * 250));
      try {
        return await provider.getLogs(filter);
      } catch (e2: any) {
        if (isPrunedHistoryError(e2)) throw e2;
        if (!isRateLimitError(e2)) throw e2;
      }
      delay = Math.min(15_000, delay * 2);
    }

    throw e;
  }
}

// ---------------------------------------------------------------------------
// Chain config
// ---------------------------------------------------------------------------

type ChainCfg = {
  chainId: number;
  rpcHttp: string; // comma-separated list
  factoryAddress?: string;
  factoryStartBlock?: number;
};

const CHAINS: ChainCfg[] = [
  {
    chainId: 97,
    rpcHttp: ENV.BSC_RPC_HTTP_97,
    factoryAddress: ENV.FACTORY_ADDRESS_97 || undefined,
    factoryStartBlock: ENV.FACTORY_START_BLOCK_97 || undefined
  }
  // enable later:
  // {
  //   chainId: 56,
  //   rpcHttp: ENV.BSC_RPC_HTTP_56,
  //   factoryAddress: ENV.FACTORY_ADDRESS_56 || undefined,
  //   factoryStartBlock: ENV.FACTORY_START_BLOCK_56 || undefined
  // }
];

// ---------------------------------------------------------------------------
// DB state
// ---------------------------------------------------------------------------

async function getState(chainId: number, cursor: string): Promise<number> {
  const r = await pool.query(
    `select last_indexed_block from public.indexer_state where chain_id=$1 and cursor=$2`,
    [chainId, cursor]
  );
  if (!r.rowCount) return 0;
  return Number(r.rows[0].last_indexed_block);
}

async function setStateMax(chainId: number, cursor: string, nextBlock: number) {
  // Do NOT allow the state to move backwards (repair jobs may scan earlier windows)
  await pool.query(
    `insert into public.indexer_state(chain_id,cursor,last_indexed_block)
     values($1,$2,$3)
     on conflict (chain_id,cursor) do update
       set last_indexed_block = greatest(public.indexer_state.last_indexed_block, excluded.last_indexed_block),
           updated_at=now()`,
    [chainId, cursor, nextBlock]
  );
}

async function upsertCampaign(
  chainId: number,
  campaign: string,
  token: string,
  creator: string,
  name: string,
  symbol: string,
  createdBlock: number
) {
  // NOTE: campaigns lives in the *indexer* DB.
  // It is used for discovery + scanning and is separate from user-profile tables.
  // Current schema expects creator_address to be NOT NULL.
  await pool.query(
    `insert into public.campaigns(
        chain_id,campaign_address,token_address,creator_address,name,symbol,created_block,is_active
     )
     values($1,$2,$3,$4,$5,$6,$7,true)
     on conflict (chain_id,campaign_address) do update
       set token_address=coalesce(excluded.token_address, public.campaigns.token_address),
           creator_address=coalesce(excluded.creator_address, public.campaigns.creator_address),
           name=coalesce(excluded.name, public.campaigns.name),
           symbol=coalesce(excluded.symbol, public.campaigns.symbol),
           created_block=least(public.campaigns.created_block, excluded.created_block),
           is_active=true,
           updated_at=now()`,
    [
      chainId,
      campaign.toLowerCase(),
      token.toLowerCase(),
      creator.toLowerCase(),
      name,
      symbol,
      createdBlock
    ]
  );
}

async function listActiveCampaigns(chainId: number): Promise<string[]> {
  const r = await pool.query(
    `select campaign_address from public.campaigns where chain_id=$1 and is_active=true`,
    [chainId]
  );
  return r.rows.map((x) => String(x.campaign_address));
}

async function insertTrade(row: {
  chainId: number;
  campaign: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTime: Date;
  side: "buy" | "sell";
  wallet: string;
  tokenRaw: bigint;
  bnbRaw: bigint;
}) {
  const tokenAmount = toDec18(row.tokenRaw);
  const bnbAmount = toDec18(row.bnbRaw);
  const priceBnb = tokenAmount > 0 ? bnbAmount / tokenAmount : null;

  await pool.query(
    `insert into public.curve_trades(
        chain_id,campaign_address,tx_hash,log_index,block_number,block_time,
        side,wallet,token_amount_raw,bnb_amount_raw,token_amount,bnb_amount,price_bnb
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (chain_id,tx_hash,log_index) do nothing`,
    [
      row.chainId,
      row.campaign.toLowerCase(),
      row.txHash.toLowerCase(),
      row.logIndex,
      row.blockNumber,
      row.blockTime,
      row.side,
      row.wallet.toLowerCase(),
      row.tokenRaw.toString(),
      row.bnbRaw.toString(),
      tokenAmount,
      bnbAmount,
      priceBnb
    ]
  );

  return { tokenAmount, bnbAmount, priceBnb };
}

async function upsertCandle(
  chainId: number,
  campaign: string,
  tf: TF,
  bucketSec: number,
  price: number,
  volBnb: number
) {
  const bucketTs = new Date(bucketSec * 1000);

  await pool.query(
    `insert into public.token_candles(
        chain_id,campaign_address,timeframe,bucket_start,o,h,l,c,volume_bnb,trades_count
     ) values($1,$2,$3,$4,$5,$5,$5,$5,$6,1)
     on conflict (chain_id,campaign_address,timeframe,bucket_start) do update set
       h = greatest(public.token_candles.h, excluded.h),
       l = least(public.token_candles.l, excluded.l),
       c = excluded.c,
       volume_bnb = public.token_candles.volume_bnb + excluded.volume_bnb,
       trades_count = public.token_candles.trades_count + 1,
       updated_at = now()`,
    [chainId, campaign.toLowerCase(), tf, bucketTs, price, volBnb]
  );

  // Lightweight realtime patch (authoritative values come from REST)
  await publishCandle(chainId, campaign, {
    type: "candle_upsert",
    tf,
    bucket: bucketSec,
    c: String(price),
    v: String(volBnb)
  });
}

async function patchStats(chainId: number, campaign: string) {
  const r = await pool.query(
    `with t as (
       select price_bnb, block_time, bnb_amount
       from public.curve_trades
       where chain_id=$1 and campaign_address=$2
       order by block_number desc, log_index desc
       limit 1
     ),
     v as (
       select coalesce(sum(bnb_amount),0) as vol24h
       from public.curve_trades
       where chain_id=$1 and campaign_address=$2
         and block_time >= now() - interval '24 hours'
     )
     select
       (select price_bnb from t) as last_price_bnb,
       (select vol24h from v) as vol24h_bnb`,
    [chainId, campaign.toLowerCase()]
  );

  const lastPrice: number | null = r.rows[0]?.last_price_bnb ?? null;
  const vol24h: number = Number(r.rows[0]?.vol24h_bnb ?? 0);

  const soldRes = await pool.query(
    `select
       coalesce(sum(case when side='buy' then token_amount else 0 end),0) -
       coalesce(sum(case when side='sell' then token_amount else 0 end),0) as sold
     from public.curve_trades
     where chain_id=$1 and campaign_address=$2`,
    [chainId, campaign.toLowerCase()]
  );

  const sold: number = Number(soldRes.rows[0]?.sold ?? 0);
  const marketcap: number | null = lastPrice !== null ? lastPrice * sold : null;

  await pool.query(
    `insert into public.token_stats(
        chain_id,campaign_address,last_price_bnb,sold_tokens,marketcap_bnb,vol_24h_bnb,updated_at
     ) values($1,$2,$3,$4,$5,$6,now())
     on conflict (chain_id,campaign_address) do update set
       last_price_bnb=excluded.last_price_bnb,
       sold_tokens=excluded.sold_tokens,
       marketcap_bnb=excluded.marketcap_bnb,
       vol_24h_bnb=excluded.vol_24h_bnb,
       updated_at=now()`,
    [chainId, campaign.toLowerCase(), lastPrice, sold, marketcap, vol24h]
  );

  await publishStats(chainId, campaign, {
    type: "stats_patch",
    lastPriceBnb: lastPrice !== null ? String(lastPrice) : null,
    marketcapBnb: marketcap !== null ? String(marketcap) : null,
    vol24hBnb: String(vol24h)
  });
}

// ---------------------------------------------------------------------------
// On-chain scans
// ---------------------------------------------------------------------------

async function scanFactoryRange(
  provider: ethers.JsonRpcProvider,
  chain: ChainCfg,
  fromBlock: number,
  toBlock: number
) {
  if (!chain.factoryAddress) return;

  const iface = new ethers.Interface(LAUNCH_FACTORY_ABI);
  const eventFrag = iface.getEvent("CampaignCreated");
  if (!eventFrag) throw new Error("Event CampaignCreated not found in LAUNCH_FACTORY_ABI");
  const topic0 = eventFrag.topicHash;

  const cursor = "factory";
  const step = ENV.LOG_CHUNK_SIZE;

  for (let start = fromBlock; start <= toBlock; start += step) {
    const end = Math.min(toBlock, start + step - 1);

    const logs = await getLogsSafe(provider, {
      address: chain.factoryAddress,
      fromBlock: start,
      toBlock: end,
      topics: [topic0]
    });

    for (const log of logs) {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      const campaign = String((parsed.args as any).campaign);
      const token = String((parsed.args as any).token);
      const creator = String((parsed.args as any).creator);
      const name = String((parsed.args as any).name);
      const symbol = String((parsed.args as any).symbol);
      await upsertCampaign(chain.chainId, campaign, token, creator, name, symbol, log.blockNumber);
    }

    await setStateMax(chain.chainId, cursor, end + 1);
  }
}

async function scanCampaignRange(
  provider: ethers.JsonRpcProvider,
  chainId: number,
  campaign: string,
  fromBlock: number,
  toBlock: number
) {
  const iface = new ethers.Interface(LAUNCH_CAMPAIGN_ABI);

  const buyFrag = iface.getEvent("TokensPurchased");
  const sellFrag = iface.getEvent("TokensSold");
  if (!buyFrag || !sellFrag) throw new Error("Missing TokensPurchased/TokensSold in LAUNCH_CAMPAIGN_ABI");

  const buyTopic = buyFrag.topicHash;
  const sellTopic = sellFrag.topicHash;

  const cursor = `campaign:${campaign.toLowerCase()}`;
  const step = ENV.LOG_CHUNK_SIZE;
  const blockTimeCache = new Map<number, number>();

  for (let start = fromBlock; start <= toBlock; start += step) {
    const end = Math.min(toBlock, start + step - 1);

    const logs = await getLogsSafe(provider, {
      address: campaign,
      fromBlock: start,
      toBlock: end,
      topics: [[buyTopic, sellTopic]]
    });

    logs.sort((a, b) => a.blockNumber - b.blockNumber || ((a.index ?? 0) - (b.index ?? 0)));

    for (const log of logs) {
      const txHash = log.transactionHash;
      if (!txHash) continue;

      let tsSec = blockTimeCache.get(log.blockNumber);
      if (!tsSec) {
        const blk = await provider.getBlock(log.blockNumber);
        tsSec = Number(blk?.timestamp ?? Math.floor(Date.now() / 1000));
        blockTimeCache.set(log.blockNumber, tsSec);
      }

      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      const name = parsed.name;
      const logIndex = log.index ?? 0;

      if (name === "TokensPurchased") {
        const buyer = String((parsed.args as any).buyer);
        const amountOut = (parsed.args as any).amountOut as bigint;
        const cost = (parsed.args as any).cost as bigint;

        const { tokenAmount, bnbAmount, priceBnb } = await insertTrade({
          chainId,
          campaign,
          txHash,
          logIndex,
          blockNumber: log.blockNumber,
          blockTime: new Date(tsSec * 1000),
          side: "buy",
          wallet: buyer,
          tokenRaw: amountOut,
          bnbRaw: cost
        });

        await publishTrade(chainId, campaign, {
          type: "trade",
          chainId,
          token: campaign.toLowerCase(),
          txHash,
          logIndex,
          side: "buy",
          wallet: buyer.toLowerCase(),
          tokenAmount: String(tokenAmount),
          bnbAmount: String(bnbAmount),
          priceBnb: priceBnb !== null ? String(priceBnb) : null,
          ts: tsSec,
          blockNumber: log.blockNumber
        });

        if (priceBnb !== null) {
          for (const tf of TIMEFRAMES) {
            const b = bucketStart(tsSec, tf);
            await upsertCandle(chainId, campaign, tf, b, priceBnb, bnbAmount);
          }
        }
      } else if (name === "TokensSold") {
        const seller = String((parsed.args as any).seller);
        const amountIn = (parsed.args as any).amountIn as bigint;
        const payout = (parsed.args as any).payout as bigint;

        const { tokenAmount, bnbAmount, priceBnb } = await insertTrade({
          chainId,
          campaign,
          txHash,
          logIndex,
          blockNumber: log.blockNumber,
          blockTime: new Date(tsSec * 1000),
          side: "sell",
          wallet: seller,
          tokenRaw: amountIn,
          bnbRaw: payout
        });

        await publishTrade(chainId, campaign, {
          type: "trade",
          chainId,
          token: campaign.toLowerCase(),
          txHash,
          logIndex,
          side: "sell",
          wallet: seller.toLowerCase(),
          tokenAmount: String(tokenAmount),
          bnbAmount: String(bnbAmount),
          priceBnb: priceBnb !== null ? String(priceBnb) : null,
          ts: tsSec,
          blockNumber: log.blockNumber
        });

        if (priceBnb !== null) {
          for (const tf of TIMEFRAMES) {
            const b = bucketStart(tsSec, tf);
            await upsertCandle(chainId, campaign, tf, b, priceBnb, bnbAmount);
          }
        }
      }
    }

    await setStateMax(chainId, cursor, end + 1);
    if (logs.length > 0) await patchStats(chainId, campaign);
  }
}

function computeStartBlock(chain: ChainCfg, headTarget: number, existingState: number): number {
  // Priority:
  //  1) If state is already set, use it
  //  2) Else use configured factoryStartBlock (if set)
  //  3) Else fallback to headTarget - lookback
  if (existingState > 0) return existingState;
  if ((chain.factoryStartBlock ?? 0) > 0) return Number(chain.factoryStartBlock);
  return Math.max(0, headTarget - ENV.FACTORY_LOOKBACK_BLOCKS);
}

// ---------------------------------------------------------------------------
// Public entrypoints
// ---------------------------------------------------------------------------

export async function runIndexerOnce() {
  await runIndexerCore({
    mode: "normal",
    lookbackBlocks: ENV.FACTORY_LOOKBACK_BLOCKS,
    rewindBlocks: 0
  });
}

// Runs a bounded repair window: rewinds per-cursor state and replays recent logs.
export async function runRepairOnce() {
  await runIndexerCore({
    mode: "repair",
    lookbackBlocks: ENV.REPAIR_LOOKBACK_BLOCKS,
    rewindBlocks: ENV.REPAIR_REWIND_BLOCKS
  });
}

async function runIndexerCore(opts: { mode: "normal" | "repair"; lookbackBlocks: number; rewindBlocks: number }) {
  for (const chain of CHAINS) {
    const rpcList = parseRpcList(chain.rpcHttp);
    if (rpcList.length === 0) {
      console.error("No RPC URLs configured for chain", chain.chainId);
      continue;
    }

    let rpcIdx = 0;

    const makeProvider = () =>
      new ethers.JsonRpcProvider(rpcList[rpcIdx], undefined, {
        // reduce batch eth_getLogs pressure on public endpoints
        batchMaxCount: 1,
        batchStallTime: 0
      });

    const rotate = () => {
      rpcIdx = (rpcIdx + 1) % rpcList.length;
    };

    const withProviderRetry = async <T>(fn: (p: ethers.JsonRpcProvider) => Promise<T>): Promise<T> => {
      let lastErr: any;

      // try up to 2 full rotations
      for (let attempt = 0; attempt < rpcList.length * 2; attempt++) {
        const p = makeProvider();
        const url = rpcList[rpcIdx];

        try {
          return await fn(p);
        } catch (e: any) {
          lastErr = e;

          if (isRateLimitError(e) || isRpcTransportError(e) || isPrunedHistoryError(e)) {
            console.warn("RPC error; rotating endpoint", {
              chainId: chain.chainId,
              rpc: url,
              err: e?.shortMessage || e?.message || e
            });

            rotate();
            await sleep(500 + Math.floor(Math.random() * 500));
            continue;
          }

          // Non-transient error: bubble up
          throw e;
        }
      }

      throw lastErr;
    };

    // Compute scanning head for this pass
    const head = await withProviderRetry((p) => p.getBlockNumber());
    const target = Math.max(0, head - ENV.CONFIRMATIONS);

   // ---------------- Factory scan ----------------
try {
  const cursor = "factory";
  const state = await getState(chain.chainId, cursor);

  // Start from cursor if set, else FACTORY_START_BLOCK_97 (or fallback)
  const baselineStart = computeStartBlock(chain, target, state);

  const from =
    opts.mode === "repair"
      ? Math.max(0, Math.max(state - opts.rewindBlocks, target - opts.lookbackBlocks))
      : baselineStart; // IMPORTANT: do NOT clamp by windowStart in normal mode

  const to = Math.min(target, from + ENV.MAX_FACTORY_SCAN_BLOCKS - 1);

  if (from <= to) {
    await withProviderRetry((p) => scanFactoryRange(p, chain, from, to));
  }
} catch (e) {
  console.error("scanFactory error (all RPCs failed)", { chainId: chain.chainId }, e);
    // ---------------- Campaign scans ----------------
    let campaigns: string[] = [];
    try {
      campaigns = await listActiveCampaigns(chain.chainId);
    } catch (e) {
      console.error("listActiveCampaigns error", { chainId: chain.chainId }, e);
      continue;
    }

    for (const campaign of campaigns) {
  try {
    const cursor = `campaign:${campaign.toLowerCase()}`;
    const state = await getState(chain.chainId, cursor);

    // If we have a cursor, continue from it; otherwise only scan recent history
    const windowStart = Math.max(0, target - opts.lookbackBlocks);
    const from = state > 0 ? state : windowStart;

    // Cap per tick so we actually advance and eventually reach head
    const to = Math.min(target, from + ENV.MAX_CAMPAIGN_SCAN_BLOCKS - 1);
if (from <= to) {
  await withProviderRetry((p) => scanCampaignRange(p, chain.chainId, campaign, from, to));
}
  } catch (e) {
    console.error("scanCampaign error (all RPCs failed)", { chainId: chain.chainId, campaign }, e);
  }
}
  }
}
}