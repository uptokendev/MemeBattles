import { createHash } from "crypto";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { publishCandle, publishStats, publishTrade } from "./ably.js";
import { TIMEFRAMES, bucketStart, type TF } from "./timeframes.js";

const SOLANA_CHAIN_ID = 101;
const DEFAULT_SOLANA_RPC = "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt";
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 6;
const TOKEN_UNITS = 10 ** TOKEN_DECIMALS;
const PROGRAM_DATA_PREFIX = "Program data: ";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

type RpcSignature = {
  signature: string;
  slot: number;
  err: unknown;
  blockTime?: number | null;
};

type RpcTransaction = {
  slot: number;
  blockTime?: number | null;
  meta?: { logMessages?: string[] | null } | null;
} | null;

type CampaignCreatedEvent = {
  kind: "CampaignCreated";
  campaign: string;
  creator: string;
  mint: string;
  tokenVault: string;
  solVault: string;
};

type TokensBoughtEvent = {
  kind: "TokensBought";
  campaign: string;
  trader: string;
  lamportsIn: bigint;
  feeLamports: bigint;
  netLamports: bigint;
  tokensOut: bigint;
  soldTokensAfter: bigint;
  netRaisedAfter: bigint;
};

type TokensSoldEvent = {
  kind: "TokensSold";
  campaign: string;
  trader: string;
  tokensIn: bigint;
  grossLamports: bigint;
  feeLamports: bigint;
  lamportsOut: bigint;
  soldTokensAfter: bigint;
  netRaisedAfter: bigint;
};

type CampaignGraduatedEvent = {
  kind: "CampaignGraduated";
  campaign: string;
  creator: string;
  mint: string;
  meteoraPool: string;
  meteoraPosition: string;
  liquidityTokens: bigint;
  liquidityLamports: bigint;
  finalizeFeeLamports: bigint;
  creatorPayoutLamports: bigint;
  burnedUnsoldCurveTokens: bigint;
  burnedUnusedLiquidityTokens: bigint;
  creatorReserveTokens: bigint;
  finalSpotNanoLamports: bigint;
  graduatedAt: bigint;
};

type AnchorEvent = CampaignCreatedEvent | TokensBoughtEvent | TokensSoldEvent | CampaignGraduatedEvent;
type Decoder = (reader: EventReader) => AnchorEvent;

class EventReader {
  private offset = 8;
  constructor(private readonly data: Buffer) {}

  skip(bytes: number) {
    const end = this.offset + bytes;
    if (end > this.data.length) throw new Error("Anchor event skip out of bounds");
    this.offset = end;
  }

  pubkey(): string {
    const end = this.offset + 32;
    if (end > this.data.length) throw new Error("Anchor event pubkey out of bounds");
    const value = base58Encode(this.data.subarray(this.offset, end));
    this.offset = end;
    return value;
  }

