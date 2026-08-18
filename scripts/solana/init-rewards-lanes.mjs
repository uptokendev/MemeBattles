#!/usr/bin/env node
/**
 * Initializes the Solana rewards route state and reward-lane vaults using the
 * split instructions required by the current mwz_rewards_treasury program.
 *
 * The old initialize_lanes instruction was removed because its Anchor account
 * validation exceeded Solana's 4096-byte SBF stack-frame limit. Keep these
 * initializers as separate transactions.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.SOLANA_REWARDS_TREASURY_PROGRAM_ID || "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX",
);
const RPC =
  process.env.SOLANA_REWARDS_RPC_URL_102 ||
  process.env.SOLANA_RPC_URL_102 ||
  process.env.SOLANA_REWARDS_RPC_URL ||
  process.env.SOLANA_RPC ||
  "https://api.devnet.solana.com";
const DEFAULT_OPERATOR =
  process.env.SOLANA_PROTOCOL_OPERATOR || "HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9";
const SOL_USD_MICROS = BigInt(process.env.SOL_USD_MICROS || "150000000"); // $150

function keypairFromBytes(bytes) {
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error(`Solana rewards authority must decode to 32 or 64 bytes, got ${bytes.length}`);
}

function loadKeypair() {
  const raw = String(process.env.SOLANA_REWARDS_AUTHORITY_SECRET_KEY || "").trim();
  if (raw) {
    const bytes = raw.startsWith("[")
      ? Uint8Array.from(JSON.parse(raw).map(Number))
      : Uint8Array.from(Buffer.from(raw, "base64"));
    return keypairFromBytes(bytes);
  }

  const file =
    String(process.env.SOLANA_PROTOCOL_AUTHORITY_KEYPAIR || "").trim() ||
    path.join(os.homedir(), ".config/memewarzone/solana-devnet/deployer.json");
  return keypairFromBytes(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
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

async function requireRewardsConfig(connection, config, authority) {
  const info = await connection.getAccountInfo(config, "confirmed");
  if (!info || info.data.length < 44) {
    throw new Error(`RewardsConfig is missing or malformed at ${config.toBase58()}`);
  }
  const configuredAuthority = new PublicKey(info.data.subarray(8, 40));
  if (!configuredAuthority.equals(authority)) {
    throw new Error(
      `RewardsConfig authority mismatch: on-chain=${configuredAuthority.toBase58()} signer=${authority.toBase58()}`,
    );
  }
}

async function sendInitializer(connection, payer, name, keys, data = Buffer.alloc(0)) {
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Buffer.concat([discriminator(name), data]),
  });
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [payer],
    { commitment: "confirmed" },
  );
  console.log(name, signature);
  return signature;
}

async function main() {
  const payer = loadKeypair();
  const connection = new Connection(RPC, "confirmed");
  const operator = new PublicKey(DEFAULT_OPERATOR);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("rewards_config")], PROGRAM_ID);
  const [routeState] = PublicKey.findProgramAddressSync([Buffer.from("route_state")], PROGRAM_ID);
  const [monthly] = PublicKey.findProgramAddressSync([Buffer.from("monthly_league_vault")], PROGRAM_ID);
  const [recruiter] = PublicKey.findProgramAddressSync([Buffer.from("recruiter_vault")], PROGRAM_ID);
  const [squad] = PublicKey.findProgramAddressSync([Buffer.from("squad_vault")], PROGRAM_ID);
  const [protocol] = PublicKey.findProgramAddressSync([Buffer.from("protocol_vault")], PROGRAM_ID);

  console.log({
    rpc: RPC,
    programId: PROGRAM_ID.toBase58(),
    authority: payer.publicKey.toBase58(),
    operator: operator.toBase58(),
    config: config.toBase58(),
    routeState: routeState.toBase58(),
    monthly: monthly.toBase58(),
    recruiter: recruiter.toBase58(),
    squad: squad.toBase58(),
    protocol: protocol.toBase58(),
  });

  await requireRewardsConfig(connection, config, payer.publicKey);

  const [routeInfo, protocolInfo] = await Promise.all([
    connection.getAccountInfo(routeState, "confirmed"),
    connection.getAccountInfo(protocol, "confirmed"),
  ]);
  if (Boolean(routeInfo) !== Boolean(protocolInfo)) {
    throw new Error(
      "Inconsistent rewards route initialization: route_state and protocol_vault must either both exist or both be absent",
    );
  }
  if (!routeInfo) {
    await sendInitializer(
      connection,
      payer,
      "initialize_route_state",
      [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: routeState, isSigner: false, isWritable: true },
        { pubkey: protocol, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      Buffer.concat([operator.toBuffer(), u64le(SOL_USD_MICROS)]),
    );
  } else {
    console.log("initialize_route_state skipped; route_state/protocol_vault already exist");
  }

  const initializers = [
    ["initialize_monthly_league_vault", monthly],
    ["initialize_recruiter_vault", recruiter],
    ["initialize_squad_vault", squad],
  ];

  for (const [name, vault] of initializers) {
    if (await connection.getAccountInfo(vault, "confirmed")) {
      console.log(`${name} skipped; ${vault.toBase58()} already exists`);
      continue;
    }
    await sendInitializer(connection, payer, name, [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]);
  }

  const finalAccounts = await Promise.all(
    [routeState, protocol, monthly, recruiter, squad].map((address) =>
      connection.getAccountInfo(address, "confirmed"),
    ),
  );
  if (finalAccounts.some((info) => !info)) {
    throw new Error("Rewards lane initialization finished but one or more required PDAs are still missing");
  }

  console.log("Rewards route state and lane vaults are initialized.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
