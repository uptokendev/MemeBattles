import {
  ComputeBudgetProgram,
  Connection,
  Ed25519Program,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt");
const REWARDS_TREASURY_PROGRAM_ID = new PublicKey("2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX");
const INSTRUCTIONS_SYSVAR = new PublicKey("Sysvar1nstructions1111111111111111111111111");

const REWARD_SEEDS = [
  ["weeklyLeagueVault", "league_vault"],
  ["airdropVault", "airdrop_vault"],
  ["monthlyLeagueVault", "monthly_league_vault"],
  ["recruiterVault", "recruiter_vault"],
  ["squadVault", "squad_vault"],
  ["protocolVault", "protocol_vault"],
];

export function buildLaunchpadAltPlan() {
  const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID);
  const rewardVaults = REWARD_SEEDS.map(([label, seed]) => {
    const [address] = PublicKey.findProgramAddressSync([Buffer.from(seed)], REWARDS_TREASURY_PROGRAM_ID);
    return { label, address };
  });

  const entries = [
    { label: "memewarzoneProgram", address: PROGRAM_ID },
    { label: "globalConfig", address: globalConfig },
    { label: "ed25519Program", address: Ed25519Program.programId },
    { label: "computeBudgetProgram", address: ComputeBudgetProgram.programId },
    { label: "instructionsSysvar", address: INSTRUCTIONS_SYSVAR },
    { label: "tokenProgram", address: TOKEN_PROGRAM_ID },
    { label: "associatedTokenProgram", address: ASSOCIATED_TOKEN_PROGRAM_ID },
    { label: "systemProgram", address: SystemProgram.programId },
    { label: "rewardsTreasuryProgram", address: REWARDS_TREASURY_PROGRAM_ID },
    ...rewardVaults,
  ];

  const extraRaw = String(process.env.SOLANA_LAUNCHPAD_ALT_EXTRA_ADDRESSES || "").trim();
  if (extraRaw) {
    for (const [index, raw] of extraRaw.split(",").map((value) => value.trim()).filter(Boolean).entries()) {
      entries.push({ label: `extra${index + 1}`, address: new PublicKey(raw) });
    }
  }

  const seen = new Set();
  for (const entry of entries) {
    const key = entry.address.toBase58();
    if (seen.has(key)) throw new Error(`duplicate ALT plan address: ${entry.label} ${key}`);
    seen.add(key);
  }
  return entries;
}

export async function verifyLaunchpadAlt({ address, rpcUrl }) {
  const plan = buildLaunchpadAltPlan();
  const connection = new Connection(rpcUrl, "confirmed");
  const lookupAddress = new PublicKey(address);
  const result = await connection.getAddressLookupTable(lookupAddress);
  const table = result.value;
  if (!table) throw new Error(`launchpad ALT not found: ${lookupAddress.toBase58()}`);
  if (typeof table.isActive === "function" && !table.isActive()) {
    throw new Error(`launchpad ALT is deactivated: ${lookupAddress.toBase58()}`);
  }

  const present = new Set(table.state.addresses.map((item) => item.toBase58()));
  const missing = plan.filter((entry) => !present.has(entry.address.toBase58()));
  if (missing.length) {
    throw new Error(
      `launchpad ALT is missing ${missing.length} required addresses: ` +
        missing.map((entry) => `${entry.label}=${entry.address.toBase58()}`).join(", "),
    );
  }
  return {
    address: lookupAddress.toBase58(),
    authority: table.state.authority?.toBase58?.() || null,
    addressCount: table.state.addresses.length,
    requiredAddressCount: plan.length,
    missing: [],
  };
}

function parseArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

async function main() {
  const json = process.argv.includes("--json");
  const requireAlt = process.argv.includes("--require-alt");
  const plan = buildLaunchpadAltPlan();
  const altAddress = parseArg("--alt") || String(process.env.SOLANA_LAUNCHPAD_ALT_ADDRESS || "").trim();
  const rpcUrl = parseArg("--rpc") || String(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();

  const output = {
    programId: PROGRAM_ID.toBase58(),
    rewardsTreasuryProgramId: REWARDS_TREASURY_PROGRAM_ID.toBase58(),
    requiredAddresses: Object.fromEntries(plan.map((entry) => [entry.label, entry.address.toBase58()])),
    altConfigured: Boolean(altAddress),
    verification: null,
  };

  if (altAddress) {
    output.verification = await verifyLaunchpadAlt({ address: altAddress, rpcUrl });
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