  u64(): bigint {
    if (this.offset + 8 > this.data.length) throw new Error("Anchor event u64 out of bounds");
    const value = this.data.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  i64(): bigint {
    if (this.offset + 8 > this.data.length) throw new Error("Anchor event i64 out of bounds");
    const value = this.data.readBigInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  u128(): bigint {
    if (this.offset + 16 > this.data.length) throw new Error("Anchor event u128 out of bounds");
    const lo = this.data.readBigUInt64LE(this.offset);
    const hi = this.data.readBigUInt64LE(this.offset + 8);
    this.offset += 16;
    return lo + (hi << 64n);
  }
}

function eventDiscriminator(name: string): string {
  return createHash("sha256").update(`event:${name}`).digest().subarray(0, 8).toString("hex");
}

const EVENT_DECODERS = new Map<string, Decoder>([
  [eventDiscriminator("CampaignCreated"), (r) => {
    // Current V4 event prefix:
    // campaign, campaign_id[32], generation_id[32], generation_config,
    // generation_manifest_hash[32], creator, mint, token_vault, sol_vault, ...
    const campaign = r.pubkey();
    r.skip(32);
    r.skip(32);
    r.pubkey();
    r.skip(32);
    const creator = r.pubkey();
    const mint = r.pubkey();
    const tokenVault = r.pubkey();
    const solVault = r.pubkey();
    return { kind: "CampaignCreated", campaign, creator, mint, tokenVault, solVault };
  }],
  [eventDiscriminator("TokensBought"), (r) => ({
    kind: "TokensBought",
    campaign: r.pubkey(),
    trader: r.pubkey(),
    lamportsIn: r.u64(),
    feeLamports: r.u64(),
    netLamports: r.u64(),
    tokensOut: r.u64(),
    soldTokensAfter: r.u64(),
    netRaisedAfter: r.u64(),
  })],
  [eventDiscriminator("TokensSold"), (r) => ({
    kind: "TokensSold",
    campaign: r.pubkey(),
    trader: r.pubkey(),
    tokensIn: r.u64(),
    grossLamports: r.u64(),
    feeLamports: r.u64(),
    lamportsOut: r.u64(),
    soldTokensAfter: r.u64(),
    netRaisedAfter: r.u64(),
  })],
  [eventDiscriminator("CampaignGraduated"), (r) => ({
    kind: "CampaignGraduated",
    campaign: r.pubkey(),
    creator: r.pubkey(),
    mint: r.pubkey(),
    meteoraPool: r.pubkey(),
    meteoraPosition: r.pubkey(),
    liquidityTokens: r.u64(),
    liquidityLamports: r.u64(),
    finalizeFeeLamports: r.u64(),
    creatorPayoutLamports: r.u64(),
    burnedUnsoldCurveTokens: r.u64(),
    burnedUnusedLiquidityTokens: r.u64(),
    creatorReserveTokens: r.u64(),
    finalSpotNanoLamports: r.u128(),
    graduatedAt: r.i64(),
  })],
]);

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      const value = digits[i] * 256 + carry;
      digits[i] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  let encoded = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) encoded += BASE58_ALPHABET[digits[i]];
  return encoded;
}

function parseRpcList(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function programId() {
  return String(ENV.SOLANA_LAUNCHPAD_PROGRAM_ID || process.env.SOLANA_LAUNCHPAD_PROGRAM_ID || DEFAULT_PROGRAM_ID).trim();
}

function solanaRpcUrls(): string[] {
  const configured = String(ENV.SOLANA_RPC_HTTP || process.env.SOLANA_RPC_URL || "").trim();
  return parseRpcList(configured || DEFAULT_SOLANA_RPC);
}

function toSol(raw: bigint): number {
  return Number(raw) / LAMPORTS_PER_SOL;
}

function toTokens(raw: bigint): number {
  return Number(raw) / TOKEN_UNITS;
}

function timestampFrom(blockTime: number | null | undefined): Date {
  return new Date(Number(blockTime || Math.floor(Date.now() / 1000)) * 1000);
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError: unknown;
  for (const url of solanaRpcUrls()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!response.ok) throw new Error(`Solana RPC ${method} HTTP ${response.status}`);
      const payload = await response.json() as { result?: T; error?: { message?: string } };
      if (payload.error) throw new Error(payload.error.message || `Solana RPC ${method} failed`);
      return payload.result as T;
    } catch (error) {
      lastError = error;
      console.warn("[solana-indexer] RPC endpoint failed", {
        method,
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || `Solana RPC ${method} failed`));
}

async function getState(): Promise<number> {
  const result = await pool.query(
    `select last_indexed_block from public.indexer_state where chain_id=$1 and cursor=$2`,
    [SOLANA_CHAIN_ID, "solana:v4:program"],
  );
  return result.rowCount ? Number(result.rows[0].last_indexed_block) : 0;
}

async function setState(nextSlot: number) {
  await pool.query(
    `insert into public.indexer_state(chain_id,cursor,last_indexed_block)
     values($1,$2,$3)
     on conflict (chain_id,cursor) do update
       set last_indexed_block = greatest(public.indexer_state.last_indexed_block, excluded.last_indexed_block),
           updated_at=now()`,
    [SOLANA_CHAIN_ID, "solana:v4:program", nextSlot],
  );
}

async function getHeadSlot(): Promise<number> {
  return rpc<number>("getSlot", [{ commitment: "confirmed" }]);
}

async function getSignatures(fromSlot: number, currentState: number): Promise<RpcSignature[]> {
  const signatures: RpcSignature[] = [];
  let before: string | undefined;
  const limit = Math.max(1, Math.min(1000, ENV.SOLANA_SIGNATURE_LIMIT || 500));
  const maxPages = Math.max(1, ENV.SOLANA_SIGNATURE_PAGE_LIMIT || 5);

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await rpc<RpcSignature[]>("getSignaturesForAddress", [
      programId(),
      { limit, ...(before ? { before } : {}) },
    ]);
    if (!batch.length) break;
    for (const item of batch) {
      if (item.slot > currentState && item.slot >= fromSlot && !item.err) signatures.push(item);
    }
    const last = batch[batch.length - 1];
    if (!last || last.slot <= fromSlot || last.slot <= currentState) break;
    before = last.signature;
  }

  signatures.sort((a, b) => a.slot - b.slot || a.signature.localeCompare(b.signature));
  return signatures;
}

