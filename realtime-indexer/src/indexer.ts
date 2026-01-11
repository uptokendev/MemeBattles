import { ethers } from "ethers";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { LAUNCH_FACTORY_ABI, LAUNCH_CAMPAIGN_ABI } from "./abis.js";
import { TIMEFRAMES, bucketStart, TF } from "./timeframes.js";
import { publishTrade, publishCandle, publishStats } from "./ably.js";

type ChainCfg = {
  chainId: number;
  rpcHttp: string;
  factoryAddress?: string;
};

const CHAINS: ChainCfg[] = [
  {
    chainId: 97,
    rpcHttp: ENV.BSC_RPC_HTTP_97,
    factoryAddress: ENV.FACTORY_ADDRESS_97 || undefined
  }
  // enable later:
  // { chainId: 56, rpcHttp: ENV.BSC_RPC_HTTP_56, factoryAddress: ENV.FACTORY_ADDRESS_56 || undefined },
];

function toDec18(x: bigint): number {
  return Number(ethers.formatUnits(x, 18));
}

async function getState(chainId: number, cursor: string): Promise<number> {
  const r = await pool.query(
    `select last_indexed_block from public.indexer_state where chain_id=$1 and cursor=$2`,
    [chainId, cursor]
  );
  if (!r.rowCount) return 0;
  return Number(r.rows[0].last_indexed_block);
}

async function setState(chainId: number, cursor: string, block: number) {
  await pool.query(
    `insert into public.indexer_state(chain_id,cursor,last_indexed_block)
     values($1,$2,$3)
     on conflict (chain_id,cursor) do update
       set last_indexed_block=excluded.last_indexed_block,
           updated_at=now()`,
    [chainId, cursor, block]
  );
}

async function upsertCampaign(chainId: number, campaign: string, token: string, createdBlock: number) {
  await pool.query(
    `insert into public.campaigns(chain_id,campaign_address,token_address,created_block,is_active)
     values($1,$2,$3,$4,true)
     on conflict (chain_id,campaign_address) do update
       set token_address=coalesce(excluded.token_address, public.campaigns.token_address),
           created_block=coalesce(excluded.created_block, public.campaigns.created_block),
           updated_at=now()`,
    [chainId, campaign.toLowerCase(), token.toLowerCase(), createdBlock]
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

async function scanFactory(provider: ethers.JsonRpcProvider, chain: ChainCfg) {
  if (!chain.factoryAddress) return;

  const iface = new ethers.Interface(LAUNCH_FACTORY_ABI);
  const eventFrag = iface.getEvent("CampaignCreated");
  if (!eventFrag) throw new Error("Event CampaignCreated not found in LAUNCH_FACTORY_ABI");
  const topic0 = eventFrag.topicHash;

  const cursor = "factory";

  const latest = await provider.getBlockNumber();
  const target = Math.max(0, latest - ENV.CONFIRMATIONS);

  let from = await getState(chain.chainId, cursor);
  if (from === 0) from = Math.max(0, target - 50_000);

  const step = ENV.LOG_CHUNK_SIZE;

  for (let start = from; start <= target; start += step) {
    const end = Math.min(target, start + step - 1);

    const logs = await provider.getLogs({
      address: chain.factoryAddress,
      fromBlock: start,
      toBlock: end,
      topics: [topic0]
    });

    for (const log of logs) {
      const parsed = iface.parseLog(log);
      if (!parsed) continue; // guard for strict TS + safety

      const campaign = String(parsed.args.campaign);
      const token = String(parsed.args.token);
      await upsertCampaign(chain.chainId, campaign, token, log.blockNumber);
    }

    await setState(chain.chainId, cursor, end + 1);
  }
}

async function scanCampaign(provider: ethers.JsonRpcProvider, chainId: number, campaign: string) {
  const iface = new ethers.Interface(LAUNCH_CAMPAIGN_ABI);

  const buyFrag = iface.getEvent("TokensPurchased");
  const sellFrag = iface.getEvent("TokensSold");
  if (!buyFrag || !sellFrag) throw new Error("Missing TokensPurchased/TokensSold in LAUNCH_CAMPAIGN_ABI");

  const buyTopic = buyFrag.topicHash;
  const sellTopic = sellFrag.topicHash;

  const cursor = `campaign:${campaign.toLowerCase()}`;

  const latest = await provider.getBlockNumber();
  const target = Math.max(0, latest - ENV.CONFIRMATIONS);

  let from = await getState(chainId, cursor);
  if (from === 0) {
    const r = await pool.query(
      `select created_block from public.campaigns where chain_id=$1 and campaign_address=$2`,
      [chainId, campaign.toLowerCase()]
    );
    const created = Number(r.rows[0]?.created_block || 0);
    from = created > 0 ? created : Math.max(0, target - 50_000);
  }

  const step = ENV.LOG_CHUNK_SIZE;
  const blockTimeCache = new Map<number, number>();

  for (let start = from; start <= target; start += step) {
    const end = Math.min(target, start + step - 1);

    const logs = await provider.getLogs({
      address: campaign,
      fromBlock: start,
      toBlock: end,
      topics: [[buyTopic, sellTopic]]
    });

    logs.sort((a, b) => (a.blockNumber - b.blockNumber) || ((a.index ?? 0) - (b.index ?? 0)));

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
        const buyer = String(parsed.args.buyer);
        const amountOut = parsed.args.amountOut as bigint;
        const cost = parsed.args.cost as bigint;

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
        const seller = String(parsed.args.seller);
        const amountIn = parsed.args.amountIn as bigint;
        const payout = parsed.args.payout as bigint;

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

    await setState(chainId, cursor, end + 1);

    if (logs.length > 0) {
      await patchStats(chainId, campaign);
    }
  }
}

export async function runIndexerOnce() {
  for (const chain of CHAINS) {
    const provider = new ethers.JsonRpcProvider(chain.rpcHttp);

    await scanFactory(provider, chain);

    const campaigns = await listActiveCampaigns(chain.chainId);
    for (const c of campaigns) {
      await scanCampaign(provider, chain.chainId, c);
    }
  }
}
