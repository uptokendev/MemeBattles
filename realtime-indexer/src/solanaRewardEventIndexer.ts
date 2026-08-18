import { createHash } from "crypto";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { ensureWeeklyEpoch } from "./rewards/epochs.js";

const SOLANA_CHAIN_ID = 101;
const DEFAULT_SOLANA_RPC = "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt";
const PROGRAM_DATA_PREFIX = "Program data: ";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const FEE_SLICES_DISCRIMINATOR = createHash("sha256")
  .update("event:FeeSlicesRouted")
  .digest()
  .subarray(0, 8)
  .toString("hex");

const ROUTE_PROFILES = new Map<number, "standard_linked" | "standard_unlinked" | "og_linked">([
  [0, "standard_linked"],
  [1, "standard_unlinked"],
  [2, "og_linked"],
]);

type FeeSlicesRoutedEvent = {
  campaign: string;
  trader: string;
  side: number;
  routeProfile: number;
  grossLamports: bigint;
  feeLamports: bigint;
  weeklyLeagueLamports: bigint;
  monthlyLeagueLamports: bigint;
  recruiterLamports: bigint;
  airdropLamports: bigint;
  squadLamports: bigint;
  protocolLamports: bigint;
};

type PendingTradeTx = {
  tx_hash: string;
  block_number: string | number;
  block_time: string | Date;
};

class EventReader {
  private offset = 8;

  constructor(private readonly data: Buffer) {}

  pubkey(): string {
    const end = this.offset + 32;
    if (end > this.data.length) throw new Error("FeeSlicesRouted pubkey out of bounds");
    const value = base58Encode(this.data.subarray(this.offset, end));
    this.offset = end;
    return value;
  }

  u8(): number {
    if (this.offset + 1 > this.data.length) throw new Error("FeeSlicesRouted u8 out of bounds");
    const value = this.data.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u64(): bigint {
    if (this.offset + 8 > this.data.length) throw new Error("FeeSlicesRouted u64 out of bounds");
    const value = this.data.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }
}

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
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function programId(): string {
  return String(
    ENV.SOLANA_LAUNCHPAD_PROGRAM_ID || process.env.SOLANA_LAUNCHPAD_PROGRAM_ID || DEFAULT_PROGRAM_ID,
  ).trim();
}

function solanaRpcUrls(): string[] {
  const configured = String(ENV.SOLANA_RPC_HTTP || process.env.SOLANA_RPC_URL || "").trim();
  return parseRpcList(configured || DEFAULT_SOLANA_RPC);
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
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || `Solana RPC ${method} failed`));
}

