import crypto from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const PROGRAM_ID_FALLBACK = "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX";
const CONFIG_SEED = Buffer.from("rewards_config");
const AIRDROP_VAULT_SEED = Buffer.from("airdrop_vault");
const AIRDROP_BATCH_SEED = Buffer.from("airdrop_batch");
const VAULT_ACCOUNT_SIZE = 8 + 1;
const AIRDROP_BATCH_ACCOUNT_SIZE = 8 + 8 + 32 + 8 + 8 + 8 + 1 + 1;

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function boolEnv(name, fallback = false) {
  const raw = env(name);
  return raw ? ["1", "true", "yes", "on"].includes(raw.toLowerCase()) : fallback;
}

function i64le(value) {
  let n = BigInt(value);
  if (n < -(1n << 63n) || n > (1n << 63n) - 1n) throw new Error("i64 overflow");
  if (n < 0n) n = (1n << 64n) + n;
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function u64le(value) {
  let n = BigInt(value);
  if (n < 0n || n > (1n << 64n) - 1n) throw new Error("u64 overflow");
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function anchorDiscriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function rootBytes(value) {
  const raw = String(value || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("Invalid Solana Merkle root");
  return Buffer.from(raw, "hex");
}

function readAuthority() {
  const raw = env("SOLANA_REWARDS_AUTHORITY_SECRET_KEY");
  if (!raw) throw new Error("SOLANA_REWARDS_AUTHORITY_SECRET_KEY is required for Solana reward publication");
  let bytes;
  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("SOLANA_REWARDS_AUTHORITY_SECRET_KEY JSON must be an array");
    bytes = Uint8Array.from(parsed.map(Number));
  } else {
    bytes = Uint8Array.from(Buffer.from(raw, "base64"));
  }
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error(`SOLANA_REWARDS_AUTHORITY_SECRET_KEY must decode to 32 or 64 bytes, got ${bytes.length}`);
}

export function solanaRewardAddresses() {
  const programId = new PublicKey(env("SOLANA_REWARDS_TREASURY_PROGRAM_ID", PROGRAM_ID_FALLBACK));
  const [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  const [airdropVault] = PublicKey.findProgramAddressSync([AIRDROP_VAULT_SEED], programId);
  return { programId, config, airdropVault };
}

export function solanaAirdropBatchAddress(epochId) {
  const { programId } = solanaRewardAddresses();
  return PublicKey.findProgramAddressSync([AIRDROP_BATCH_SEED, i64le(epochId)], programId)[0];
}

export function solanaConnection() {
  const rpc = env("SOLANA_REWARDS_RPC_URL") || env("SOLANA_RPC_URL") || env("SOLANA_RPC_HTTP");
  if (!rpc) throw new Error("SOLANA_REWARDS_RPC_URL (or SOLANA_RPC_URL) is required");
  return new Connection(rpc.split(",").map((item) => item.trim()).find(Boolean), "confirmed");
}

async function sendInstruction(connection, authority, instruction) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: authority.publicKey, recentBlockhash: latest.blockhash }).add(instruction);
  tx.sign(authority);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return signature;
}

async function configClaimsEnabled(connection, configAddress) {
  const info = await connection.getAccountInfo(configAddress, "confirmed");
  if (!info) throw new Error(`Solana RewardsConfig ${configAddress.toBase58()} is not initialized`);
  if (info.data.length < 44) throw new Error(`Solana RewardsConfig has unexpected size ${info.data.length}`);
  return info.data[43] === 1;
}

async function ensureClaimsEnabled(connection, authority) {
  const { programId, config } = solanaRewardAddresses();
  if (await configClaimsEnabled(connection, config)) return { enabled: true, txHash: null };
  if (!boolEnv("SOLANA_REWARDS_AUTO_ENABLE_CLAIMS", false)) {
    throw new Error("Solana reward claims are disabled on-chain. Set SOLANA_REWARDS_AUTO_ENABLE_CLAIMS=true for the authorized launch setup run.");
  }
  const data = Buffer.concat([anchorDiscriminator("set_claims_enabled"), Buffer.from([1])]);
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
    ],
    data,
  });
  const txHash = await sendInstruction(connection, authority, ix);
  if (!(await configClaimsEnabled(connection, config))) throw new Error("Solana claims-enable transaction confirmed but config still reports disabled");
  return { enabled: true, txHash };
}

