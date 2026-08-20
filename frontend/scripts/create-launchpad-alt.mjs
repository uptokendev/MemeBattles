import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import * as web3 from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { loadSolanaV0Module } from "./load-solana-v0-module.mjs";

function parseArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function loadKeypair(filePath) {
  const bytes = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function send(connection, payer, ixs) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: latest.blockhash,
  }).add(...ixs);
  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const confirmation = await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  if (confirmation.value.err) throw new Error(JSON.stringify(confirmation.value.err));
  return sig;
}

function printEnvAssignment(address) {
  console.log("");
  console.log("Coolify frontend (Vite-baked, then rebuild):");
  console.log("VITE_SOLANA_LAUNCHPAD_ALT_ADDRESS=" + address);
  console.log("GitHub Actions repository variable / operator scripts:");
  console.log("SOLANA_LAUNCHPAD_ALT_ADDRESS=" + address);
  console.log("Do not freeze this table until the static address list is final.");
  console.log("Do not reuse SOLANA_GRADUATION_ALT_ADDRESS unless it already contains every launchpad plan address.");
}

async function main() {
  const v0 = await loadSolanaV0Module();
  const rpc = String(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();
  const existing = parseArg("--alt") || v0.configuredLaunchpadAltAddress();
  const verifyOnly = process.argv.includes("--verify-only");
  const connection = new Connection(rpc, "confirmed");
  const plan = v0.buildLaunchpadAltPlan(web3);
  const required = plan.map((entry) => entry.address);

  let lookupTable;
  if (existing) {
    lookupTable = new PublicKey(existing);
    const current = await connection.getAddressLookupTable(lookupTable);
    if (!current.value) {
      throw new Error(`Solana launchpad ALT not found: ${lookupTable.toBase58()}`);
    }
    console.log("using existing launchpad ALT", lookupTable.toBase58());
  } else if (verifyOnly) {
    throw new Error("SOLANA_LAUNCHPAD_ALT_ADDRESS or --alt is required for --verify-only");
  } else {
    const keyPath = String(
      process.env.SOLANA_LAUNCHPAD_ALT_AUTHORITY ||
        path.join(process.env.HOME || "", ".config/memewarzone/solana-mainnet-deployer.json"),
    );
    const payer = loadKeypair(keyPath);
    const slot = await connection.getSlot("confirmed");
    const [createIx, created] = AddressLookupTableProgram.createLookupTable({
      authority: payer.publicKey,
      payer: payer.publicKey,
      recentSlot: Math.max(0, slot - 1),
    });
    lookupTable = created;
    console.log("creating launchpad ALT", lookupTable.toBase58());
    await send(connection, payer, [createIx]);
  }

  const loaded = await v0.fetchAndVerifyLaunchpadLookupTable(web3, connection, {
    address: lookupTable.toBase58(),
  });
  const present = new Set(loaded.state.addresses.map((address) => address.toBase58()));
  const missing = required.filter((address) => !present.has(address.toBase58()));

  if (missing.length && verifyOnly) {
    throw new Error(`Solana launchpad ALT is missing required addresses: ${missing.map((address) => address.toBase58()).join(", ")}`);
  }

  if (missing.length) {
    const keyPath = String(
      process.env.SOLANA_LAUNCHPAD_ALT_AUTHORITY ||
        path.join(process.env.HOME || "", ".config/memewarzone/solana-mainnet-deployer.json"),
    );
    const payer = loadKeypair(keyPath);
    const authority = loaded.state.authority?.toBase58?.() || "";
    if (authority !== payer.publicKey.toBase58()) {
      throw new Error(
        `Cannot extend launchpad ALT ${lookupTable.toBase58()}: authority ${authority || "none"} != ${payer.publicKey.toBase58()}`,
      );
    }
    console.log("extending launchpad ALT with", missing.length, "missing static addresses");
    for (let i = 0; i < missing.length; i += 20) {
      await send(connection, payer, [
        AddressLookupTableProgram.extendLookupTable({
          payer: payer.publicKey,
          authority: payer.publicKey,
          lookupTable,
          addresses: missing.slice(i, i + 20),
        }),
      ]);
    }
  }

  const verified = await v0.fetchAndVerifyLaunchpadLookupTable(web3, connection, {
    address: lookupTable.toBase58(),
    requiredAddresses: required,
  });
  console.log("ALT_VERIFICATION=PASS", {
    address: lookupTable.toBase58(),
    authority: verified.state.authority?.toBase58?.() || null,
    addressCount: verified.state.addresses.length,
    requiredAddressCount: required.length,
  });
  printEnvAssignment(lookupTable.toBase58());
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
