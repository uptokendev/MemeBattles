import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import * as web3 from "@solana/web3.js";
import { loadSolanaV0Module } from "./load-solana-v0-module.mjs";

function parseArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

async function main() {
  const json = process.argv.includes("--json");
  const requireAlt = process.argv.includes("--require-alt");
  const v0 = await loadSolanaV0Module();
  const plan = v0.buildLaunchpadAltPlan(web3);
  const altAddress = parseArg("--alt") || v0.configuredLaunchpadAltAddress();
  const rpcUrl = parseArg("--rpc") || String(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();

  const output = {
    programId: v0.SOLANA_LAUNCHPAD_PROGRAM_ID,
    rewardsTreasuryProgramId: v0.SOLANA_REWARDS_TREASURY_PROGRAM_ID,
    requiredAddresses: Object.fromEntries(plan.map((entry) => [entry.label, entry.address.toBase58()])),
    altConfigured: Boolean(altAddress),
    verification: null,
  };

  if (altAddress) {
    const connection = new Connection(rpcUrl, "confirmed");
    const table = await v0.fetchAndVerifyLaunchpadLookupTable(web3, connection, {
      address: altAddress,
      requiredAddresses: plan.map((entry) => entry.address),
    });
    output.verification = {
      address: new PublicKey(altAddress).toBase58(),
      authority: table.state.authority?.toBase58?.() || null,
      addressCount: table.state.addresses.length,
      requiredAddressCount: plan.length,
      missing: [],
    };
  } else if (requireAlt) {
    throw new Error("SOLANA_LAUNCHPAD_ALT_ADDRESS is required for this check");
  }

  if (json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`[solana-launchpad-alt] required=${plan.length} alt=${altAddress || "not-configured"}`);
    for (const entry of plan) console.log(`${entry.label}=${entry.address.toBase58()}`);
    if (output.verification) console.log("ALT_VERIFICATION=PASS", output.verification);
    else console.log("ALT_VERIFICATION=SKIPPED (no SOLANA_LAUNCHPAD_ALT_ADDRESS configured)");
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
