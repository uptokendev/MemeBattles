import fs from "node:fs";

const PLACEHOLDER_PROGRAM_ID = "Fg6PaFpoGXkYsidMpWxTWqjRZ6LkZXoC3XgXvAqUixG";
const REQUIRED_FILES = [
  "Anchor.toml",
  "programs/memewarzone_solana/src/lib.rs",
  "programs/mwz_rewards_treasury/src/lib.rs",
  "config/solana/mainnet-generation-v1.json",
  "scripts/solana/prepare-mainnet-deployment.mjs",
  "tests/solana/mainnet-protocol-verify.cjs",
];

function fail(message) {
  throw new Error(`[solana-mainnet-readiness] ${message}`);
}

function extract(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) fail(`${label} is missing`);
  return match[1];
}

for (const filePath of REQUIRED_FILES) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
}

const anchor = fs.readFileSync("Anchor.toml", "utf8");
const launchpad = fs.readFileSync("programs/memewarzone_solana/src/lib.rs", "utf8");
const rewards = fs.readFileSync("programs/mwz_rewards_treasury/src/lib.rs", "utf8");
const generationManifest = JSON.parse(fs.readFileSync("config/solana/mainnet-generation-v1.json", "utf8"));

const launchpadId = extract(launchpad, /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/, "launchpad declare_id!");
const rewardsId = extract(rewards, /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/, "rewards declare_id!");
const anchorLaunchpad = extract(anchor, /\[programs\.mainnet\][\s\S]*?memewarzone_solana\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/, "Anchor.toml mainnet launchpad");
const anchorRewards = extract(anchor, /\[programs\.mainnet\][\s\S]*?mwz_rewards_treasury\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/, "Anchor.toml mainnet rewards");

if (anchorLaunchpad !== launchpadId) fail(`Launchpad ID mismatch: Anchor.toml=${anchorLaunchpad} declare_id=${launchpadId}`);
if (anchorRewards !== rewardsId) fail(`Rewards ID mismatch: Anchor.toml=${anchorRewards} declare_id=${rewardsId}`);
if (launchpadId === PLACEHOLDER_PROGRAM_ID || rewardsId === PLACEHOLDER_PROGRAM_ID) fail("Placeholder program ID is not deployable to mainnet");
if (generationManifest.network !== "solana-mainnet-beta") fail("generation manifest network must be solana-mainnet-beta");
if (generationManifest.settings?.clusterKind !== 2) fail("generation manifest must use mainnet clusterKind=2");
if (generationManifest.settings?.allowedGraduationTierMask !== 14) fail("mainnet generation must enable only $15k/$30k/$50k (mask 14)");
if (generationManifest.settings?.activeCreation !== false) fail("activeCreation must stay false until staged activation");
for (const flag of ["paused", "createPaused", "buyPaused", "sellPaused", "graduationPaused", "claimsPaused"]) {
  if (generationManifest.pauseFlags?.[flag] !== true) fail(`pauseFlags.${flag} must be true for the initial mainnet generation`);
}
if (generationManifest.settings?.routeAuthorizationRequired !== true || generationManifest.settings?.authorizedTradingRequired !== true) {
  fail("canonical generation security requirements must remain enabled");
}

console.log(`Solana mainnet readiness passed for launchpad ${launchpadId}`);
console.log(`Rewards treasury ${rewardsId}`);
console.log(`Generation manifest: ${generationManifest.name}`);
