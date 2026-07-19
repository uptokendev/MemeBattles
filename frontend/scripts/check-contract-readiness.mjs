#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const requiredAbis = [
  "LaunchFactory",
  "LaunchCampaign",
  "LaunchToken",
  "GraduationOracle",
  "CreatorRegistry",
  "RiskRegistry",
  "TreasuryRouter",
  "RecruiterRewardsVault",
  "ProtocolRevenueVault",
  "CommunityRewardsVault",
  "TreasuryVaultV2",
  "UPVoteTreasury",
  "PermanentLpLocker",
];

const documentedEnv = [
  "VITE_ALLOWED_CHAIN_IDS",
  "VITE_DEFAULT_CHAIN_ID",
  "VITE_PUBLIC_RPC_97",
  "VITE_PUBLIC_RPC_56",
  "VITE_FACTORY_ADDRESS_97",
  "VITE_FACTORY_ADDRESS_56",
  "VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_97",
  "VITE_TREASURY_ROUTER_ADDRESS_97",
  "VITE_TREASURY_VAULT_ADDRESS_97",
  "VITE_RECRUITER_REWARDS_VAULT_ADDRESS_97",
  "VITE_COMMUNITY_REWARDS_VAULT_ADDRESS_97",
  "VITE_PROTOCOL_REVENUE_VAULT_ADDRESS_97",
  "VITE_CREATOR_REGISTRY_ADDRESS_97",
  "VITE_RISK_REGISTRY_ADDRESS_97",
  "VITE_GRADUATION_ORACLE_ADDRESS_97",
  "VITE_PERMANENT_LP_LOCKER_ADDRESS_97",
  "VITE_VOTE_TREASURY_ADDRESS_97",
  "VITE_TOPAZ_ROUTER_ADDRESS_97",
  "VITE_TOPAZ_FACTORY_ADDRESS_97",
  "VITE_TOPAZ_WBNB_ADDRESS_97",
];

const addressEnvNames = documentedEnv.filter((name) => name.endsWith("_ADDRESS_97") || name.endsWith("_ADDRESS_56"));
const envFiles = [".env", ".env.local", ".env.development", ".env.production"];

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function parseEnv(content) {
  const values = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    values.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, ""));
  }
  return values;
}

function fail(failures, message) {
  failures.push(message);
}

function checkAbis(failures) {
  for (const name of requiredAbis) {
    const file = path.join(frontendRoot, "src", "abi", `${name}.json`);
    if (!fs.existsSync(file)) {
      fail(failures, `Missing ABI ${path.relative(repoRoot, file)}. Run npm run compile:frontend-abis from the repo root.`);
      continue;
    }

    try {
      const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
      if (artifact.contractName && artifact.contractName !== name) {
        fail(failures, `${path.relative(repoRoot, file)} has contractName ${artifact.contractName}, expected ${name}.`);
      }
      if (!Array.isArray(artifact.abi) || artifact.abi.length === 0) {
        fail(failures, `${path.relative(repoRoot, file)} does not contain a non-empty abi array.`);
      }
    } catch (error) {
      fail(failures, `${path.relative(repoRoot, file)} is not valid JSON: ${error.message}`);
    }
  }
}

function checkEnvExample(failures) {
  const file = path.join(frontendRoot, ".env.example");
  const example = readIfExists(file);
  if (!example) {
    fail(failures, "frontend/.env.example is missing.");
    return;
  }

  for (const name of documentedEnv) {
    if (!example.includes(name)) fail(failures, `frontend/.env.example does not document ${name}.`);
  }

  for (const legacy of ["VITE_PANCAKE_ROUTER_ADDRESS", "VITE_PANCAKE_ROUTER_ADDRESS_97", "VITE_PANCAKE_ROUTER_ADDRESS_56"]) {
    if (example.includes(legacy)) fail(failures, `frontend/.env.example still references stale ${legacy}; use Topaz router envs.`);
  }
}

function checkLocalEnvFiles(failures, warnings) {
  for (const name of envFiles) {
    const file = path.join(frontendRoot, name);
    const content = readIfExists(file);
    if (!content) continue;

    const env = parseEnv(content);
    for (const key of addressEnvNames) {
      const value = env.get(key);
      if (value && !ADDRESS_RE.test(value)) {
        fail(failures, `${name}: ${key} must be a 20-byte 0x address when set.`);
      }
    }

    for (const legacy of ["VITE_PANCAKE_ROUTER_ADDRESS", "VITE_PANCAKE_ROUTER_ADDRESS_97", "VITE_PANCAKE_ROUTER_ADDRESS_56"]) {
      if (env.has(legacy)) fail(failures, `${name}: remove stale ${legacy}; use VITE_TOPAZ_ROUTER_ADDRESS_<chainId>.`);
    }
  }

  const localEnv = envFiles.some((name) => fs.existsSync(path.join(frontendRoot, name)));
  if (!localEnv) warnings.push("No frontend .env file found. That is fine before deployment; copy generated values after npm run frontend:env:bsc-testnet.");
}

const failures = [];
const warnings = [];

checkAbis(failures);
checkEnvExample(failures);
checkLocalEnvFiles(failures, warnings);

if (warnings.length) {
  console.warn("Frontend contract readiness warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
  console.warn("");
}

if (failures.length) {
  console.error("Frontend contract readiness check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Frontend contract readiness check passed.");
console.log("ABIs are synced, contract env names are documented, and local env address values are valid when present.");
