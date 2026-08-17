#!/usr/bin/env node
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const DEVNET_GENESIS_HASH = "GH7ome3EiwEr7tu9JuTh2dpYWBJK3z69Xm1ZE3MEE6JC";
const PROGRAM_ID = new PublicKey(
  String(
    process.env.SOLANA_REWARDS_TREASURY_PROGRAM_ID ||
      "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX",
  ).trim(),
);
const RPC = String(
  process.env.SOLANA_REWARDS_RPC_URL ||
    process.env.SOLANA_REWARDS_RPC_URL_102 ||
    process.env.SOLANA_RPC_URL_102 ||
    "",
).trim();
const CHAIN_ID = Number(process.env.SOLANA_REWARD_CHAIN_ID || "102");
const CONFIRM = String(process.env.CERT_FUNDING_CONFIRM || "").trim();
const MAX_PER_VAULT_LAMPORTS = 1_000_000n; // 0.001 devnet SOL per vault max.

function fail(message) {
  throw new Error(`[solana-rewards-devnet-funding] ${message}`);
}

function parseLamports(name, fallback) {
  const raw = String(process.env[name] || fallback).trim();
  if (!/^\d+$/.test(raw)) fail(`${name} must be a positive integer lamport amount`);
  const value = BigInt(raw);
  if (value <= 0n) fail(`${name} must be greater than zero`);
  if (value > MAX_PER_VAULT_LAMPORTS) {
    fail(`${name} exceeds the certification cap of ${MAX_PER_VAULT_LAMPORTS} lamports`);
  }
  return value;
}

function authorityKeypair() {
  const raw = String(process.env.SOLANA_REWARDS_AUTHORITY_SECRET_KEY || "").trim();
  if (!raw) fail("SOLANA_REWARDS_AUTHORITY_SECRET_KEY is required");
  const bytes = raw.startsWith("[")
    ? Uint8Array.from(JSON.parse(raw).map(Number))
    : Uint8Array.from(Buffer.from(raw, "base64"));
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  fail(`authority secret must decode to 32 or 64 bytes, got ${bytes.length}`);
}

function pda(seed) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], PROGRAM_ID)[0];
}

async function assertVault(connection, label, address) {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) fail(`${label} is missing at ${address.toBase58()}`);
  if (!info.owner.equals(PROGRAM_ID)) {
    fail(`${label} is owned by ${info.owner.toBase58()}, expected ${PROGRAM_ID.toBase58()}`);
  }
  if (info.data.length < 9) fail(`${label} account data is malformed`);
  return info;
}

async function main() {
  if (CHAIN_ID !== 102) fail(`refusing to fund reward chain ${CHAIN_ID}; certification requires chain 102`);
  if (!RPC) fail("SOLANA_REWARDS_RPC_URL is required");
  if (CONFIRM !== "FUND_DEVNET_REWARDS") {
    fail("CERT_FUNDING_CONFIRM must equal FUND_DEVNET_REWARDS");
  }

  const recruiterLamports = parseLamports("CERT_RECRUITER_FUND_LAMPORTS", "100000");
  const squadLamports = parseLamports("CERT_SQUAD_FUND_LAMPORTS", "100000");
  const authority = authorityKeypair();
  const connection = new Connection(RPC, "confirmed");
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    fail(`RPC genesis hash ${genesisHash} is not the expected Solana devnet genesis hash`);
  }

  const rewardsConfig = pda("rewards_config");
  const recruiterVault = pda("recruiter_vault");
  const squadVault = pda("squad_vault");

  const configInfo = await connection.getAccountInfo(rewardsConfig, "confirmed");
  if (!configInfo || !configInfo.owner.equals(PROGRAM_ID) || configInfo.data.length < 44) {
    fail(`RewardsConfig is missing or malformed at ${rewardsConfig.toBase58()}`);
  }
  const configuredAuthority = new PublicKey(configInfo.data.subarray(8, 40));
  if (!configuredAuthority.equals(authority.publicKey)) {
    fail(
      `authority mismatch: RewardsConfig=${configuredAuthority.toBase58()} signer=${authority.publicKey.toBase58()}`,
    );
  }

  const [recruiterBefore, squadBefore] = await Promise.all([
    assertVault(connection, "Recruiter vault", recruiterVault),
    assertVault(connection, "Squad vault", squadVault),
  ]);
  const authorityBalance = BigInt(await connection.getBalance(authority.publicKey, "confirmed"));
  const requested = recruiterLamports + squadLamports;
  if (authorityBalance < requested + 50_000n) {
    fail(
      `authority balance ${authorityBalance} is too low for ${requested} lamports plus a transaction-fee reserve`,
    );
  }

  console.log(
    JSON.stringify(
      {
        cluster: "devnet",
        genesisHash,
        chainId: CHAIN_ID,
        programId: PROGRAM_ID.toBase58(),
        authority: authority.publicKey.toBase58(),
        recruiterVault: recruiterVault.toBase58(),
        squadVault: squadVault.toBase58(),
        recruiterBeforeLamports: recruiterBefore.lamports,
        squadBeforeLamports: squadBefore.lamports,
        recruiterTopUpLamports: recruiterLamports.toString(),
        squadTopUpLamports: squadLamports.toString(),
      },
      null,
      2,
    ),
  );

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: recruiterVault,
      lamports: Number(recruiterLamports),
    }),
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: squadVault,
      lamports: Number(squadLamports),
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  const [recruiterAfter, squadAfter] = await Promise.all([
    assertVault(connection, "Recruiter vault", recruiterVault),
    assertVault(connection, "Squad vault", squadVault),
  ]);
  if (BigInt(recruiterAfter.lamports - recruiterBefore.lamports) !== recruiterLamports) {
    fail("Recruiter vault delta does not equal requested certification top-up");
  }
  if (BigInt(squadAfter.lamports - squadBefore.lamports) !== squadLamports) {
    fail("Squad vault delta does not equal requested certification top-up");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        signature,
        recruiterAfterLamports: recruiterAfter.lamports,
        squadAfterLamports: squadAfter.lamports,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
