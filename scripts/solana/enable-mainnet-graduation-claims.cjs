#!/usr/bin/env node
/**
 * Unpause Solana mainnet-beta graduation + launchpad claims, and enable
 * rewards-treasury claims. Create/buy/sell stay open.
 *
 * Dry-run:
 *   SOLANA_RPC=... SOLANA_PROTOCOL_AUTHORITY_KEYPAIR=... \
 *   node scripts/solana/enable-mainnet-graduation-claims.cjs
 *
 * Send:
 *   node scripts/solana/enable-mainnet-graduation-claims.cjs --execute
 */
const fs = require("node:fs");
const path = require("node:path");
const anchor = require(path.resolve(__dirname, "../../tests/solana/node_modules/@coral-xyz/anchor"));
const { Connection, Keypair, PublicKey } = require(path.resolve(__dirname, "../../tests/solana/node_modules/@solana/web3.js"));

const ROOT = path.resolve(__dirname, "../..");
const LAUNCHPAD_IDL = path.join(ROOT, "target/idl/memewarzone_solana.json");
const REWARDS_IDL = path.join(ROOT, "target/idl/mwz_rewards_treasury.json");
const EXPECTED_LAUNCHPAD = "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt";
const EXPECTED_REWARDS = "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX";
const EXPECTED_PAYER = "9YN7WY8svWoeNgegS2oq7uNDyrdcfg9UDUQR7tWpeF8H";
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const GLOBAL = new PublicKey("B9NnmsXRQkZDr9LWwTnTU86mb26Uc5zp7G5gxdb6Jg5U");
const REWARDS_CONFIG = new PublicKey("FHtimMcBY5Wn8KC3abxMh6NvzDfSu2LHY6HZFUDTkRmt");

const TARGET_FLAGS = {
  paused: false,
  createPaused: false,
  buyPaused: false,
  sellPaused: false,
  graduationPaused: false,
  claimsPaused: false,
};

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function rpcHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-rpc";
  }
}

function readPauses(global) {
  return {
    paused: Boolean(global.paused),
    createPaused: Boolean(global.createPaused),
    buyPaused: Boolean(global.buyPaused),
    sellPaused: Boolean(global.sellPaused),
    graduationPaused: Boolean(global.graduationPaused),
    claimsPaused: Boolean(global.claimsPaused),
  };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const rpc = required("SOLANA_RPC");
  if (/devnet|testnet|explorer\.solana/i.test(rpc)) {
    throw new Error("SOLANA_RPC must be a mainnet-beta HTTP endpoint");
  }

  const keypairPath = required("SOLANA_PROTOCOL_AUTHORITY_KEYPAIR");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));
  if (payer.publicKey.toBase58() !== EXPECTED_PAYER) {
    throw new Error(`Refusing unexpected payer ${payer.publicKey.toBase58()}`);
  }

  const connection = new Connection(rpc, "confirmed");
  if ((await connection.getGenesisHash()) !== MAINNET_GENESIS) {
    throw new Error("Refusing non-mainnet genesis");
  }

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  const launchpad = new anchor.Program(JSON.parse(fs.readFileSync(LAUNCHPAD_IDL, "utf8")), provider);
  const rewards = new anchor.Program(JSON.parse(fs.readFileSync(REWARDS_IDL, "utf8")), provider);
  if (launchpad.programId.toBase58() !== EXPECTED_LAUNCHPAD) throw new Error("wrong launchpad IDL");
  if (rewards.programId.toBase58() !== EXPECTED_REWARDS) throw new Error("wrong rewards IDL");

  const global = await launchpad.account.globalConfig.fetch(GLOBAL);
  const rewardsConfig = await rewards.account.rewardsConfig.fetch(REWARDS_CONFIG);
  const before = {
    rpc: rpcHost(rpc),
    payer: payer.publicKey.toBase58(),
    execute,
    pauses: readPauses(global),
    rewardsClaimsEnabled: Boolean(rewardsConfig.claimsEnabled),
    rewardsAuthority: rewardsConfig.authority.toBase58(),
  };
  console.log(JSON.stringify({ before }, null, 2));
  if (before.rewardsAuthority !== EXPECTED_PAYER) {
    throw new Error(`rewards authority is ${before.rewardsAuthority}, not the 9YN7WY deployer`);
  }

  if (!execute) {
    console.log("Dry-run only. Re-run with --execute to unpause graduation/claims and enable rewards claims.");
    return;
  }

  const pauseSig = await launchpad.methods
    .setPauseFlags(TARGET_FLAGS)
    .accountsStrict({ globalConfig: GLOBAL, authority: payer.publicKey })
    .rpc();
  console.log("set_pause_flags", pauseSig);

  const claimsSig = await rewards.methods
    .setClaimsEnabled(true)
    .accountsStrict({ authority: payer.publicKey, config: REWARDS_CONFIG })
    .rpc();
  console.log("set_claims_enabled", claimsSig);

  const afterG = await launchpad.account.globalConfig.fetch(GLOBAL);
  const afterR = await rewards.account.rewardsConfig.fetch(REWARDS_CONFIG);
  const after = {
    pauses: readPauses(afterG),
    rewardsClaimsEnabled: Boolean(afterR.claimsEnabled),
  };
  if (after.pauses.graduationPaused || after.pauses.claimsPaused) {
    throw new Error("launchpad graduation or claims still paused");
  }
  if (!after.rewardsClaimsEnabled) throw new Error("rewards claims_enabled is still false");
  console.log(JSON.stringify({ after, ok: true }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
