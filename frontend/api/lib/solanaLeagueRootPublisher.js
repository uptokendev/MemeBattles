import crypto from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  REWARDS_TREASURY_PROGRAM_ID,
  buildMerkleRoot,
  deriveLeagueEpochPda,
  deriveRewardsVaults,
  leagueLeaf,
} from "../solanaLeagueMerkle.js";

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

function discriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function secretKey() {
  const raw = env("SOLANA_REWARDS_AUTHORITY_SECRET_KEY");
  if (!raw) throw new Error("SOLANA_REWARDS_AUTHORITY_SECRET_KEY is required for Solana League root publication");
  let bytes;
  if (raw.startsWith("[")) bytes = Uint8Array.from(JSON.parse(raw).map(Number));
  else bytes = Uint8Array.from(Buffer.from(raw, "base64"));
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error(`Solana rewards authority must decode to 32 or 64 bytes, got ${bytes.length}`);
}

function rpcUrl(chainId) {
  return (
    env(`SOLANA_REWARDS_RPC_URL_${chainId}`) ||
    env(`SOLANA_RPC_URL_${chainId}`) ||
    env("SOLANA_REWARDS_RPC_URL") ||
    env("SOLANA_RPC_URL") ||
    env("SOLANA_RPC_HTTP")
  ).split(",").map((item) => item.trim()).find(Boolean) || "";
}

function connectionFor(chainId) {
  const rpc = rpcUrl(chainId);
  if (!rpc) throw new Error(`Solana reward RPC is not configured for chain ${chainId}`);
  return new Connection(rpc, "confirmed");
}

async function send(connection, signer, ix) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: latest.blockhash }).add(ix);
  tx.sign(signer);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return signature;
}

async function assertAuthority(connection, configAddress, signer) {
  const info = await connection.getAccountInfo(new PublicKey(configAddress), "confirmed");
  if (!info || info.data.length < 44) throw new Error("Solana RewardsConfig is missing or malformed");
  const configured = new PublicKey(info.data.subarray(8, 40));
  if (!configured.equals(signer.publicKey)) {
    throw new Error(`Solana rewards authority mismatch; configured ${configured.toBase58()}`);
  }
  return { info, claimsEnabled: info.data[43] === 1 };
}

async function enableClaimsIfAllowed(connection, signer, programId, configAddress) {
  const state = await assertAuthority(connection, configAddress, signer);
  if (state.claimsEnabled) return null;
  if (!boolEnv("SOLANA_REWARDS_AUTO_ENABLE_CLAIMS", false)) {
    throw new Error("Solana rewards claims are disabled on-chain; authorized launch setup must enable them before League publication");
  }
  const ix = new TransactionInstruction({
    programId: new PublicKey(programId),
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: false },
      { pubkey: new PublicKey(configAddress), isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([discriminator("set_claims_enabled"), Buffer.from([1])]),
  });
  const signature = await send(connection, signer, ix);
  const after = await assertAuthority(connection, configAddress, signer);
  if (!after.claimsEnabled) throw new Error("Claims-enable transaction confirmed but RewardsConfig still reports disabled");
  return signature;
}

