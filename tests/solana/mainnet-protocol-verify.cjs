"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_MANIFEST = path.join(ROOT, "config/solana/mainnet-generation-v1.json");
const DEFAULT_OUTPUT = path.join(ROOT, "deployments/solana-mainnet.protocol-state.json");

function fail(message) {
  throw new Error(`[solana-mainnet-verify] ${message}`);
}

function readText(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} not found: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function extract(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) fail(label);
  return match[1];
}

function parseArgs(argv) {
  const options = { manifest: DEFAULT_MANIFEST, output: DEFAULT_OUTPUT };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--manifest") options.manifest = argv[++index];
    else if (value === "--output") options.output = argv[++index];
    else fail(`Unknown argument: ${value}`);
  }
  return options;
}

const options = parseArgs(process.argv);
const manifest = JSON.parse(readText(options.manifest, "generation manifest"));
const anchor = readText(path.join(ROOT, "Anchor.toml"), "Anchor.toml");
const launchpad = readText(path.join(ROOT, "programs/memewarzone_solana/src/lib.rs"), "launchpad source");
const rewards = readText(path.join(ROOT, "programs/mwz_rewards_treasury/src/lib.rs"), "rewards source");

const launchpadId = extract(launchpad, /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/, "launchpad declare_id!");
const rewardsId = extract(rewards, /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/, "rewards declare_id!");
const anchorLaunchpad = extract(anchor, /\[programs\.mainnet\][\s\S]*?memewarzone_solana\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/, "Anchor mainnet launchpad");
const anchorRewards = extract(anchor, /\[programs\.mainnet\][\s\S]*?mwz_rewards_treasury\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/, "Anchor mainnet rewards");

assert.equal(manifest.network, "solana-mainnet-beta");
assert.equal(manifest.settings.clusterKind, 2);
assert.equal(manifest.settings.allowedGraduationTierMask, 14);
assert.equal(manifest.settings.activeCreation, false);
assert.equal(anchorLaunchpad, launchpadId);
assert.equal(anchorRewards, rewardsId);
for (const flag of ["paused", "createPaused", "buyPaused", "sellPaused", "graduationPaused", "claimsPaused"]) {
  assert.equal(manifest.pauseFlags[flag], true, flag);
}

const state = {
  verifiedAt: new Date().toISOString(),
  cluster: "mainnet-beta",
  launchpadProgramId: launchpadId,
  rewardsTreasuryProgramId: rewardsId,
  manifest: manifest.name,
  launchpadSourceHash: crypto.createHash("sha256").update(launchpad).digest("hex"),
  rewardsSourceHash: crypto.createHash("sha256").update(rewards).digest("hex"),
  pauseFlags: manifest.pauseFlags,
  broadcast: false,
};

fs.mkdirSync(path.dirname(options.output), { recursive: true });
fs.writeFileSync(options.output, `${JSON.stringify(state, null, 2)}\n`);
console.log(JSON.stringify(state, null, 2));
console.log(`Saved ${options.output}`);
