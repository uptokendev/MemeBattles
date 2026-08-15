#!/usr/bin/env node
/**
 * Deploy-time initialize for mwz_rewards_treasury.
 * Creates config + league_vault + airdrop_vault PDAs.
 * Authority is the protocol deployer. SOL never sits in that key.
 */
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
const RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const HARVEST = "HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9";
const INIT_DISC = Buffer.from([0xaf, 0xaf, 0x6d, 0x1f, 0x0d, 0x98, 0x9b, 0xed]);

function loadKeypair() {
  const explicit = String(process.env.SOLANA_PROTOCOL_AUTHORITY_KEYPAIR || "").trim();
  const fallback = path.join(os.homedir(), ".config/memewarzone/solana-devnet/deployer.json");
  const file = explicit || fallback;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const payer = loadKeypair();
  const connection = new Connection(RPC, "confirmed");
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("rewards_config")], PROGRAM_ID);
  const [leagueVault] = PublicKey.findProgramAddressSync([Buffer.from("league_vault")], PROGRAM_ID);
  const [airdropVault] = PublicKey.findProgramAddressSync([Buffer.from("airdrop_vault")], PROGRAM_ID);

  console.log("authority", payer.publicKey.toBase58());
  console.log("program  ", PROGRAM_ID.toBase58());
  console.log("config   ", config.toBase58());
  console.log("league   ", leagueVault.toBase58());
  console.log("airdrop  ", airdropVault.toBase58());
  if (payer.publicKey.toBase58() === HARVEST) {
    console.log("note: deployer is the V4 upgrade authority. Pots are the PDAs, not this wallet.");
  }

  const existing = await connection.getAccountInfo(config);
  if (existing) {
    console.log("already initialized");
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
    data: INIT_DISC,
  });

  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], {
    commitment: "confirmed",
  });
  console.log("initialize signature", sig);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