function rootBytes(root) {
  const raw = String(root || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("Invalid League Merkle root");
  return Buffer.from(raw, "hex");
}

async function readEpoch(connection, epochAddress) {
  const info = await connection.getAccountInfo(new PublicKey(epochAddress), "confirmed");
  if (!info) return null;
  const data = Buffer.from(info.data);
  if (data.length < 68) throw new Error(`Solana LeagueEpoch has unexpected size ${data.length}`);
  return {
    period: data.readUInt8(8),
    epochStart: data.readBigInt64LE(9),
    root: `0x${data.subarray(17, 49).toString("hex")}`,
    totalLamports: data.readBigUInt64LE(49),
    claimedLamports: data.readBigUInt64LE(57),
    initialized: data[66] === 1,
    sealed: data[67] === 1,
  };
}

export async function publishSolanaLeagueRoot({ chainId, period, epochStart, winners }) {
  const cid = Number(chainId);
  if (cid !== 101 && cid !== 102) throw new Error("Solana League publisher only supports chain IDs 101/102");
  if (!Array.isArray(winners) || !winners.length) throw new Error("No Solana League winners supplied");

  const epochDate = new Date(epochStart);
  if (Number.isNaN(epochDate.getTime())) throw new Error("Invalid League epochStart");
  const epochStartSec = Math.floor(epochDate.getTime() / 1000);
  const programId = env("SOLANA_REWARDS_TREASURY_PROGRAM_ID", REWARDS_TREASURY_PROGRAM_ID);
  const vaults = deriveRewardsVaults(programId);
  const epochAddress = deriveLeagueEpochPda(period, epochStartSec, programId);

  const leaves = winners.map((winner) => leagueLeaf({
    epochStartSec,
    period,
    category: winner.category,
    rank: Number(winner.rank),
    recipient: String(winner.recipient),
    amountRaw: String(winner.amountRaw),
  }));
  const root = buildMerkleRoot(leaves);
  const totalLamports = winners.reduce((sum, winner) => sum + BigInt(winner.amountRaw), 0n);
  if (totalLamports <= 0n) throw new Error("Solana League total is zero");

  const connection = connectionFor(cid);
  const signer = secretKey();
  const claimsEnableTxHash = await enableClaimsIfAllowed(connection, signer, programId, vaults.config);

  const existing = await readEpoch(connection, epochAddress);
  if (existing?.initialized) {
    if (existing.period !== (String(period).toLowerCase() === "monthly" ? 1 : 0)) throw new Error("Existing League epoch period mismatch");
    if (existing.epochStart !== BigInt(epochStartSec)) throw new Error("Existing League epoch start mismatch");
    if (existing.root.toLowerCase() !== root.toLowerCase()) throw new Error("Existing League epoch has a different Merkle root");
    if (existing.totalLamports !== totalLamports) throw new Error("Existing League epoch has a different total");
    if (!existing.sealed) throw new Error("Existing League epoch is not sealed");
    return {
      alreadyExisted: true,
      txHash: null,
      claimsEnableTxHash,
      root,
      totalLamports: totalLamports.toString(),
      epochStartSec,
      programId,
      configAddress: vaults.config,
      vaultAddress: vaults.leagueVault,
      epochAddress,
    };
  }

  const vaultBalance = await connection.getBalance(new PublicKey(vaults.leagueVault), "confirmed");
  const rentMinimum = await connection.getMinimumBalanceForRentExemption(9, "confirmed");
  if (BigInt(Math.max(0, vaultBalance - rentMinimum)) < totalLamports) {
    throw new Error(`Solana LeagueVault has insufficient distributable SOL for ${totalLamports} lamports`);
  }

  const periodCode = String(period).toLowerCase() === "monthly" ? 1 : 0;
  const data = Buffer.concat([
    discriminator("set_league_epoch_root"),
    Buffer.from([periodCode]),
    i64le(epochStartSec),
    rootBytes(root),
    u64le(totalLamports),
  ]);
  const ix = new TransactionInstruction({
    programId: new PublicKey(programId),
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(vaults.config), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(vaults.leagueVault), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(epochAddress), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  const txHash = await send(connection, signer, ix);
  const confirmed = await readEpoch(connection, epochAddress);
  if (!confirmed?.sealed || confirmed.root.toLowerCase() !== root.toLowerCase() || confirmed.totalLamports !== totalLamports) {
    throw new Error("Solana League root transaction confirmed but epoch account did not reconcile");
  }
  return {
    alreadyExisted: false,
    txHash,
    claimsEnableTxHash,
    root,
    totalLamports: totalLamports.toString(),
    epochStartSec,
    programId,
    configAddress: vaults.config,
    vaultAddress: vaults.leagueVault,
    epochAddress,
  };
}
