import { createHash } from "crypto";
import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { deriveFeeEscrowAddress } from "./solanaIndexer.js";

const SOLANA_CHAIN_ID = 101;
const DEFAULT_PROGRAM_ID = "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt";
const DEFAULT_TREASURY = "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX";
const CAMPAIGN_CURVE_CLOSED_OFFSET = 714;
const FEE_ESCROW_PENDING_OFFSET = 8 + 32;
const FEE_ESCROW_PENDING_LANES = 6;
const WORKER_LOCK_KEY = "solana-fee-escrow-worker";
const DEFAULT_FLUSH_THRESHOLD_LAMPORTS = 10_000_000n;

let workerStarted = false;
let tickRunning = false;

const INIT_DISC = createHash("sha256").update("global:initialize_fee_escrow").digest().subarray(0, 8);
const FLUSH_DISC = createHash("sha256").update("global:flush_campaign_fees").digest().subarray(0, 8);

function programId(): PublicKey {
  return new PublicKey(String(ENV.SOLANA_LAUNCHPAD_PROGRAM_ID || DEFAULT_PROGRAM_ID).trim());
}

function treasuryId(): PublicKey {
  return new PublicKey(
    String(process.env.SOLANA_REWARDS_TREASURY_PROGRAM_ID || DEFAULT_TREASURY).trim(),
  );
}

function rpcUrl(): string {
  return String(ENV.SOLANA_RPC_HTTP || process.env.SOLANA_RPC_URL || process.env.SOLANA_RPC || "").trim();
}

function workerIntervalMs(): number {
  return Math.max(5_000, Number(process.env.SOLANA_FEE_ESCROW_WORKER_INTERVAL_MS || 15_000));
}

function flushThresholdLamports(): bigint {
  const raw = process.env.SOLANA_FEE_ESCROW_FLUSH_THRESHOLD_LAMPORTS;
  if (raw == null || raw === "") return DEFAULT_FLUSH_THRESHOLD_LAMPORTS;
  try {
    const parsed = BigInt(raw);
    return parsed > 0n ? parsed : DEFAULT_FLUSH_THRESHOLD_LAMPORTS;
  } catch {
    return DEFAULT_FLUSH_THRESHOLD_LAMPORTS;
  }
}

function withSimpleQuery<T extends { query: (...args: any[]) => any }>(client: T): T {
  const origQuery = client.query.bind(client);
  client.query = (...args: any[]) => {
    if (typeof args[0] === "string") {
      return origQuery({ text: args[0], values: Array.isArray(args[1]) ? args[1] : undefined, simple: true });
    }
    if (args[0] && typeof args[0] === "object" && typeof args[0].text === "string") {
      return origQuery({ ...args[0], simple: true });
    }
    return origQuery.apply(client, args);
  };
  return client;
}

function flushMaxAgeMs(): number {
  return Math.max(1_000, Number(process.env.SOLANA_FEE_ESCROW_FLUSH_MAX_AGE_MS || 120_000));
}

function loadPayer(): Keypair | null {
  const file = String(process.env.SOLANA_FEE_ESCROW_PAYER_KEYPAIR || "").trim();
  if (file) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const secret = String(process.env.SOLANA_FEE_ESCROW_PAYER_SECRET || "").trim();
  if (!secret) return null;
  const parsed = JSON.parse(secret);
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function vaultPda(seed: string): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], treasuryId())[0];
}

function pendingFromEscrowData(data: Buffer): bigint {
  if (data.length < FEE_ESCROW_PENDING_OFFSET + FEE_ESCROW_PENDING_LANES * 8) return 0n;
  let total = 0n;
  for (let i = 0; i < FEE_ESCROW_PENDING_LANES; i += 1) {
    total += data.readBigUInt64LE(FEE_ESCROW_PENDING_OFFSET + i * 8);
  }
  return total;
}

