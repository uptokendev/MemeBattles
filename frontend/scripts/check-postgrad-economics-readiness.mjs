import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

const failures = [];
const creatorFee = read("src/features/postgrad/creatorFeeEconomics.ts");

function requireLine(expected, label) {
  if (!creatorFee.includes(expected)) failures.push(`${label}: missing ${expected}`);
}

requireLine("export const CREATOR_FEE_BPS = 10;", "creator fee bps");
requireLine('export const CREATOR_FEE_DISPLAY = "0.10%";', "creator fee display");
requireLine("accountingReady: false", "creator fee accounting readiness");
requireLine("claimsReady: false", "creator fee claims readiness");
requireLine("contractEventsReady: false", "creator fee contract-event readiness");

if (creatorFee.includes("claimsReady: true") || creatorFee.includes("accountingReady: true")) {
  failures.push("creator fee claims/accounting must remain disabled until DB accounting and contract-event reconciliation are implemented");
}

if (failures.length) {
  console.error("Postgrad economics readiness check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Postgrad economics readiness check passed.");
