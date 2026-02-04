import { ethers } from "ethers";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { LAUNCH_FACTORY_ABI, LAUNCH_CAMPAIGN_ABI, UP_VOTE_TREASURY_ABI } from "./abis.js";
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

// ---------------------------------------------------------------------------
// Activity feed helpers
// ---------------------------------------------------------------------------

type CampaignInfo = {
  tokenAddress: string | null;
  name: string | null;
  symbol: string | null;
};

const CAMPAIGN_CACHE = new Map<string, CampaignInfo>();
let activityWritesDisabled = false;

function cacheCampaignInfo(chainId: number, campaign: string, info: CampaignInfo) {
  const key = `${chainId}:${campaign.toLowerCase()}`;
  CAMPAIGN_CACHE.set(key, info);
}

async function getCampaignInfo(chainId: number, campaign: string): Promise<CampaignInfo | null> {
  const key = `${chainId}:${campaign.toLowerCase()}`;
  const cached = CAMPAIGN_CACHE.get(key);
  if (cached) return cached;

  try {
    const r = await pool.query(
      `select token_address, name, symbol
       from public.campaigns
       where chain_id=$1 and campaign_address=$2`,
      [chainId, campaign.toLowerCase()]
    );
    const row = r.rows?.[0];
    const info: CampaignInfo = {
      tokenAddress: row?.token_address ?? null,
      name: row?.name ?? null,
      symbol: row?.symbol ?? null,
    };
    cacheCampaignInfo(chainId, campaign, info);
    return info;
  } catch {
    return null;
  }
}

async function insertActivityEvent(row: {
  chainId: number;
  eventType: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTime: Date;
  actor: string;
  campaign?: string | null;
  token?: string | null;
  amountInWei?: bigint | null;
  amountOutWei?: bigint | null;
  costWei?: bigint | null;
  payoutWei?: bigint | null;
  meta?: Record<string, any> | null;
}) {
  if (activityWritesDisabled) return;

  try {
    await pool.query(
      `insert into public.activity_events(
         chain_id,event_type,tx_hash,log_index,block_number,block_time,
         actor_address,campaign_address,token_address,
         amount_in_wei,amount_out_wei,cost_wei,payout_wei,meta
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (chain_id,tx_hash,log_index) do nothing`,
      [
        row.chainId,
        row.eventType,
        row.txHash.toLowerCase(),
        row.logIndex,
        row.blockNumber,
        row.blockTime,
        row.actor.toLowerCase(),
        row.campaign ? row.campaign.toLowerCase() : null,
        row.token ? row.token.toLowerCase() : null,
        row.amountInWei ? row.amountInWei.toString() : null,
        row.amountOutWei ? row.amountOutWei.toString() : null,
        row.costWei ? row.costWei.toString() : null,
        row.payoutWei ? row.payoutWei.toString() : null,
        row.meta ? JSON.stringify(row.meta) : "{}",
      ]
    );
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("activity_events") || msg.includes("relation")) {
      // Disable further writes to avoid spamming logs if migration is missing.
      activityWritesDisabled = true;
      console.warn("[activity_events] disabled (table missing or invalid).", msg);
      return;
    }
    console.warn("[activity_events] insert failed", msg);
  }
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
  voteTreasuryAddress?: string;
  voteTreasuryStartBlock?: number;
};

