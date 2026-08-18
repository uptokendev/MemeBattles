#!/usr/bin/env node
/**
 * Deploy-time initialize for mwz_rewards_treasury.
 * Creates RewardsConfig + League/Airdrop vault PDAs.
 *
 * Supports the same devnet environment contract used by the reward publishers:
 * SOLANA_REWARDS_RPC_URL and SOLANA_REWARDS_AUTHORITY_SECRET_KEY.
 * A local authority keypair path remains available as an operator fallback.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

function discriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

async function main() {
  const payer = loadKeypair();
  const connection = new Connection(RPC, "confirmed");
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("rewards_config")], PROGRAM_ID);
  const [leagueVault] = PublicKey.findProgramAddressSync([Buffer.from("league_vault")], PROGRAM_ID);
  const [airdropVault] = PublicKey.findProgramAddressSync([Buffer.from("airdrop_vault")], PROGRAM_ID);

  console.log({
    rpc: RPC,
    authority: payer.publicKey.toBase58(),
    programId: PROGRAM_ID.toBase58(),
    config: config.toBase58(),
    leagueVault: leagueVault.toBase58(),
    airdropVault: airdropVault.toBase58(),
  });

  const existing = await connection.getAccountInfo(config, "confirmed");
  if (existing) {
    if (!existing.owner.equals(PROGRAM_ID) || existing.data.length < 44) {
      throw new Error(`Existing RewardsConfig at ${config.toBase58()} is malformed or owned by another program`);
    }
    const configuredAuthority = new PublicKey(existing.data.subarray(8, 40));
    if (!configuredAuthority.equals(payer.publicKey)) {
      throw new Error(
        `RewardsConfig already exists with authority ${configuredAuthority.toBase58()}, signer is ${payer.publicKey.toBase58()}`,
      );
    }
    for (const [label, address] of [["league_vault", leagueVault], ["airdrop_vault", airdropVault]]) {
      const info = await connection.getAccountInfo(address, "confirmed");
      if (!info || !info.owner.equals(PROGRAM_ID)) {
        throw new Error(`RewardsConfig exists but ${label} is missing or owned by another program at ${address.toBase58()}`);
      }
    }
    console.log("RewardsConfig and base reward vaults already initialized with the expected authority.");
    return;
  }

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: leagueVault, isSigner: false, isWritable: true },
      { pubkey: airdropVault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator("initialize"),
  });

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [payer],
    { commitment: "confirmed" },
  );
  console.log("initialize", signature);

  const [configAfter, leagueAfter, airdropAfter] = await Promise.all([
    connection.getAccountInfo(config, "confirmed"),
    connection.getAccountInfo(leagueVault, "confirmed"),
    connection.getAccountInfo(airdropVault, "confirmed"),
  ]);
  if (!configAfter || !leagueAfter || !airdropAfter) {
    throw new Error("Base rewards initialization transaction confirmed but one or more required PDAs are missing");
  }
  console.log("RewardsConfig and base League/Airdrop vaults are initialized.");
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