export async function resolveSolanaAirdropPool() {
  const connection = solanaConnection();
  const { airdropVault } = solanaRewardAddresses();
  const [balance, rentMinimum] = await Promise.all([
    connection.getBalance(airdropVault, "confirmed"),
    connection.getMinimumBalanceForRentExemption(VAULT_ACCOUNT_SIZE, "confirmed"),
  ]);
  const availableLamports = BigInt(Math.max(0, balance - rentMinimum));
  if (availableLamports <= 0n) {
    throw new Error(`Solana AirdropVault ${airdropVault.toBase58()} has no distributable lamports`);
  }
  return {
    availableLamports,
    source: "solana_airdrop_vault",
    vaultAddress: airdropVault.toBase58(),
    rentMinimumLamports: String(rentMinimum),
    vaultBalanceLamports: String(balance),
  };
}

async function readBatch(connection, batchAddress) {
  const info = await connection.getAccountInfo(batchAddress, "confirmed");
  if (!info) return null;
  const data = Buffer.from(info.data);
  if (data.length < AIRDROP_BATCH_ACCOUNT_SIZE) {
    throw new Error(`Solana AirdropBatch has unexpected size ${data.length}; expected at least ${AIRDROP_BATCH_ACCOUNT_SIZE}`);
  }
  return {
    epochId: data.readBigInt64LE(8),
    root: `0x${data.subarray(16, 48).toString("hex")}`,
    totalLamports: data.readBigUInt64LE(48),
    claimedLamports: data.readBigUInt64LE(56),
    deadline: data.readBigInt64LE(64),
  };
}

export async function publishSolanaAirdropEpoch({ epochId, root, totalLamports, deadline }) {
  const connection = solanaConnection();
  const authority = readAuthority();
  const { programId, config, airdropVault } = solanaRewardAddresses();
  const batchAddress = solanaAirdropBatchAddress(epochId);

  const configInfo = await connection.getAccountInfo(config, "confirmed");
  if (!configInfo) throw new Error("Solana rewards treasury is not initialized");
  const storedAuthority = new PublicKey(configInfo.data.subarray(8, 40));
  if (!storedAuthority.equals(authority.publicKey)) {
    throw new Error(`SOLANA_REWARDS_AUTHORITY_SECRET_KEY does not match RewardsConfig authority ${storedAuthority.toBase58()}`);
  }

  const enabled = await ensureClaimsEnabled(connection, authority);
  const existing = await readBatch(connection, batchAddress);
  if (existing) {
    if (existing.epochId !== BigInt(epochId)) throw new Error("Existing Solana airdrop batch epoch mismatch");
    if (existing.root.toLowerCase() !== String(root).toLowerCase()) throw new Error("Existing Solana airdrop batch has a different Merkle root");
    if (existing.totalLamports !== BigInt(totalLamports)) throw new Error("Existing Solana airdrop batch has a different total");
    if (existing.deadline !== BigInt(deadline)) throw new Error("Existing Solana airdrop batch has a different deadline");
    return {
      alreadyExisted: true,
      txHash: null,
      claimsEnableTxHash: enabled.txHash,
      batchAddress: batchAddress.toBase58(),
      programId: programId.toBase58(),
      configAddress: config.toBase58(),
      vaultAddress: airdropVault.toBase58(),
    };
  }

  const vaultBalance = await connection.getBalance(airdropVault, "confirmed");
  const rentMinimum = await connection.getMinimumBalanceForRentExemption(VAULT_ACCOUNT_SIZE, "confirmed");
  if (BigInt(Math.max(0, vaultBalance - rentMinimum)) < BigInt(totalLamports)) {
    throw new Error(`Solana AirdropVault has insufficient distributable SOL for ${totalLamports} lamports`);
  }

  const data = Buffer.concat([
    anchorDiscriminator("set_airdrop_batch_root"),
    i64le(epochId),
    rootBytes(root),
    u64le(totalLamports),
    i64le(deadline),
  ]);
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: airdropVault, isSigner: false, isWritable: false },
      { pubkey: batchAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  const txHash = await sendInstruction(connection, authority, ix);
  const confirmed = await readBatch(connection, batchAddress);
  if (!confirmed || confirmed.root.toLowerCase() !== String(root).toLowerCase() || confirmed.totalLamports !== BigInt(totalLamports)) {
    throw new Error("Solana airdrop root transaction confirmed but batch account did not reconcile");
  }
  return {
    alreadyExisted: false,
    txHash,
    claimsEnableTxHash: enabled.txHash,
    batchAddress: batchAddress.toBase58(),
    programId: programId.toBase58(),
    configAddress: config.toBase58(),
    vaultAddress: airdropVault.toBase58(),
  };
}
