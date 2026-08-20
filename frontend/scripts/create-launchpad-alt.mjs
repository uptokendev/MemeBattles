import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import * as web3 from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { loadSolanaV0Module } from "./load-solana-v0-module.mjs";

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

async function main() {
  const v0 = await loadSolanaV0Module();
  const rpc = String(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();
  const keyPath = String(
    process.env.SOLANA_LAUNCHPAD_ALT_AUTHORITY ||
      path.join(process.env.HOME || "", ".config/memewarzone/solana-mainnet-deployer.json"),
  );
  const payer = loadKeypair(keyPath);
  const connection = new Connection(rpc, "confirmed");
  const plan = v0.buildLaunchpadAltPlan(web3);
  const slot = await connection.getSlot("confirmed");
  const [createIx, lookupTable] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot - 1,
  });
  console.log("creating launchpad ALT", lookupTable.toBase58());
  await send(connection, payer, [createIx]);
  const addresses = plan.map((entry) => entry.address);
  for (let i = 0; i < addresses.length; i += 20) {
    const chunk = addresses.slice(i, i + 20);
    await send(connection, payer, [
      AddressLookupTableProgram.extendLookupTable({
        payer: payer.publicKey,
        authority: payer.publicKey,
        lookupTable,
        addresses: chunk,
      }),
    ]);
  }
  console.log("VITE_SOLANA_LAUNCHPAD_ALT_ADDRESS=" + lookupTable.toBase58());
  console.log("SOLANA_LAUNCHPAD_ALT_ADDRESS=" + lookupTable.toBase58());
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
