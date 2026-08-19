#!/usr/bin/env node
/**
 * Unpause Solana mainnet-beta create/buy/sell and turn on activeCreation.
 * Graduation and claims stay paused.
 *
 * Dry-run (default):
 *   SOLANA_RPC="https://mainnet.helius-rpc.com/?api-key=..." \
 *   SOLANA_PROTOCOL_AUTHORITY_KEYPAIR=/home/patrick/.config/memewarzone/solana-mainnet-deployer.json \
 *   node scripts/solana/enable-mainnet-create.cjs
 *
 * Send the two transactions:
 *   ... node scripts/solana/enable-mainnet-create.cjs --execute
 */
const fs = require("node:fs");
const path = require("node:path");
const anchor = require(path.resolve(__dirname, "../../tests/solana/node_modules/@coral-xyz/anchor"));
const { Connection, Keypair, PublicKey } = require(path.resolve(__dirname, "../../tests/solana/node_modules/@solana/web3.js"));

const ROOT = path.resolve(__dirname, "../..");
const IDL_PATH = path.join(ROOT, "target/idl/memewarzone_solana.json");
const EXPECTED_PROGRAM = "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt";
const EXPECTED_PAYER = "9YN7WY8svWoeNgegS2oq7uNDyrdcfg9UDUQR7tWpeF8H";
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const GLOBAL = new PublicKey("B9NnmsXRQkZDr9LWwTnTU86mb26Uc5zp7G5gxdb6Jg5U");
const GEN = new PublicKey("EsCZKsKDCzeZhP7GYSz8dHCHboaxejkmaqbi8ir32X25");

const TARGET_FLAGS = {
  paused: false,
  createPaused: false,
  buyPaused: false,
  sellPaused: false,
  graduationPaused: true,
  claimsPaused: true,
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

function hex32(value) {
  return Buffer.from(value).toString("hex");
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
  const genesis = await connection.getGenesisHash();
  if (genesis !== MAINNET_GENESIS) throw new Error(`Refusing non-mainnet genesis ${genesis}`);

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const program = new anchor.Program(
    idl,
    new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" }),
  );
  if (program.programId.toBase58() !== EXPECTED_PROGRAM) {
    throw new Error(`IDL program ${program.programId.toBase58()} != ${EXPECTED_PROGRAM}`);
  }

  const beforeG = await program.account.globalConfig.fetch(GLOBAL);
  const beforeN = await program.account.generationConfig.fetch(GEN);
  const before = {
    rpc: rpcHost(rpc),
    payer: payer.publicKey.toBase58(),
    execute,
    pauses: readPauses(beforeG),
    activeCreation: Boolean(beforeN.activeCreation),
    supportEnabled: Boolean(beforeN.supportEnabled),
    activeGenerationId: hex32(beforeG.activeGenerationId),
    securityDefaultsLocked: Boolean(beforeG.securityDefaultsLocked),
  };
  console.log(JSON.stringify({ before }, null, 2));

  if (!execute) {
    console.log("Dry-run only. Re-run with --execute to send set_pause_flags then set_generation_support(true, true).");
    return;
  }

  const pauseSig = await program.methods
    .setPauseFlags(TARGET_FLAGS)
    .accountsStrict({ globalConfig: GLOBAL, authority: payer.publicKey })
    .rpc();
  console.log("set_pause_flags", pauseSig);

  const genSig = await program.methods
    .setGenerationSupport(true, true)
    .accountsStrict({ authority: payer.publicKey, globalConfig: GLOBAL, generationConfig: GEN })
    .rpc();
  console.log("set_generation_support", genSig);

  const afterG = await program.account.globalConfig.fetch(GLOBAL);
  const afterN = await program.account.generationConfig.fetch(GEN);
  const after = {
    pauses: readPauses(afterG),
    activeCreation: Boolean(afterN.activeCreation),
    supportEnabled: Boolean(afterN.supportEnabled),
    activeGenerationId: hex32(afterG.activeGenerationId),
  };
  if (after.pauses.graduationPaused !== true || after.pauses.claimsPaused !== true) {
    throw new Error("REFUSING post-state: graduation or claims is not paused");
  }
  if (!after.activeCreation || !after.supportEnabled) {
    throw new Error("generation did not become activeCreation=true / supportEnabled=true");
  }
  console.log(JSON.stringify({ after, ok: true }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
