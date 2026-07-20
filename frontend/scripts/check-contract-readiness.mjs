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

const requiredRegistryKeys = [
  "launchFactory",
  "launchCampaignImplementation",
  "treasuryRouter",
  "treasuryVault",
  "recruiterRewardsVault",
  "communityRewardsVault",
  "protocolRevenueVault",
  "creatorRegistry",
  "riskRegistry",
  "graduationOracle",
  "permanentLpLocker",
  "voteTreasury",
  "topazRouter",
  "topazFactory",
  "topazWbnb",
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
  "VITE_ENABLE_DIRECT_BNB_DEPLOY",
];

const addressEnvNames = documentedEnv.filter((name) => /_ADDRESS_(56|97)$/.test(name) || /^VITE_TOPAZ_FACTORY_ADDRESS_(56|97)$/.test(name));
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

function checkContractRegistry(failures) {
  const file = path.join(frontendRoot, "src", "lib", "bnbContracts.ts");
  const source = readIfExists(file);
  if (!source) {
    fail(failures, "frontend/src/lib/bnbContracts.ts is missing.");
    return;
  }

  for (const name of requiredAbis) {
    if (!source.includes(`@/abi/${name}.json`)) {
      fail(failures, `frontend/src/lib/bnbContracts.ts does not import ${name}.json.`);
    }
  }

  for (const key of requiredRegistryKeys) {
    if (!source.includes(key)) {
      fail(failures, `frontend/src/lib/bnbContracts.ts does not expose ${key}.`);
    }
  }

  for (const name of documentedEnv.filter((envName) => envName.startsWith("VITE_") && envName.includes("ADDRESS_97"))) {
    const prefix = name.replace(/_97$/, "");
    if (!source.includes(prefix)) {
      fail(failures, `frontend/src/lib/bnbContracts.ts does not read ${prefix}_<chainId>.`);
    }
  }
}

function checkLaunchpadIntegration(failures) {
  const launchpadClient = readIfExists(path.join(frontendRoot, "src", "lib", "launchpadClient.ts"));
  if (!launchpadClient) {
    fail(failures, "frontend/src/lib/launchpadClient.ts is missing.");
  } else {
    for (const expected of [
      "@/lib/bnbContracts",
      "bnbContractAbis",
      "getBnbContractAddresses",
      "getBnbContractReadiness",
      "extractCreatedCampaign",
      "CampaignCreated",
      "contractReadiness: bnbReadiness",
    ]) {
      if (!launchpadClient.includes(expected)) fail(failures, `launchpadClient.ts missing ${expected}.`);
    }
  }

  const createPage = readIfExists(path.join(frontendRoot, "src", "pages", "Create.tsx"));
  if (!createPage) {
    fail(failures, "frontend/src/pages/Create.tsx is missing.");
  } else {
    for (const expected of [
      "VITE_ENABLE_DIRECT_BNB_DEPLOY",
      "directDeployRouteReady",
      "launchpad.createCampaign",
      "campaignAddress",
      "Deploy Coin",
    ]) {
      if (!createPage.includes(expected)) fail(failures, `Create.tsx missing ${expected}.`);
    }
  }
}

function checkBnbEnvDrill(failures) {
  const drillFile = path.join(frontendRoot, "scripts", "check-bnb-contract-env.mjs");
  const drill = readIfExists(drillFile);
  if (!drill) {
    fail(failures, "frontend/scripts/check-bnb-contract-env.mjs is missing.");
    return;
  }

  for (const expected of [
    "--strict",
    "--rpc",
    "CHECK_BNB_CONTRACT_ENV_STRICT",
    "CHECK_BNB_CONTRACT_RPC",
    "VITE_TOPAZ_ROUTER_ADDRESS",
    "VITE_TOPAZ_FACTORY_ADDRESS",
    "VITE_TOPAZ_WBNB_ADDRESS",
    "campaignsCount",
    "Partial BNB contract env detected",
    "frontend:apply-env:bsc-testnet",
  ]) {
    if (!drill.includes(expected)) fail(failures, `check-bnb-contract-env.mjs missing ${expected}.`);
  }

  const frontendPackage = readIfExists(path.join(frontendRoot, "package.json"));
  if (!frontendPackage.includes("check:bnb-contract-env")) {
    fail(failures, "frontend/package.json missing check:bnb-contract-env script.");
  }

  const rootPackage = readIfExists(path.join(repoRoot, "package.json"));
  if (!rootPackage.includes("frontend:check:bnb-contract-env")) {
    fail(failures, "package.json missing frontend:check:bnb-contract-env script.");
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
checkContractRegistry(failures);
checkLaunchpadIntegration(failures);
checkBnbEnvDrill(failures);
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
console.log("ABIs are synced, the BNB contract registry is wired, direct deploy is gated, the BNB env drill is available, contract env names are documented, and local env address values are valid when present.");
