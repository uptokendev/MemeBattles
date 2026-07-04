import { createHash } from "crypto";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { TIMEFRAMES, bucketStart, type TF } from "./timeframes.js";

const SOLANA_CHAIN_ID = 101;
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
  meta?: {
    logMessages?: string[] | null;
  } | null;
} | null;

type AnchorEvent =
  | { kind: "CampaignCreated"; creator: string; mint: string; campaign: string; feeVault: string }
  | { kind: "Bought"; campaign: string; buyer: string; lamportsIn: bigint; protocolFeeLamports: bigint; tokensOut: bigint }
  | { kind: "Sold"; campaign: string; seller: string; tokenAmount: bigint; grossRefundLamports: bigint; protocolFeeLamports: bigint }
  | { kind: "Graduated"; campaign: string; creator: string; mint: string; liquidityLamports: bigint }
  | { kind: "RewardsClaimed"; campaign: string; claimant: string; rewardKind: number; lamports: bigint };

type Decoder = (reader: EventReader) => AnchorEvent;

const EVENT_DECODERS = new Map<string, Decoder>([
  [eventDiscriminator("CampaignCreated"), (r) => ({
    kind: "CampaignCreated",
    creator: r.pubkey(),
    mint: r.pubkey(),
    campaign: r.pubkey(),
    feeVault: r.pubkey(),
  })],
  [eventDiscriminator("Bought"), (r) => ({
    kind: "Bought",
    campaign: r.pubkey(),
    buyer: r.pubkey(),
    lamportsIn: r.u64(),
    protocolFeeLamports: r.u64(),
    tokensOut: r.u64(),
  })],
  [eventDiscriminator("Sold"), (r) => ({
    kind: "Sold",
    campaign: r.pubkey(),
    seller: r.pubkey(),
    tokenAmount: r.u64(),
    grossRefundLamports: r.u64(),
    protocolFeeLamports: r.u64(),
  })],
  [eventDiscriminator("Graduated"), (r) => ({
    kind: "Graduated",
    campaign: r.pubkey(),
    creator: r.pubkey(),
    mint: r.pubkey(),
    liquidityLamports: r.u64(),
  })],
  [eventDiscriminator("RewardsClaimed"), (r) => ({
    kind: "RewardsClaimed",
    campaign: r.pubkey(),
    claimant: r.pubkey(),
    rewardKind: r.u8(),
    lamports: r.u64(),
  })],
]);

class EventReader {
  private offset = 8;

  constructor(private readonly data: Buffer) {}

  pubkey(): string {
    const end = this.offset + 32;
    if (end > this.data.length) throw new Error("Anchor event pubkey out of bounds");
    const value = base58Encode(this.data.subarray(this.offset, end));
    this.offset = end;
    return value;
  }

  u8(): number {
    if (this.offset + 1 > this.data.length) throw new Error("Anchor event u8 out of bounds");
    const value = this.data.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u64(): bigint {
    if (this.offset + 8 > this.data.length) throw new Error("Anchor event u64 out of bounds");
    const value = this.data.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }
}

function eventDiscriminator(name: string): string {
  return createHash("sha256").update(`event:${name}`).digest().subarray(0, 8).toString("hex");
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits = [0];

  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
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
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  let encoded = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) encoded += BASE58_ALPHABET[digits[i]];
  return encoded;
}