const CHAINS: ChainCfg[] = [
  {
    chainId: 97,
    rpcHttp: ENV.BSC_RPC_HTTP_97,
    factoryAddress: ENV.FACTORY_ADDRESS_97 || undefined,
    factoryStartBlock: ENV.FACTORY_START_BLOCK_97 || undefined,
    voteTreasuryAddress: ENV.VOTE_TREASURY_ADDRESS_97 || undefined,
    voteTreasuryStartBlock: ENV.VOTE_TREASURY_START_BLOCK_97 || undefined
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
  factoryAddress: string | null,
  campaign: string,
  token: string,
  creator: string,
  name: string,
  symbol: string,
  createdBlock: number,
  createdAtChain: Date | null = null
) {
  // NOTE: campaigns lives in the *indexer* DB.
  // It is used for discovery + scanning and is separate from user-profile tables.
  // Current schema expects creator_address to be NOT NULL.
  await pool.query(
    `insert into public.campaigns(
        chain_id,factory_address,campaign_address,token_address,creator_address,name,symbol,created_block,created_at_chain,is_active
     )
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
     on conflict (chain_id,campaign_address) do update
       set token_address=coalesce(excluded.token_address, public.campaigns.token_address),
           factory_address=coalesce(public.campaigns.factory_address, excluded.factory_address),
           creator_address=coalesce(excluded.creator_address, public.campaigns.creator_address),
           name=coalesce(excluded.name, public.campaigns.name),
           symbol=coalesce(excluded.symbol, public.campaigns.symbol),
           created_block=(
             case
               -- Treat 0 as "unknown" (older migrations used DEFAULT 0).
               when public.campaigns.created_block is null or public.campaigns.created_block=0 then excluded.created_block
               when excluded.created_block is null or excluded.created_block=0 then public.campaigns.created_block
               else least(public.campaigns.created_block, excluded.created_block)
             end
           ),
           created_at_chain=(
             case
               when public.campaigns.created_at_chain is null then excluded.created_at_chain
               else public.campaigns.created_at_chain
             end
           ),
           is_active=true,
           updated_at=now()`,
    [
      chainId,
      (factoryAddress ? factoryAddress.toLowerCase() : null),
      campaign.toLowerCase(),
      token.toLowerCase(),
      creator.toLowerCase(),
      name,
      symbol,
      createdBlock,
      createdAtChain
    ]
  );

  cacheCampaignInfo(chainId, campaign, {
    tokenAddress: token ? token.toLowerCase() : null,
    name: name || null,
    symbol: symbol || null,
  });
}

async function setCampaignGraduated(
  chainId: number,
  campaign: string,
  graduatedBlock: number,
  graduatedAt: Date,
  txHash: string
) {
  await pool.query(
    `update public.campaigns
       set is_active=false,
           graduated_block=$3,
           graduated_at_chain=$4,
           meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object('graduatedTx', $5),
           updated_at=now()
     where chain_id=$1 and campaign_address=$2`,
    [chainId, campaign.toLowerCase(), graduatedBlock, graduatedAt, txHash.toLowerCase()]
  );
}

async function setCampaignFeeRecipient(
  chainId: number,
  campaign: string,
  feeRecipient: string
) {
  await pool.query(
    `update public.campaigns
       set fee_recipient_address=coalesce(fee_recipient_address, $3),
           updated_at=now()
     where chain_id=$1 and campaign_address=$2`,
    [chainId, campaign.toLowerCase(), feeRecipient.toLowerCase()]
  );
}


async function listActiveCampaigns(chainId: number): Promise<Array<{ campaign: string; createdBlock: number }>> {
  const r = await pool.query(
    `select campaign_address, coalesce(created_block, 0) as created_block
     from public.campaigns
     where chain_id=$1 and is_active=true`,
    [chainId]
  );
  return r.rows.map((x) => ({
    campaign: String(x.campaign_address),
    createdBlock: Number(x.created_block || 0)
  }));
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

async function insertVote(row: {
  chainId: number;
  campaign: string;
  voter: string;
  asset: string; // address(0) for native BNB
  amountRaw: bigint;
  meta: string; // bytes32 hex
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTime: Date;
}) {
  await pool.query(
    `insert into public.votes(
        chain_id,campaign_address,voter_address,asset_address,amount_raw,
        tx_hash,log_index,block_number,block_timestamp,meta,status
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed')
     on conflict (chain_id,tx_hash,log_index) do nothing`,
    [
      row.chainId,
      row.campaign.toLowerCase(),
      row.voter.toLowerCase(),
      row.asset.toLowerCase(),
      row.amountRaw.toString(),
      row.txHash.toLowerCase(),
      row.logIndex,
      row.blockNumber,
      row.blockTime,
      row.meta.toLowerCase()
    ]
  );
}

async function patchVoteAggregates(chainId: number, campaign: string) {
  // Recompute aggregates for a single campaign. This is intentionally simple for v1.
  // If vote volume grows, we can switch to bucketed incremental aggregates.
  const r = await pool.query(
    `with v as (
       select
         count(*) filter (where block_timestamp >= now() - interval '1 hour') as votes_1h,
         count(*) filter (where block_timestamp >= now() - interval '24 hours') as votes_24h,
         count(*) filter (where block_timestamp >= now() - interval '7 days') as votes_7d,
         count(*) as votes_all_time,
         count(*) filter (
           where block_timestamp >= now() - interval '24 hours'
         ) as b0,
         count(*) filter (
           where block_timestamp < now() - interval '24 hours'
             and block_timestamp >= now() - interval '48 hours'
         ) as b1,
         count(*) filter (
           where block_timestamp < now() - interval '48 hours'
             and block_timestamp >= now() - interval '72 hours'
         ) as b2,
         max(block_timestamp) as last_vote_at
       from public.votes
       where chain_id=$1 and campaign_address=$2 and status='confirmed'
     )
     select
       coalesce(votes_1h,0)::int as votes_1h,
       coalesce(votes_24h,0)::int as votes_24h,
       coalesce(votes_7d,0)::int as votes_7d,
       coalesce(votes_all_time,0)::int as votes_all_time,
       (coalesce(b0,0) * 1.0 + coalesce(b1,0) * 0.5 + coalesce(b2,0) * 0.25) as trending_score,
       last_vote_at
     from v`,
    [chainId, campaign.toLowerCase()]
  );

  const x = r.rows[0] || {
    votes_1h: 0,
    votes_24h: 0,
    votes_7d: 0,
    votes_all_time: 0,
    trending_score: 0,
    last_vote_at: null
  };

  await pool.query(
    `insert into public.vote_aggregates(
        chain_id,campaign_address,
        votes_1h,votes_24h,votes_7d,votes_all_time,trending_score,
        last_vote_at,updated_at
     ) values($1,$2,$3,$4,$5,$6,$7,$8,now())
     on conflict (chain_id,campaign_address) do update set
       votes_1h=excluded.votes_1h,
       votes_24h=excluded.votes_24h,
       votes_7d=excluded.votes_7d,
       votes_all_time=excluded.votes_all_time,
       trending_score=excluded.trending_score,
       last_vote_at=excluded.last_vote_at,
       updated_at=now()`,
    [
      chainId,
      campaign.toLowerCase(),
      Number(x.votes_1h || 0),
      Number(x.votes_24h || 0),
      Number(x.votes_7d || 0),
      Number(x.votes_all_time || 0),
      String(x.trending_score || 0),
      x.last_vote_at
    ]
  );
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

    // Best-effort: store created_at_chain using block timestamp
    const blkNums = Array.from(new Set(logs.map((l) => l.blockNumber)));
    const blockTimes = new Map<number, Date>();
    for (const bn of blkNums) {
      const b = await provider.getBlock(bn);
      blockTimes.set(bn, new Date(Number(b?.timestamp || 0) * 1000));
    }

    for (const log of logs) {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      const campaign = String((parsed.args as any).campaign);
      const token = String((parsed.args as any).token);
      const creator = String((parsed.args as any).creator);
      const name = String((parsed.args as any).name);
      const symbol = String((parsed.args as any).symbol);
      const blockTime = blockTimes.get(log.blockNumber) || null;
      await upsertCampaign(
        chain.chainId,
        chain.factoryAddress ?? null,
        campaign,
        token,
        creator,
        name,
        symbol,
        log.blockNumber,
        blockTime
      );

      if (log.transactionHash) {
        await insertActivityEvent({
          chainId: chain.chainId,
          eventType: "CREATE_CAMPAIGN",
          txHash: log.transactionHash,
          logIndex: log.index ?? 0,
          blockNumber: log.blockNumber,
          blockTime: blockTime || new Date(0),
          actor: creator,
          campaign,
          token,
          meta: {
            name,
            symbol,
            factory: chain.factoryAddress ? chain.factoryAddress.toLowerCase() : null,
          },
        });
      }
    }

    await setStateMax(chain.chainId, cursor, end + 1);
  }
}

async function scanVoteTreasuryRange(
  provider: ethers.JsonRpcProvider,
  chain: ChainCfg,
  fromBlock: number,
  toBlock: number
) {
  if (!chain.voteTreasuryAddress) return;

  const iface = new ethers.Interface(UP_VOTE_TREASURY_ABI);
  const eventFrag = iface.getEvent("VoteCast");
  if (!eventFrag) throw new Error("Event VoteCast not found in UP_VOTE_TREASURY_ABI");
  const topic0 = eventFrag.topicHash;

  const cursor = "votes";
  const step = ENV.LOG_CHUNK_SIZE;

  for (let start = fromBlock; start <= toBlock; start += step) {
    const end = Math.min(toBlock, start + step - 1);

    const logs = await getLogsSafe(provider, {
      address: chain.voteTreasuryAddress,
      fromBlock: start,
      toBlock: end,
      topics: [topic0]
    });

    if (logs.length) {
      const blkNums = Array.from(new Set(logs.map((l) => l.blockNumber)));
      const blockTimes = new Map<number, Date>();
      for (const bn of blkNums) {
        const b = await provider.getBlock(bn);
        blockTimes.set(bn, new Date(Number(b?.timestamp || 0) * 1000));
      }

      const touched = new Set<string>();
      for (const log of logs) {
        const parsed = iface.parseLog(log);
        if (!parsed) continue;

        const campaign = String((parsed.args as any).campaign);
        const voter = String((parsed.args as any).voter);
        const asset = String((parsed.args as any).asset);
        const amountPaid = (parsed.args as any).amountPaid as bigint;
        const meta = String((parsed.args as any).meta);

        await insertVote({
          chainId: chain.chainId,
          campaign,
          voter,
          asset,
          amountRaw: amountPaid,
          meta,
          txHash: log.transactionHash,
          logIndex: log.index,
          blockNumber: log.blockNumber,
          blockTime: blockTimes.get(log.blockNumber) || new Date(0)
        });

        await insertActivityEvent({
          chainId: chain.chainId,
          eventType: "UPVOTE",
          txHash: log.transactionHash,
          logIndex: log.index ?? 0,
          blockNumber: log.blockNumber,
          blockTime: blockTimes.get(log.blockNumber) || new Date(0),
          actor: voter,
          campaign,
          amountInWei: amountPaid,
          meta: {
            asset: asset?.toLowerCase?.() ?? asset,
            meta,
          },
        });

        touched.add(campaign.toLowerCase());
      }

      for (const c of touched) {
        await patchVoteAggregates(chain.chainId, c);
      }
    }

    await setStateMax(chain.chainId, cursor, end + 1);
  }
}



// ---------------------------------------------------------------------------
// Robust campaign discovery
// ---------------------------------------------------------------------------
//
// Some public RPCs can occasionally return incomplete eth_getLogs results.
// If that happens during the factory scan, we may miss a CampaignCreated event
// but still advance the factory cursor, causing the indexer to never learn about
// that campaign (and therefore never index its trades).
//
// To make discovery deterministic, we also periodically pull the factory's
// on-chain campaign registry (campaignsCount/getCampaign) and upsert any missing
// rows into public.campaigns.
//
async function syncFactoryCampaignsByCall(
  provider: ethers.JsonRpcProvider,
  chain: ChainCfg
) {
  if (!chain.factoryAddress) return;

  const factory = new ethers.Contract(chain.factoryAddress, LAUNCH_FACTORY_ABI, provider);

  let countBn: bigint;
  try {
    countBn = (await factory.campaignsCount()) as bigint;
  } catch (e) {
    console.warn("syncFactoryCampaignsByCall: campaignsCount failed", { chainId: chain.chainId }, e);
    return;
  }

  const count = Number(countBn);
  if (!Number.isFinite(count) || count <= 0) return;

  // Build a set of known campaigns (lowercased)
  const r = await pool.query(
    `select lower(campaign_address) as campaign
       from public.campaigns
      where chain_id=$1`,
    [chain.chainId]
  );
  const known = new Set<string>(r.rows.map((x) => String(x.campaign)));

  for (let i = 0; i < count; i++) {
    let info: any;
    try {
      info = await factory.getCampaign(i);
    } catch (e) {
      // Skip invalid ids rather than failing the whole sync
      continue;
    }

    const campaign = String(info?.campaign ?? info?.[0] ?? "").trim();
    if (!campaign || campaign === ethers.ZeroAddress) continue;

    const key = campaign.toLowerCase();
    if (known.has(key)) continue;

    const token = String(info?.token ?? info?.[1] ?? "").trim();
    const creator = String(info?.creator ?? info?.[2] ?? "").trim();
    const name = String(info?.name ?? info?.[3] ?? "").trim();
    const symbol = String(info?.symbol ?? info?.[4] ?? "").trim();

    const createdAtRaw = info?.createdAt ?? info?.[9];
    const createdAtSec = createdAtRaw !== undefined && createdAtRaw !== null ? Number(createdAtRaw) : 0;
    const createdAt = createdAtSec > 0 ? new Date(createdAtSec * 1000) : null;

    await upsertCampaign(chain.chainId, chain.factoryAddress ?? null, campaign, token, creator, name, symbol, 0, createdAt);
    known.add(key);

    console.log("Discovered missing campaign via factory registry", {
      chainId: chain.chainId,
      id: i,
      campaign: key
    });
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
  const finFrag = iface.getEvent("CampaignFinalized");
  if (!buyFrag || !sellFrag || !finFrag) throw new Error("Missing TokensPurchased/TokensSold/CampaignFinalized in LAUNCH_CAMPAIGN_ABI");

  const buyTopic = buyFrag.topicHash;
  const sellTopic = sellFrag.topicHash;
  const finTopic = finFrag.topicHash;

  const cursor = `campaign:${campaign.toLowerCase()}`;
  const step = ENV.LOG_CHUNK_SIZE;
  const blockTimeCache = new Map<number, number>();
  const campaignInfo = await getCampaignInfo(chainId, campaign);
  const tokenAddr = campaignInfo?.tokenAddress ?? null;

  // Best-effort: hydrate campaign feeRecipient for anti-abuse checks (Largest Buys).
  try {
    const rr = await pool.query(
      `select fee_recipient_address from public.campaigns where chain_id=$1 and campaign_address=$2`,
      [chainId, campaign.toLowerCase()]
    );
    const existing = rr.rows?.[0]?.fee_recipient_address ? String(rr.rows[0].fee_recipient_address) : "";
    if (!existing) {
      const c = new ethers.Contract(campaign, LAUNCH_CAMPAIGN_ABI, provider);
      const fr = String(await c.feeRecipient());
      if (/^0x[a-fA-F0-9]{40}$/.test(fr)) {
        await setCampaignFeeRecipient(chainId, campaign, fr);
      }
    }
  } catch {
    // ignore
  }

  for (let start = fromBlock; start <= toBlock; start += step) {
    const end = Math.min(toBlock, start + step - 1);

    const logs = await getLogsSafe(provider, {
      address: campaign,
      fromBlock: start,
      toBlock: end,
      topics: [[buyTopic, sellTopic, finTopic]]
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

        await insertActivityEvent({
          chainId,
          eventType: "BUY",
          txHash,
          logIndex,
          blockNumber: log.blockNumber,
          blockTime: new Date(tsSec * 1000),
          actor: buyer,
          campaign,
          token: tokenAddr,
          amountInWei: cost,
          amountOutWei: amountOut,
          costWei: cost,
          meta: { priceBnb },
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

        await insertActivityEvent({
          chainId,
          eventType: "SELL",
          txHash,
          logIndex,
          blockNumber: log.blockNumber,
          blockTime: new Date(tsSec * 1000),
          actor: seller,
          campaign,
          token: tokenAddr,
          amountInWei: amountIn,
          amountOutWei: payout,
          payoutWei: payout,
          meta: { priceBnb },
        });

        if (priceBnb !== null) {
          for (const tf of TIMEFRAMES) {
            const b = bucketStart(tsSec, tf);
            await upsertCandle(chainId, campaign, tf, b, priceBnb, bnbAmount);
          }
        }
      } else if (name === "CampaignFinalized") {
        const caller = String((parsed.args as any).caller ?? "");
        const liquidityTokens = (parsed.args as any).liquidityTokens as bigint;
        const liquidityBnb = (parsed.args as any).liquidityBnb as bigint;
        const protocolFee = (parsed.args as any).protocolFee as bigint;
        const creatorPayout = (parsed.args as any).creatorPayout as bigint;

        await insertActivityEvent({
          chainId,
          eventType: "FINALIZE",
          txHash,
          logIndex,
          blockNumber: log.blockNumber,
          blockTime: new Date(tsSec * 1000),
          actor: caller || campaign,
          campaign,
          token: tokenAddr,
          meta: {
            liquidityTokens: liquidityTokens?.toString?.() ?? null,
            liquidityBnb: liquidityBnb?.toString?.() ?? null,
            protocolFee: protocolFee?.toString?.() ?? null,
            creatorPayout: creatorPayout?.toString?.() ?? null,
          },
        });

        // Graduation marker for league categories
        await setCampaignGraduated(chainId, campaign, log.blockNumber, new Date(tsSec * 1000), txHash);
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
      const baselineStart = computeStartBlock(chain, target, state);
      const windowStart = Math.max(0, target - opts.lookbackBlocks);
      const from = opts.mode === "repair"
        ? Math.max(windowStart, Math.max(0, state - opts.rewindBlocks))
        : Math.max(baselineStart, windowStart);

      await withProviderRetry((p) => scanFactoryRange(p, chain, from, target));
      // Deterministic discovery: pull campaigns directly from the factory registry
      await withProviderRetry((p) => syncFactoryCampaignsByCall(p, chain));
    } catch (e) {
      console.error("scanFactory error (all RPCs failed)", { chainId: chain.chainId }, e);
    }

    // ---------------- VoteTreasury scan ----------------
    try {
      if (chain.voteTreasuryAddress) {
        const cursor = "votes";
        const state = await getState(chain.chainId, cursor);
        const windowStart = Math.max(0, target - opts.lookbackBlocks);

        // Prefer configured start block, otherwise fallback to rolling lookback.
        const startHint = chain.voteTreasuryStartBlock || 0;
        const from = opts.mode === "repair"
          ? Math.max(windowStart, Math.max(0, state - opts.rewindBlocks))
          : (state > 0 ? state : (startHint > 0 ? startHint : windowStart));

        await withProviderRetry((p) => scanVoteTreasuryRange(p, chain, from, target));
      }
    } catch (e) {
      console.error("scanVoteTreasury error (all RPCs failed)", { chainId: chain.chainId }, e);
    }

    // ---------------- Campaign scans ----------------
    let campaigns: Array<{ campaign: string; createdBlock: number }> = [];
    try {
      campaigns = await listActiveCampaigns(chain.chainId);
    } catch (e) {
      console.error("listActiveCampaigns error", { chainId: chain.chainId }, e);
      continue;
    }

    for (const c of campaigns) {
      const campaign = c.campaign;
      try {
        const cursor = `campaign:${campaign.toLowerCase()}`;
        const state = await getState(chain.chainId, cursor);
        const windowStart = Math.max(0, target - opts.lookbackBlocks);

        // Prefer a deterministic start block when we have no state yet.
        // This prevents "newly discovered" campaigns from missing older trades
        // that fall outside the rolling lookback window.
        const campaignStart = c.createdBlock && c.createdBlock > 0
          ? c.createdBlock
          : (chain.factoryStartBlock || 0);

        // In normal mode, campaign scans should start from their cursor state.
        // In repair mode, rewind the cursor slightly but never earlier than windowStart.
        const from = opts.mode === "repair"
          ? Math.max(windowStart, Math.max(0, state - opts.rewindBlocks))
          : (state > 0 ? state : (campaignStart > 0 ? campaignStart : windowStart));

        await withProviderRetry((p) => scanCampaignRange(p, chain.chainId, campaign, from, target));
      } catch (e) {
        console.error("scanCampaign error (all RPCs failed)", { chainId: chain.chainId, campaign }, e);
      }
    }
  }
}