async function getTransaction(signature: string): Promise<RpcTransaction> {
  return rpc<RpcTransaction>("getTransaction", [
    signature,
    { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
}

function decodeEvents(logMessages: string[] | null | undefined): AnchorEvent[] {
  const events: AnchorEvent[] = [];
  for (const line of logMessages || []) {
    const idx = line.indexOf(PROGRAM_DATA_PREFIX);
    if (idx < 0) continue;
    const encoded = line.slice(idx + PROGRAM_DATA_PREFIX.length).trim();
    if (!encoded) continue;
    try {
      const data = Buffer.from(encoded, "base64");
      if (data.length < 8) continue;
      const decoder = EVENT_DECODERS.get(data.subarray(0, 8).toString("hex"));
      if (!decoder) continue;
      events.push(decoder(new EventReader(data)));
    } catch (error) {
      console.warn("[solana-indexer] failed to decode Anchor event", error instanceof Error ? error.message : String(error));
    }
  }
  return events;
}

async function upsertCampaign(event: CampaignCreatedEvent, slot: number, blockTime: Date, signature: string, logIndex: number) {
  await pool.query(
    `insert into public.campaigns(
       chain_id,factory_address,campaign_address,token_address,creator_address,name,symbol,created_block,created_at_chain,is_active,meta
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10::jsonb)
     on conflict (chain_id,campaign_address) do update set
       factory_address=coalesce(public.campaigns.factory_address, excluded.factory_address),
       token_address=coalesce(excluded.token_address, public.campaigns.token_address),
       creator_address=coalesce(excluded.creator_address, public.campaigns.creator_address),
       created_block=(case
         when public.campaigns.created_block is null or public.campaigns.created_block=0 then excluded.created_block
         else least(public.campaigns.created_block, excluded.created_block)
       end),
       created_at_chain=coalesce(public.campaigns.created_at_chain, excluded.created_at_chain),
       is_active=true,
       meta=coalesce(public.campaigns.meta,'{}'::jsonb) || excluded.meta,
       updated_at=now()`,
    [
      SOLANA_CHAIN_ID,
      programId(),
      event.campaign,
      event.mint,
      event.creator,
      "Solana Launch",
      "SOL",
      slot,
      blockTime,
      JSON.stringify({
        source: "solana-v4-indexer",
        solana: { programId: programId(), tokenVault: event.tokenVault, solVault: event.solVault },
      }),
    ],
  );

  await insertActivityEvent({
    eventType: "CREATE_CAMPAIGN",
    txHash: signature,
    logIndex,
    blockNumber: slot,
    blockTime,
    actor: event.creator,
    campaign: event.campaign,
    token: event.mint,
    meta: { tokenVault: event.tokenVault, solVault: event.solVault },
  });
}

async function touchCampaignActivity(campaign: string, at: Date) {
  await pool.query(
    `insert into public.campaign_activity (chain_id, campaign_address, last_activity_at, updated_at)
     values ($1, $2, $3, now())
     on conflict (chain_id, campaign_address) do update set
       last_activity_at = greatest(excluded.last_activity_at, coalesce(public.campaign_activity.last_activity_at, to_timestamp(0))),
       updated_at = now()`,
    [SOLANA_CHAIN_ID, campaign, at],
  ).catch((error) => {
    const msg = String(error?.message || error);
    if (!msg.includes("campaign_activity")) console.warn("[solana-indexer] campaign activity touch failed", msg);
  });
}

async function insertActivityEvent(row: {
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
  meta?: Record<string, unknown> | null;
}) {
  await pool.query(
    `insert into public.activity_events(
       chain_id,event_type,tx_hash,log_index,block_number,block_time,
       actor_address,campaign_address,token_address,
       amount_in_wei,amount_out_wei,cost_wei,payout_wei,meta
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (chain_id,tx_hash,log_index) do nothing`,
    [
      SOLANA_CHAIN_ID,
      row.eventType,
      row.txHash,
      row.logIndex,
      row.blockNumber,
      row.blockTime,
      row.actor,
      row.campaign ?? null,
      row.token ?? null,
      row.amountInWei ? row.amountInWei.toString() : null,
      row.amountOutWei ? row.amountOutWei.toString() : null,
      row.costWei ? row.costWei.toString() : null,
      row.payoutWei ? row.payoutWei.toString() : null,
      row.meta ? JSON.stringify(row.meta) : "{}",
    ],
  ).catch((error) => {
    const msg = String(error?.message || error);
    if (!msg.includes("activity_events")) console.warn("[solana-indexer] activity insert failed", msg);
  });
}

async function upsertCandle(campaign: string, tf: TF, bucketSec: number, priceSol: number, volumeSol: number) {
  await pool.query(
    `insert into public.token_candles(
       chain_id,campaign_address,timeframe,bucket_start,o,h,l,c,volume_bnb,trades_count
     ) values($1,$2,$3,$4,$5,$5,$5,$5,$6,1)
     on conflict (chain_id,campaign_address,timeframe,bucket_start) do update set
       h=greatest(public.token_candles.h, excluded.h),
       l=least(public.token_candles.l, excluded.l),
       c=excluded.c,
       volume_bnb=public.token_candles.volume_bnb + excluded.volume_bnb,
       trades_count=public.token_candles.trades_count + 1,
       updated_at=now()`,
    [SOLANA_CHAIN_ID, campaign, tf, new Date(bucketSec * 1000), priceSol, volumeSol],
  );

  await publishCandle(SOLANA_CHAIN_ID, campaign, {
    type: "candle_upsert",
    tf,
    bucket: bucketSec,
    c: String(priceSol),
    v: String(volumeSol),
  });
}

async function patchStats(campaign: string) {
  const latest = await pool.query(
    `with t as (
       select price_bnb, block_time
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
     select (select price_bnb from t) as last_price_bnb,
            (select vol24h from v) as vol24h_bnb`,
    [SOLANA_CHAIN_ID, campaign],
  );

  const sold = await pool.query(
    `select
       coalesce(sum(case when side='buy' then token_amount else 0 end),0) -
       coalesce(sum(case when side='sell' then token_amount else 0 end),0) as sold
     from public.curve_trades
     where chain_id=$1 and campaign_address=$2`,
    [SOLANA_CHAIN_ID, campaign],
  );

  const lastPrice = latest.rows[0]?.last_price_bnb ?? null;
  const soldTokens = Number(sold.rows[0]?.sold ?? 0);
  const vol24h = Number(latest.rows[0]?.vol24h_bnb ?? 0);
  const marketcap = lastPrice !== null ? Number(lastPrice) * soldTokens : null;

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
    [SOLANA_CHAIN_ID, campaign, lastPrice, soldTokens, marketcap, vol24h],
  );

  await publishStats(SOLANA_CHAIN_ID, campaign, {
    type: "stats_patch",
    lastPriceBnb: lastPrice !== null ? String(lastPrice) : null,
    marketcapBnb: marketcap !== null ? String(marketcap) : null,
    vol24hBnb: String(vol24h),
  });
}

async function insertTrade(event: TokensBoughtEvent | TokensSoldEvent, signature: string, logIndex: number, slot: number, blockTime: Date) {
  const isBuy = event.kind === "TokensBought";
  const campaign = event.campaign;
  const wallet = event.trader;
  const tokenRaw = isBuy ? event.tokensOut : event.tokensIn;
  // Match BNB user-facing fill semantics: gross/actual spend for buys, net payout for sells.
  const nativeRaw = isBuy ? event.lamportsIn : event.lamportsOut;
  const tokenAmount = toTokens(tokenRaw);
  const nativeAmount = toSol(nativeRaw);
  const priceNative = tokenAmount > 0 ? nativeAmount / tokenAmount : null;

  // A replay of an already indexed Solana trade is a backfill operation only.
  // Persist the authoritative post-trade curve state from the Anchor event,
  // then stop so candles/volume/activity are never counted twice.
  const backfilled = await pool.query(
    `update public.curve_trades
        set sold_tokens_after_raw=$4
      where chain_id=$1 and tx_hash=$2 and log_index=$3
      returning tx_hash`,
    [
      SOLANA_CHAIN_ID,
      signature,
      logIndex,
      event.soldTokensAfter.toString(),
    ],
  );

  if ((backfilled.rowCount ?? 0) > 0) return;

  const inserted = await pool.query(
    `insert into public.curve_trades(
       chain_id,campaign_address,tx_hash,log_index,block_number,block_time,
       side,wallet,token_amount_raw,bnb_amount_raw,token_amount,bnb_amount,price_bnb,
       sold_tokens_after_raw
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (chain_id,tx_hash,log_index) do nothing
     returning tx_hash`,
    [
      SOLANA_CHAIN_ID,
      campaign,
      signature,
      logIndex,
      slot,
      blockTime,
      isBuy ? "buy" : "sell",
      wallet,
      tokenRaw.toString(),
      nativeRaw.toString(),
      tokenAmount,
      nativeAmount,
      priceNative,
      event.soldTokensAfter.toString(),
    ],
  );

  if ((inserted.rowCount ?? 0) === 0) return;

  await touchCampaignActivity(campaign, blockTime);
  await insertActivityEvent({
    eventType: isBuy ? "BUY" : "SELL",
    txHash: signature,
    logIndex,
    blockNumber: slot,
    blockTime,
    actor: wallet,
    campaign,
    amountInWei: isBuy ? nativeRaw : tokenRaw,
    amountOutWei: isBuy ? tokenRaw : nativeRaw,
    costWei: isBuy ? nativeRaw : null,
    payoutWei: isBuy ? null : nativeRaw,
    meta: {
      priceSol: priceNative,
      feeLamports: event.feeLamports.toString(),
      curveNetLamports: isBuy ? event.netLamports.toString() : event.grossLamports.toString(),
      soldTokensAfter: event.soldTokensAfter.toString(),
      netRaisedAfter: event.netRaisedAfter.toString(),
    },
  });

  const realtimeRow = {
    tx_hash: signature,
    log_index: logIndex,
    block_number: slot,
    block_time: blockTime.toISOString(),
    side: isBuy ? "buy" : "sell",
    wallet,
    token_amount_raw: tokenRaw.toString(),
    bnb_amount_raw: nativeRaw.toString(),
    token_amount: tokenAmount,
    bnb_amount: nativeAmount,
    price_bnb: priceNative,
    sold_tokens_after_raw: event.soldTokensAfter.toString(),
  };
  await publishTrade(SOLANA_CHAIN_ID, campaign, realtimeRow);

  if (priceNative !== null && priceNative > 0) {
    const tsSec = Math.floor(blockTime.getTime() / 1000);
    for (const tf of TIMEFRAMES) {
      await upsertCandle(campaign, tf, bucketStart(tsSec, tf), priceNative, nativeAmount);
    }
  }
  await patchStats(campaign);
}

async function persistGraduation(
  event: CampaignGraduatedEvent,
  signature: string,
  logIndex: number,
  slot: number,
  blockTime: Date,
) {
  const graduationMeta = {
    dex: "meteora-damm-v2",
    pool: event.meteoraPool,
    position: event.meteoraPosition,
    liquidityTokensRaw: event.liquidityTokens.toString(),
    liquidityLamports: event.liquidityLamports.toString(),
    finalizeFeeLamports: event.finalizeFeeLamports.toString(),
    creatorPayoutLamports: event.creatorPayoutLamports.toString(),
    burnedUnsoldCurveTokens: event.burnedUnsoldCurveTokens.toString(),
    burnedUnusedLiquidityTokens: event.burnedUnusedLiquidityTokens.toString(),
    creatorReserveTokens: event.creatorReserveTokens.toString(),
    finalSpotNanoLamports: event.finalSpotNanoLamports.toString(),
    graduatedAt: event.graduatedAt.toString(),
    transactionSignature: signature,
    slot,
  };

  await pool.query(
    `insert into public.campaigns(
       chain_id,factory_address,campaign_address,token_address,creator_address,name,symbol,created_block,created_at_chain,is_active,meta
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10::jsonb)
     on conflict (chain_id,campaign_address) do update set
       token_address=coalesce(excluded.token_address, public.campaigns.token_address),
       creator_address=coalesce(excluded.creator_address, public.campaigns.creator_address),
       is_active=true,
       meta=coalesce(public.campaigns.meta,'{}'::jsonb) || excluded.meta,
       updated_at=now()`,
    [
      SOLANA_CHAIN_ID,
      programId(),
      event.campaign,
      event.mint,
      event.creator,
      "Solana Launch",
      "SOL",
      slot,
      blockTime,
      JSON.stringify({ source: "solana-v4-graduation", solanaGraduation: graduationMeta }),
    ],
  );

  await touchCampaignActivity(event.campaign, blockTime);
  await insertActivityEvent({
    eventType: "GRADUATED",
    txHash: signature,
    logIndex,
    blockNumber: slot,
    blockTime,
    actor: event.creator,
    campaign: event.campaign,
    token: event.mint,
    meta: graduationMeta,
  });
  await publishStats(SOLANA_CHAIN_ID, event.campaign, {
    type: "stats_patch",
    graduated: true,
    dex: "meteora-damm-v2",
    dexPool: event.meteoraPool,
    dexPosition: event.meteoraPosition,
    graduationLiquiditySol: toSol(event.liquidityLamports),
    graduationLiquidityTokensRaw: event.liquidityTokens.toString(),
    graduatedAt: blockTime.toISOString(),
    txHash: signature,
  });
}

async function handleEvent(event: AnchorEvent, signature: string, logIndex: number, slot: number, blockTime: Date) {
  if (event.kind === "CampaignCreated") {
    await upsertCampaign(event, slot, blockTime, signature, logIndex);
    return;
  }
  if (event.kind === "CampaignGraduated") {
    await persistGraduation(event, signature, logIndex, slot, blockTime);
    return;
  }
  await insertTrade(event, signature, logIndex, slot, blockTime);
}

export async function backfillSolanaTradeCurveState(limit = 500) {
  const rows = await pool.query(
    `select campaign_address, tx_hash, log_index
       from public.curve_trades
      where chain_id=$1
        and sold_tokens_after_raw is null
      order by block_number asc, log_index asc
      limit $2`,
    [SOLANA_CHAIN_ID, Math.max(1, Math.min(5000, Number(limit || 500)))],
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows.rows) {
    const signature = String(row.tx_hash || "").trim();
    const campaign = String(row.campaign_address || "").trim();
    const logIndex = Number(row.log_index);

    if (!signature || !campaign || !Number.isInteger(logIndex) || logIndex < 0) {
      skipped += 1;
      continue;
    }

    try {
      const tx = await getTransaction(signature);
      const events = decodeEvents(tx?.meta?.logMessages);
      const event = events[logIndex];

      if (
        !event ||
        (event.kind !== "TokensBought" && event.kind !== "TokensSold") ||
        event.campaign !== campaign
      ) {
        console.warn("[solana-backfill] event mismatch", {
          signature,
          campaign,
          logIndex,
          decodedKind: event?.kind ?? null,
          decodedCampaign:
            event && "campaign" in event ? event.campaign : null,
          decodedEvents: events.length,
        });
        skipped += 1;
        continue;
      }

      const result = await pool.query(
        `update public.curve_trades
            set sold_tokens_after_raw=$4
          where chain_id=$1
            and tx_hash=$2
            and log_index=$3
            and sold_tokens_after_raw is null
          returning tx_hash`,
        [
          SOLANA_CHAIN_ID,
          signature,
          logIndex,
          event.soldTokensAfter.toString(),
        ],
      );

      if ((result.rowCount ?? 0) > 0) updated += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error("[solana-backfill] failed", {
        signature,
        campaign,
        logIndex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const remaining = await pool.query(
    `select count(*)::int as count
       from public.curve_trades
      where chain_id=$1
        and sold_tokens_after_raw is null`,
    [SOLANA_CHAIN_ID],
  );

  return {
    scanned: rows.rowCount ?? 0,
    updated,
    skipped,
    failed,
    remaining: Number(remaining.rows[0]?.count ?? 0),
  };
}

export async function runSolanaIndexerOnce() {
  const head = await getHeadSlot();
  const currentState = await getState();
  const configuredStart = Number(ENV.SOLANA_START_SLOT || 0);
  const lookback = Math.max(1, Number(ENV.SOLANA_LOOKBACK_SLOTS || 50_000));
  const startSlot = configuredStart > 0 ? configuredStart : Math.max(0, head - lookback);
  const fromSlot = currentState > 0 ? currentState : startSlot;
  const signatures = await getSignatures(fromSlot, currentState);

  let maxSlot = currentState;
  for (const item of signatures) {
    const tx = await getTransaction(item.signature);
    const events = decodeEvents(tx?.meta?.logMessages);
    const blockTime = timestampFrom(tx?.blockTime ?? item.blockTime);
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      await handleEvent(events[eventIndex], item.signature, eventIndex, item.slot, blockTime);
    }
    maxSlot = Math.max(maxSlot, item.slot);
  }

  if (maxSlot > currentState) await setState(maxSlot);
  else if (currentState === 0) await setState(fromSlot);
}

let running = false;
let started = false;

export function startSolanaIndexerLoop() {
  if (started) return;
  started = true;

  console.log("[solana-indexer] enabled", {
    chainId: SOLANA_CHAIN_ID,
    programId: programId(),
    rpcCount: solanaRpcUrls().length,
    intervalMs: ENV.SOLANA_INDEXER_INTERVAL_MS,
  });

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSolanaIndexerOnce();
    } catch (error) {
      console.error("[solana-indexer] loop error", error);
    } finally {
      running = false;
    }
  };

  setTimeout(() => { void tick(); }, 2_000);
  setInterval(() => { void tick(); }, Math.max(2_000, ENV.SOLANA_INDEXER_INTERVAL_MS || 10_000));
}