function campaignCurveClosed(data: Buffer): boolean {
  return data.length > CAMPAIGN_CURVE_CLOSED_OFFSET && data[CAMPAIGN_CURVE_CLOSED_OFFSET] === 1;
}

async function markInit(campaign: string, status: "initialized" | "failed", signature?: string, error?: string) {
  await pool.query(
    `update public.solana_fee_escrow_accruals
        set init_status=$3,
            init_signature=coalesce($4, init_signature),
            last_error=$5,
            updated_at=now()
      where chain_id=$1 and campaign_address=$2`,
    [SOLANA_CHAIN_ID, campaign, status, signature || null, error || null],
  );
}

async function markFlush(
  campaign: string,
  status: "submitted" | "confirmed" | "failed" | "queued",
  signature?: string,
  error?: string,
) {
  await pool.query(
    `update public.solana_fee_escrow_accruals
        set flush_status=$3,
            last_flush_signature=coalesce($4, last_flush_signature),
            flush_attempts = flush_attempts + case when $3 in ('submitted','failed') then 1 else 0 end,
            last_error=$5,
            updated_at=now()
      where chain_id=$1 and campaign_address=$2`,
    [SOLANA_CHAIN_ID, campaign, status, signature || null, error || null],
  );
}

async function initializeOne(
  connection: Connection,
  payer: Keypair,
  campaign: PublicKey,
): Promise<string> {
  const escrow = new PublicKey(deriveFeeEscrowAddress(campaign.toBase58(), programId().toBase58()));
  const ix = new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: campaign, isSigner: false, isWritable: false },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: INIT_DISC,
  });
  return sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], {
    commitment: "confirmed",
  });
}

async function flushOne(
  connection: Connection,
  payer: Keypair,
  campaign: PublicKey,
  escrow: PublicKey,
): Promise<string> {
  const ix = new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: campaign, isSigner: false, isWritable: false },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: vaultPda("league_vault"), isSigner: false, isWritable: true },
      { pubkey: vaultPda("airdrop_vault"), isSigner: false, isWritable: true },
      { pubkey: vaultPda("monthly_league_vault"), isSigner: false, isWritable: true },
      { pubkey: vaultPda("recruiter_vault"), isSigner: false, isWritable: true },
      { pubkey: vaultPda("squad_vault"), isSigner: false, isWritable: true },
      { pubkey: vaultPda("protocol_vault"), isSigner: false, isWritable: true },
    ],
    data: FLUSH_DISC,
  });
  return sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], {
    commitment: "confirmed",
  });
}

