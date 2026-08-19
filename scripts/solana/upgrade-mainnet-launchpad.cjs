#!/usr/bin/env node
/**
 * Upgrade the EXISTING mainnet launchpad in place (same program id).
 * Does not migrate accounts or change PDAs.
 *
 * Dry-run:
 *   SOLANA_RPC="https://mainnet.helius-rpc.com/?api-key=..." \
 *   SOLANA_PROTOCOL_AUTHORITY_KEYPAIR=/home/patrick/.config/memewarzone/solana-mainnet-deployer.json \
 *   node scripts/solana/upgrade-mainnet-launchpad.cjs
 *
 * Execute:
 *   ... node scripts/solana/upgrade-mainnet-launchpad.cjs --execute
 *
 * After upgrade, print hashes and paste SOLANA_LAUNCHPAD_PROGRAM_SHA256 into Coolify/Railway:
 *   node tests/solana/print-railway-create-auth-env.cjs
 */
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Connection, Keypair, PublicKey } = require(path.resolve(__dirname, "../../tests/solana/node_modules/@solana/web3.js"));

const ROOT = path.resolve(__dirname, "../..");
const SO_PATH = path.join(ROOT, "target/deploy/memewarzone_solana.so");
const EXPECTED_PROGRAM = "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt";
const EXPECTED_PAYER = "9YN7WY8svWoeNgegS2oq7uNDyrdcfg9UDUQR7tWpeF8H";
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
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
  if (!fs.existsSync(SO_PATH)) {
    throw new Error(`Missing ${SO_PATH}. Run: anchor build`);
  }

  const connection = new Connection(rpc, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== MAINNET_GENESIS) throw new Error(`Refusing non-mainnet genesis ${genesis}`);

  const programId = new PublicKey(EXPECTED_PROGRAM);
  const info = await connection.getAccountInfo(programId, "confirmed");
  if (!info || !info.executable) throw new Error("Launchpad program account missing or not executable");
  if (info.owner.toBase58() !== "BPFLoaderUpgradeab1e11111111111111111111111") {
    throw new Error(`Program is not upgradeable (owner ${info.owner.toBase58()})`);
  }

  const so = fs.readFileSync(SO_PATH);
  const programSha256 = crypto.createHash("sha256").update(so).digest("hex");
  console.log(JSON.stringify({
    execute,
    programId: EXPECTED_PROGRAM,
    upgradeAuthority: payer.publicKey.toBase58(),
    binaryBytes: so.length,
    programSha256,
    note: "Same program id = in-place upgrade. Global/generation/campaign PDAs stay put.",
  }, null, 2));

  if (!execute) {
    console.log("Dry-run only. Re-run with --execute after reviewing the binary hash.");
    return;
  }

  execFileSync(
    "solana",
    [
      "program",
      "deploy",
      SO_PATH,
      "--program-id",
      EXPECTED_PROGRAM,
      "--upgrade-authority",
      keypairPath,
      "--url",
      rpc,
      "--keypair",
      keypairPath,
    ],
    { stdio: "inherit" },
  );

  console.log(JSON.stringify({
    upgraded: true,
    programId: EXPECTED_PROGRAM,
    programSha256,
    next: [
      "Set Coolify/Railway SOLANA_LAUNCHPAD_PROGRAM_SHA256 to the hash above",
      "IDL hash is unchanged if accounts/args did not change",
      "Retry Push Live — Phantom warning should disappear once simulation succeeds",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