function decodeFeeSlicesRouted(logMessages: string[] | null | undefined): Array<{ logIndex: number; event: FeeSlicesRoutedEvent }> {
  const decoded: Array<{ logIndex: number; event: FeeSlicesRoutedEvent }> = [];
  for (let logIndex = 0; logIndex < (logMessages?.length || 0); logIndex += 1) {
    const log = String(logMessages?.[logIndex] || "");
    if (!log.startsWith(PROGRAM_DATA_PREFIX)) continue;

    try {
      const data = Buffer.from(log.slice(PROGRAM_DATA_PREFIX.length), "base64");
      if (data.length < 8 || data.subarray(0, 8).toString("hex") !== FEE_SLICES_DISCRIMINATOR) continue;
      const r = new EventReader(data);
      const event: FeeSlicesRoutedEvent = {
        campaign: r.pubkey(),
        trader: r.pubkey(),
        side: r.u8(),
        routeProfile: r.u8(),
        grossLamports: r.u64(),
        feeLamports: r.u64(),
        weeklyLeagueLamports: r.u64(),
        monthlyLeagueLamports: r.u64(),
        recruiterLamports: r.u64(),
        airdropLamports: r.u64(),
        squadLamports: r.u64(),
        protocolLamports: r.u64(),
      };
      decoded.push({ logIndex, event });
    } catch (error) {
      console.warn("[solana-rewards] failed to decode FeeSlicesRouted", {
        logIndex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return decoded;
}

async function pendingTradeTransactions(limit = 100): Promise<PendingTradeTx[]> {
  const result = await pool.query(
    `select ct.tx_hash,
            max(ct.block_number)::bigint as block_number,
            max(ct.block_time) as block_time
       from public.curve_trades ct
      where ct.chain_id=$1
        and not exists (
          select 1
            from public.reward_events re
           where re.chain_id=$1
             and re.tx_hash=ct.tx_hash
             and re.source_event='FeeSlicesRouted'
        )
      group by ct.tx_hash
      order by max(ct.block_number) asc
      limit $2`,
    [SOLANA_CHAIN_ID, Math.max(1, Math.min(1000, Number(limit || 100)))],
  );
  return result.rows as PendingTradeTx[];
}

async function getTransaction(signature: string): Promise<{ meta?: { logMessages?: string[] | null } | null } | null> {
  return rpc("getTransaction", [
    signature,
    { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ]);
}

function assertSlices(event: FeeSlicesRoutedEvent) {
  const allocated =
    event.weeklyLeagueLamports +
    event.monthlyLeagueLamports +
    event.recruiterLamports +
    event.airdropLamports +
    event.squadLamports +
    event.protocolLamports;
  if (allocated !== event.feeLamports) {
    throw new Error(
      `FeeSlicesRouted mismatch: allocated=${allocated.toString()} fee=${event.feeLamports.toString()}`,
    );
  }
}

async function persistRewardEvent(
  signature: string,
  logIndex: number,
  blockNumber: number,
  occurredAt: Date,
  event: FeeSlicesRoutedEvent,
) {
  assertSlices(event);
  const routeProfile = ROUTE_PROFILES.get(event.routeProfile);
  if (!routeProfile) throw new Error(`Unsupported Solana reward route profile ${event.routeProfile}`);

  const epoch = await ensureWeeklyEpoch(SOLANA_CHAIN_ID, occurredAt);
  const leagueLamports = event.weeklyLeagueLamports + event.monthlyLeagueLamports;

  await pool.query(
    `insert into public.reward_events(
       chain_id, tx_hash, log_index, block_number, occurred_at, epoch_id,
       wallet_address, campaign_address, route_kind, route_profile,
       league_amount, recruiter_amount, airdrop_amount, squad_amount, protocol_amount,
       raw_amount, source_contract, source_event, matched_activity_source, metadata
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,'trade',$9,
       $10,$11,$12,$13,$14,$15,$16,'FeeSlicesRouted','solana_anchor_event',$17::jsonb
     )
     on conflict (chain_id, tx_hash, log_index) do update set
       epoch_id=excluded.epoch_id,
       wallet_address=excluded.wallet_address,
       campaign_address=excluded.campaign_address,
       route_kind=excluded.route_kind,
       route_profile=excluded.route_profile,
       league_amount=excluded.league_amount,
       recruiter_amount=excluded.recruiter_amount,
       airdrop_amount=excluded.airdrop_amount,
       squad_amount=excluded.squad_amount,
       protocol_amount=excluded.protocol_amount,
       raw_amount=excluded.raw_amount,
       source_contract=excluded.source_contract,
       source_event=excluded.source_event,
       matched_activity_source=excluded.matched_activity_source,
       metadata=excluded.metadata,
       updated_at=now()`,
    [
      SOLANA_CHAIN_ID,
      signature,
      logIndex,
      blockNumber,
      occurredAt,
      epoch.id,
      event.trader,
      event.campaign,
      routeProfile,
      leagueLamports.toString(),
      event.recruiterLamports.toString(),
      event.airdropLamports.toString(),
      event.squadLamports.toString(),
      event.protocolLamports.toString(),
      event.feeLamports.toString(),
      programId(),
      JSON.stringify({
        nativeUnit: "lamports",
        side: event.side === 0 ? "buy" : "sell",
        sideCode: event.side,
        routeProfileCode: event.routeProfile,
        grossLamports: event.grossLamports.toString(),
        feeLamports: event.feeLamports.toString(),
        weeklyLeagueLamports: event.weeklyLeagueLamports.toString(),
        monthlyLeagueLamports: event.monthlyLeagueLamports.toString(),
      }),
    ],
  );
}

export async function runSolanaRewardEventIndexerOnce(limit = 100) {
  const pending = await pendingTradeTransactions(limit);
  let transactions = 0;
  let events = 0;
  let missing = 0;
  let failed = 0;

  for (const row of pending) {
    const signature = String(row.tx_hash || "").trim();
    if (!signature) continue;
    try {
      const tx = await getTransaction(signature);
      const decoded = decodeFeeSlicesRouted(tx?.meta?.logMessages);
      if (!decoded.length) {
        missing += 1;
        console.warn("[solana-rewards] FeeSlicesRouted not found for indexed trade", signature);
        continue;
      }

      const occurredAt = row.block_time instanceof Date ? row.block_time : new Date(row.block_time);
      const blockNumber = Number(row.block_number || 0);
      if (Number.isNaN(occurredAt.getTime()) || !Number.isFinite(blockNumber) || blockNumber <= 0) {
        throw new Error("Indexed trade is missing canonical block metadata");
      }

      for (const item of decoded) {
        await persistRewardEvent(signature, item.logIndex, blockNumber, occurredAt, item.event);
        events += 1;
      }
      transactions += 1;
    } catch (error) {
      failed += 1;
      console.error("[solana-rewards] transaction ingest failed", {
        signature,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { scanned: pending.length, transactions, events, missing, failed };
}

let running = false;
let started = false;

export function startSolanaRewardEventIndexerLoop() {
  if (started) return;
  started = true;

  console.log("[solana-rewards] route-event indexer enabled", {
    chainId: SOLANA_CHAIN_ID,
    programId: programId(),
    rpcCount: solanaRpcUrls().length,
  });

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runSolanaRewardEventIndexerOnce(250);
      if (result.scanned > 0) console.log("[solana-rewards] ingest", result);
    } catch (error) {
      console.error("[solana-rewards] loop error", error);
    } finally {
      running = false;
    }
  };

  setTimeout(() => { void tick(); }, 4_000);
  setInterval(() => { void tick(); }, Math.max(5_000, ENV.SOLANA_INDEXER_INTERVAL_MS || 10_000));
}