async function processInits(connection: Connection, payer: Keypair) {
  const rows = await pool.query(
    `select campaign_address, escrow_address
       from public.solana_fee_escrow_accruals
      where chain_id=$1 and init_status in ('pending','failed')
      order by updated_at asc
      limit 25`,
    [SOLANA_CHAIN_ID],
  );
  for (const row of rows.rows) {
    const campaign = new PublicKey(String(row.campaign_address));
    const escrowPk = new PublicKey(
      String(row.escrow_address || deriveFeeEscrowAddress(campaign.toBase58(), programId().toBase58())),
    );
    try {
      const existing = await connection.getAccountInfo(escrowPk, "confirmed");
      if (existing && existing.owner.equals(programId()) && existing.data.length >= 8) {
        await markInit(campaign.toBase58(), "initialized");
        continue;
      }
      const sig = await initializeOne(connection, payer, campaign);
      await markInit(campaign.toBase58(), "initialized", sig);
      console.info("[solana-fee-escrow] initialized", campaign.toBase58(), sig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markInit(campaign.toBase58(), "failed", undefined, message);
      console.warn("[solana-fee-escrow] init failed", campaign.toBase58(), message);
    }
  }
}

async function processFlushes(connection: Connection, payer: Keypair) {
  const threshold = flushThresholdLamports();
  const maxAgeMs = flushMaxAgeMs();
  const rows = await pool.query(
    `select campaign_address, escrow_address, last_accrued_at,
            (weekly_accrued - weekly_flushed)
          + (monthly_accrued - monthly_flushed)
          + (recruiter_accrued - recruiter_flushed)
          + (airdrop_accrued - airdrop_flushed)
          + (squad_accrued - squad_flushed)
          + (protocol_accrued - protocol_flushed) as pending_total
       from public.solana_fee_escrow_accruals
      where chain_id=$1
        and init_status='initialized'
      order by last_accrued_at asc nulls last
      limit 25`,
    [SOLANA_CHAIN_ID],
  );
  const now = Date.now();
  for (const row of rows.rows) {
    const campaign = new PublicKey(String(row.campaign_address));
    const escrow = new PublicKey(
      String(row.escrow_address || deriveFeeEscrowAddress(campaign.toBase58(), programId().toBase58())),
    );
    try {
      const [escrowInfo, campaignInfo] = await connection.getMultipleAccountsInfo(
        [escrow, campaign],
        "confirmed",
      );
      const onChainPending = escrowInfo?.data ? pendingFromEscrowData(Buffer.from(escrowInfo.data)) : 0n;
      const closed = campaignInfo?.data ? campaignCurveClosed(Buffer.from(campaignInfo.data)) : false;
      const dbPending = BigInt(String(row.pending_total || "0"));
      const pending = onChainPending > 0n ? onChainPending : dbPending;
      const accruedAt = row.last_accrued_at ? new Date(row.last_accrued_at).getTime() : 0;
      const aged = accruedAt > 0 && now - accruedAt >= maxAgeMs;
      if (pending <= 0n) continue;
      // queued means pending work exists; flush only on threshold, age, or curve close.
      if (!(pending >= threshold || aged || closed)) continue;

      await markFlush(campaign.toBase58(), "submitted");
      const sig = await flushOne(connection, payer, campaign, escrow);
      await markFlush(campaign.toBase58(), "confirmed", sig);
      console.info("[solana-fee-escrow] flushed", campaign.toBase58(), sig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markFlush(campaign.toBase58(), "failed", undefined, message);
      console.warn("[solana-fee-escrow] flush failed", campaign.toBase58(), message);
    }
  }
}

async function runTick(connection: Connection, payer: Keypair): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  let lockClient: { query: (...args: any[]) => Promise<any>; release: () => void } | null = null;
  let locked = false;
  try {
    lockClient = withSimpleQuery(await pool.connect());
    const lock = await lockClient.query(
      "select pg_try_advisory_lock(hashtext($1)::bigint) as acquired",
      [WORKER_LOCK_KEY],
    );
    locked = Boolean(lock.rows[0]?.acquired);
    if (!locked) {
      console.info("[solana-fee-escrow] skip tick; another worker holds the lock");
      return;
    }
    await processInits(connection, payer);
    await processFlushes(connection, payer);
  } finally {
    if (lockClient && locked) {
      await lockClient.query(
        "select pg_advisory_unlock(hashtext($1)::bigint)",
        [WORKER_LOCK_KEY],
      ).catch(() => {});
    }
    lockClient?.release();
    tickRunning = false;
  }
}

export function startSolanaFeeEscrowWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  const payer = (() => {
    try {
      return loadPayer();
    } catch (error) {
      console.warn(
        "[solana-fee-escrow] payer key unreadable",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  })();
  const url = rpcUrl();
  if (!payer || !url) {
    console.warn("[solana-fee-escrow] worker disabled (set SOLANA_FEE_ESCROW_PAYER_KEYPAIR and SOLANA_RPC_HTTP)");
    return;
  }
  const connection = new Connection(url, "confirmed");
  const tick = () => runTick(connection, payer);
  void tick().catch((error) => {
    console.warn("[solana-fee-escrow] worker tick failed", error instanceof Error ? error.message : String(error));
  });
  setInterval(() => {
    void tick().catch((error) => {
      console.warn("[solana-fee-escrow] worker tick failed", error instanceof Error ? error.message : String(error));
    });
  }, workerIntervalMs());
}