function parseRpcList(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function solanaRpcUrls(): string[] {
  return parseRpcList(ENV.SOLANA_RPC_HTTP);
}

function isConfigured(): boolean {
  return Boolean(ENV.SOLANA_LAUNCHPAD_PROGRAM_ID && solanaRpcUrls().length > 0);
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
  const urls = solanaRpcUrls();
  let lastError: unknown;

  for (const url of urls) {
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
      console.warn("[solana-indexer] RPC endpoint failed", { method, url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || `Solana RPC ${method} failed`));
}

async function getState(): Promise<number> {
  const result = await pool.query(
    `select last_indexed_block from public.indexer_state where chain_id=$1 and cursor=$2`,
    [SOLANA_CHAIN_ID, "solana:program"],
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
    [SOLANA_CHAIN_ID, "solana:program", nextSlot],
  );
}

async function getHeadSlot(): Promise<number> {
  return rpc<number>("getSlot", [{ commitment: "confirmed" }]);
}

async function getSignatures(fromSlot: number, currentState: number): Promise<RpcSignature[]> {
  const signatures: RpcSignature[] = [];
  let before: string | undefined;
  const limit = Math.max(1, Math.min(1000, ENV.SOLANA_SIGNATURE_LIMIT));
  const maxPages = Math.max(1, ENV.SOLANA_SIGNATURE_PAGE_LIMIT);

  for (let page = 0; page < maxPages; page++) {
    const batch = await rpc<RpcSignature[]>("getSignaturesForAddress", [
      ENV.SOLANA_LAUNCHPAD_PROGRAM_ID,
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
    {
      commitment: "confirmed",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    },
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

async function upsertCampaign(event: Extract<AnchorEvent, { kind: "CampaignCreated" }>, slot: number, blockTime: Date) {
  await pool.query(
    `insert into public.campaigns(
       chain_id,factory_address,campaign_address,token_address,creator_address,name,symbol,created_block,created_at_chain,is_active,meta
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10::jsonb)
     on conflict (chain_id,campaign_address) do update set
       factory_address=coalesce(public.campaigns.factory_address, excluded.factory_address),
       token_address=coalesce(excluded.token_address, public.campaigns.token_address),
       creator_address=coalesce(excluded.creator_address, public.campaigns.creator_address),
       created_block=(
         case
           when public.campaigns.created_block is null or public.campaigns.created_block=0 then excluded.created_block
           when excluded.created_block is null or excluded.created_block=0 then public.campaigns.created_block
           else least(public.campaigns.created_block, excluded.created_block)
         end
       ),
       created_at_chain=coalesce(public.campaigns.created_at_chain, excluded.created_at_chain),
       is_active=true,
       meta=coalesce(public.campaigns.meta,'{}'::jsonb) || excluded.meta,
       updated_at=now()`,
    [
      SOLANA_CHAIN_ID,
      ENV.SOLANA_LAUNCHPAD_PROGRAM_ID,
      event.campaign,
      event.mint,
      event.creator,
      "Solana Launch",
      "SOL",
      slot,
      blockTime,
      JSON.stringify({ source: "solana-indexer", feeVault: event.feeVault }),
    ],
  );

  await insertActivityEvent({
    eventType: "CREATE_CAMPAIGN",
    txHash: "",
    logIndex: 0,
    blockNumber: slot,
    blockTime,
    actor: event.creator,
    campaign: event.campaign,
    token: event.mint,
    meta: { feeVault: event.feeVault },
  });
}

async function setCampaignGraduated(event: Extract<AnchorEvent, { kind: "Graduated" }>, slot: number, blockTime: Date, signature: string) {
  await pool.query(
    `update public.campaigns
       set is_active=false,
           graduated_block=$3,
           graduated_at_chain=$4,
           meta=coalesce(meta,'{}'::jsonb) || jsonb_build_object('graduatedTx', $5, 'liquidityLamports', $6),
           updated_at=now()
     where chain_id=$1 and campaign_address=$2`,
    [SOLANA_CHAIN_ID, event.campaign, slot, blockTime, signature, event.liquidityLamports.toString()],
  );
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
  if (!row.txHash) return;
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

async function insertTrade(event: Extract<AnchorEvent, { kind: "Bought" | "Sold" }>, signature: string, logIndex: number, slot: number, blockTime: Date) {
  const isBuy = event.kind === "Bought";
  const campaign = event.campaign;
  const wallet = isBuy ? event.buyer : event.seller;
  const tokenRaw = isBuy ? event.tokensOut : event.tokenAmount;
  const solRaw = isBuy ? event.lamportsIn : event.grossRefundLamports;
  const tokenAmount = toTokens(tokenRaw);
  const solAmount = toSol(solRaw);
  const priceSol = tokenAmount > 0 ? solAmount / tokenAmount : null;

  await pool.query(
    `insert into public.curve_trades(
       chain_id,campaign_address,tx_hash,log_index,block_number,block_time,
       side,wallet,token_amount_raw,bnb_amount_raw,token_amount,bnb_amount,price_bnb
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (chain_id,tx_hash,log_index) do nothing`,
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
      solRaw.toString(),
      tokenAmount,
      solAmount,
      priceSol,
    ],
  );

  await touchCampaignActivity(campaign, blockTime);
  await insertActivityEvent({
    eventType: isBuy ? "BUY" : "SELL",
    txHash: signature,
    logIndex,
    blockNumber: slot,
    blockTime,
    actor: wallet,
    campaign,
    amountInWei: isBuy ? solRaw : tokenRaw,
    amountOutWei: isBuy ? tokenRaw : solRaw,
    costWei: isBuy ? solRaw : null,
    payoutWei: isBuy ? null : solRaw,
    meta: {
      priceSol,
      protocolFeeLamports: event.protocolFeeLamports.toString(),
    },
  });

  if (priceSol !== null) {
    const tsSec = Math.floor(blockTime.getTime() / 1000);
    for (const tf of TIMEFRAMES) {
      await upsertCandle(campaign, tf, bucketStart(tsSec, tf), priceSol, solAmount);
    }
  }

  await patchStats(campaign);
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
}

async function patchStats(campaign: string) {
  const latest = await pool.query(
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
    [SOLANA_CHAIN_ID, campaign, lastPrice, soldTokens, marketcap, Number(latest.rows[0]?.vol24h_bnb ?? 0)],
  );
}

async function handleEvent(event: AnchorEvent, signature: string, logIndex: number, slot: number, blockTime: Date) {
  if (event.kind === "CampaignCreated") {
    await upsertCampaign(event, slot, blockTime);
    await insertActivityEvent({
      eventType: "CREATE_CAMPAIGN",
      txHash: signature,
      logIndex,
      blockNumber: slot,
      blockTime,
      actor: event.creator,
      campaign: event.campaign,
      token: event.mint,
      meta: { feeVault: event.feeVault },
    });
    return;
  }

  if (event.kind === "Bought" || event.kind === "Sold") {
    await insertTrade(event, signature, logIndex, slot, blockTime);
    return;
  }

  if (event.kind === "Graduated") {
    await setCampaignGraduated(event, slot, blockTime, signature);
    await touchCampaignActivity(event.campaign, blockTime);
    await insertActivityEvent({
      eventType: "FINALIZE",
      txHash: signature,
      logIndex,
      blockNumber: slot,
      blockTime,
      actor: event.creator,
      campaign: event.campaign,
      token: event.mint,
      meta: { liquidityLamports: event.liquidityLamports.toString() },
    });
    return;
  }

  if (event.kind === "RewardsClaimed") {
    await touchCampaignActivity(event.campaign, blockTime);
    await insertActivityEvent({
      eventType: "REWARD_CLAIMED",
      txHash: signature,
      logIndex,
      blockNumber: slot,
      blockTime,
      actor: event.claimant,
      campaign: event.campaign,
      payoutWei: event.lamports,
      meta: { rewardKind: event.rewardKind, lamports: event.lamports.toString() },
    });
  }
}

export async function runSolanaIndexerOnce() {
  if (!isConfigured()) return;

  const head = await getHeadSlot();
  const currentState = await getState();
  const startSlot = ENV.SOLANA_START_SLOT > 0
    ? ENV.SOLANA_START_SLOT
    : Math.max(0, head - ENV.SOLANA_LOOKBACK_SLOTS);
  const fromSlot = currentState > 0 ? currentState : startSlot;
  const signatures = await getSignatures(fromSlot, currentState);

  let maxSlot = currentState;
  for (const item of signatures) {
    const tx = await getTransaction(item.signature);
    const events = decodeEvents(tx?.meta?.logMessages);
    const blockTime = timestampFrom(tx?.blockTime ?? item.blockTime);
    let eventIndex = 0;

    for (const event of events) {
      await handleEvent(event, item.signature, eventIndex, item.slot, blockTime);
      eventIndex++;
    }

    maxSlot = Math.max(maxSlot, item.slot);
  }

  if (maxSlot > currentState) {
    await setState(maxSlot);
  } else if (currentState === 0) {
    await setState(fromSlot);
  }
}

let running = false;
let started = false;

export function startSolanaIndexerLoop() {
  if (started) return;
  started = true;

  if (!isConfigured()) {
    console.log("[solana-indexer] disabled; set SOLANA_RPC_HTTP and SOLANA_LAUNCHPAD_PROGRAM_ID to enable");
    return;
  }

  console.log("[solana-indexer] enabled", {
    chainId: SOLANA_CHAIN_ID,
    programId: ENV.SOLANA_LAUNCHPAD_PROGRAM_ID,
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

  setTimeout(() => { tick().catch(() => {}); }, 2_000);
  setInterval(() => { tick().catch(() => {}); }, ENV.SOLANA_INDEXER_INTERVAL_MS);
}
