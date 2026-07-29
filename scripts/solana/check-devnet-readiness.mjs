import fs from "node:fs";
import process from "node:process";

const PLACEHOLDER_PROGRAM_ID = "Fg6PaFpoGXkYsidMpWxTWqjRZ6LkZXoC3XgXvAqUixG";
const REQUIRED_FILES = [
  "Anchor.toml",
  "programs/memewarzone_solana/src/lib.rs",
  "scripts/solana/prepare-devnet-deployment.mjs",
  "docs/solana-devnet-deployment-runbook.md",
];

function fail(message) {
  throw new Error(`[solana-devnet-readiness] ${message}`);
}

for (const filePath of REQUIRED_FILES) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
}

const anchor = fs.readFileSync("Anchor.toml", "utf8");
const program = fs.readFileSync("programs/memewarzone_solana/src/lib.rs", "utf8");
const anchorMatch = anchor.match(/\[programs\.devnet\][\s\S]*?memewarzone_solana\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/);
const programMatch = program.match(/declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/);

if (!anchorMatch) fail("Anchor.toml devnet program ID is missing");
if (!programMatch) fail("declare_id! program ID is missing");
if (anchorMatch[1] !== programMatch[1]) {
  fail(`Program ID mismatch: Anchor.toml=${anchorMatch[1]} declare_id=${programMatch[1]}`);
}

const allowPlaceholder = process.argv.includes("--allow-placeholder");
if (!allowPlaceholder && programMatch[1] === PLACEHOLDER_PROGRAM_ID) {
  fail("Placeholder program ID is still active. This branch is not deployable to devnet yet.");
}

console.log(`Solana devnet readiness passed for program ${programMatch[1]}`);
console.log(`Placeholder allowed: ${allowPlaceholder}`);
