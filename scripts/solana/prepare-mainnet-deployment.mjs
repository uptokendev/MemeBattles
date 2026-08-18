#!/usr/bin/env node
/**
 * Mainnet-beta preflight. Validates source, Anchor mapping, and generation
 * manifest. Does not broadcast. Writes deployments/solana-mainnet.prepared.json.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function fail(message) {
  throw new Error(`[solana-mainnet-prepare] ${message}`);
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function extractProgramId(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) fail(`Unable to read ${label}`);
  return match[1];
}

function parseArgs(argv) {
  const options = {
    manifest: "config/solana/mainnet-generation-v1.json",
    output: "deployments/solana-mainnet.prepared.json",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--manifest") options.manifest = argv[++index];
    else if (value === "--output") options.output = argv[++index];
    else if (value === "--rpc-url") options.rpcUrl = argv[++index];
    else fail(`Unknown argument: ${value}`);
  }
  return options;
}

const options = parseArgs(process.argv);
const rpc = options.rpcUrl || requiredEnv("SOLANA_RPC");
if (/devnet|testnet/i.test(rpc)) fail("SOLANA_RPC looks like a non-mainnet endpoint");

const launchpadId = requiredEnv("SOLANA_LAUNCHPAD_PROGRAM_ID");
const rewardsId = requiredEnv("SOLANA_REWARDS_TREASURY_PROGRAM_ID");
const libSource = readText("programs/memewarzone_solana/src/lib.rs");
const rewardsSource = readText("programs/mwz_rewards_treasury/src/lib.rs");
const anchorSource = readText("Anchor.toml");
const manifest = JSON.parse(readText(options.manifest));

const declaredLaunchpad = extractProgramId(libSource, /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/, "launchpad declare_id!");
const declaredRewards = extractProgramId(rewardsSource, /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/, "rewards declare_id!");
const anchorLaunchpad = extractProgramId(anchorSource, /\[programs\.mainnet\][\s\S]*?memewarzone_solana\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/, "Anchor mainnet launchpad");
const anchorRewards = extractProgramId(anchorSource, /\[programs\.mainnet\][\s\S]*?mwz_rewards_treasury\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/, "Anchor mainnet rewards");

if (declaredLaunchpad !== launchpadId) fail(`declare_id! is ${declaredLaunchpad}, expected ${launchpadId}`);
if (declaredRewards !== rewardsId) fail(`rewards declare_id! is ${declaredRewards}, expected ${rewardsId}`);
if (anchorLaunchpad !== launchpadId) fail(`Anchor.toml mainnet launchpad is ${anchorLaunchpad}, expected ${launchpadId}`);
if (anchorRewards !== rewardsId) fail(`Anchor.toml mainnet rewards is ${anchorRewards}, expected ${rewardsId}`);
if (manifest.network !== "solana-mainnet-beta") fail(`${options.manifest} network must be solana-mainnet-beta`);
if (manifest.settings?.clusterKind !== 2) fail("clusterKind must be 2");
if (manifest.settings?.allowedGraduationTierMask !== 14) fail("allowedGraduationTierMask must be 14");
if (manifest.settings?.activeCreation !== false) fail("activeCreation must remain false in the prepared manifest");

const output = {
  cluster: "mainnet-beta",
  preparedAt: new Date().toISOString(),
  rpc,
  launchpadProgramId: launchpadId,
  rewardsTreasuryProgramId: rewardsId,
  manifestPath: options.manifest,
  manifestName: manifest.name,
  launchpadSourceHash: crypto.createHash("sha256").update(libSource).digest("hex"),
  rewardsSourceHash: crypto.createHash("sha256").update(rewardsSource).digest("hex"),
  pauseFlags: manifest.pauseFlags,
};

const outFile = path.resolve(options.output);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
console.log(`Saved ${outFile}`);
