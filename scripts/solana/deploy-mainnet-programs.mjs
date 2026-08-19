#!/usr/bin/env node
/**
 * Guarded Solana mainnet deploy entry.
 * Does not guess program IDs, RPCs, or keypairs. Prints the exact operator command.
 */
function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const programId = requiredEnv("SOLANA_LAUNCHPAD_PROGRAM_ID");
const rewardsProgramId = requiredEnv("SOLANA_REWARDS_TREASURY_PROGRAM_ID");
const rpc = requiredEnv("SOLANA_RPC");
const keypair = requiredEnv("SOLANA_PROTOCOL_AUTHORITY_KEYPAIR");
if (/devnet|testnet/i.test(rpc)) throw new Error("SOLANA_RPC looks like a non-mainnet endpoint");

console.log(JSON.stringify({
  ok: true,
  cluster: "mainnet-beta",
  rpc,
  launchpadProgramId: programId,
  rewardsTreasuryProgramId: rewardsProgramId,
  authorityKeypair: keypair,
  next: [
    `solana config set --url ${rpc}`,
    `anchor deploy --provider.cluster mainnet --program-name memewarzone_solana --program-keypair <launchpad-keypair.json>`,
    `anchor deploy --provider.cluster mainnet --program-name mwz_rewards_treasury --program-keypair <rewards-keypair.json>`,
  ],
}, null, 2));
