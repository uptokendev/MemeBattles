#!/usr/bin/env node

import "../api/load-local-env.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const CONTRACTS = [
  ["LaunchFactory", "VITE_FACTORY_ADDRESS", "launchFactory"],
  ["LaunchCampaign implementation", "VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS", "launchCampaignImplementation"],
  ["TreasuryRouter", "VITE_TREASURY_ROUTER_ADDRESS", "treasuryRouter"],
  ["TreasuryVaultV2", "VITE_TREASURY_VAULT_ADDRESS", "treasuryVault"],
  ["RecruiterRewardsVault", "VITE_RECRUITER_REWARDS_VAULT_ADDRESS", "recruiterRewardsVault"],
  ["CommunityRewardsVault", "VITE_COMMUNITY_REWARDS_VAULT_ADDRESS", "communityRewardsVault"],
  ["ProtocolRevenueVault", "VITE_PROTOCOL_REVENUE_VAULT_ADDRESS", "protocolRevenueVault"],
  ["CreatorRegistry", "VITE_CREATOR_REGISTRY_ADDRESS", "creatorRegistry"],
  ["RiskRegistry", "VITE_RISK_REGISTRY_ADDRESS", "riskRegistry"],
  ["GraduationOracle", "VITE_GRADUATION_ORACLE_ADDRESS", "graduationOracle"],
  ["PermanentLpLocker", "VITE_PERMANENT_LP_LOCKER_ADDRESS", "permanentLpLocker"],
  ["UPVoteTreasury", "VITE_VOTE_TREASURY_ADDRESS", "voteTreasury"],
  ["Topaz router", "VITE_TOPAZ_ROUTER_ADDRESS", "topazRouter"],
  ["Topaz pool factory", "VITE_TOPAZ_FACTORY_ADDRESS", "topazFactory"],
  ["Topaz WBNB", "VITE_TOPAZ_WBNB_ADDRESS", "topazWbnb"],
];

const ABI_FILES = [
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

function hasArg(name) {
  return process.argv.includes(name);
}

function truthy(value) {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

function explicitlyFalse(value) {
  return FALSE_VALUES.has(String(value || "").trim().toLowerCase());
}

function parseChainId() {
  const raw = process.argv.find((arg) => /^--chain=/.test(arg))?.split("=")[1]
    || process.env.CHECK_BNB_CHAIN_ID
    || process.env.VITE_DEFAULT_CHAIN_ID
    || "97";
  const chainId = Number(raw);
  if (chainId !== 56 && chainId !== 97) throw new Error(`Unsupported BNB chain id for drill: ${raw}`);
  return chainId;
}

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function readAddress(prefix, chainId) {
  return readEnv(`${prefix}_${chainId}`) || readEnv(prefix);
}

function normalizeRpcUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const first = value.split(",").map((part) => part.trim()).find(Boolean) || "";
  if (!first) return "";
  if (first.startsWith("https//")) return `https:${first.slice("https".length)}`;
  if (first.startsWith("http//")) return `http:${first.slice("http".length)}`;
  return first;
}

function getRpcUrl(chainId) {
  return normalizeRpcUrl(readEnv(`VITE_PUBLIC_RPC_${chainId}`))
    || normalizeRpcUrl(readEnv(`VITE_BSC_RPC_${chainId}`))
    || (chainId === 56
      ? normalizeRpcUrl(readEnv("VITE_BSC_MAINNET_RPC")) || "https://bsc-dataseed.binance.org/"
      : normalizeRpcUrl(readEnv("VITE_BSC_TESTNET_RPC")) || "https://data-seed-prebsc-1-s1.binance.org:8545/");
}

function loadAbi(name) {
  const file = path.join(frontendRoot, "src", "abi", `${name}.json`);
  const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(artifact.abi) || artifact.abi.length === 0) throw new Error(`${path.relative(repoRoot, file)} does not contain a non-empty abi array.`);
  return artifact.abi;
}

function checkAbiFiles(failures) {
  for (const name of ABI_FILES) {
    const file = path.join(frontendRoot, "src", "abi", `${name}.json`);
    if (!fs.existsSync(file)) {
      failures.push(`Missing ABI ${path.relative(repoRoot, file)}. Run npm run compile:frontend-abis from the repo root.`);
      continue;
    }

    try {
      loadAbi(name);
    } catch (error) {
      failures.push(error.message);
    }
  }
}

async function readContractCode(provider, item, failures) {
  const [label,, key, address] = item;
  if (!address) return;
  try {
    const code = await provider.getCode(address);
    if (!code || code === "0x") failures.push(`${label} (${key}) has no bytecode at ${address}.`);
  } catch (error) {
    failures.push(`${label} (${key}) code read failed at ${address}: ${error.message}`);
  }
}

async function readFactory(ethers, provider, factoryAddress, failures) {
  if (!factoryAddress) return;
  try {
    const factory = new ethers.Contract(factoryAddress, loadAbi("LaunchFactory"), provider);
    await factory.campaignsCount();
  } catch (error) {
    failures.push(`LaunchFactory campaignsCount() read failed at ${factoryAddress}: ${error.message}`);
  }
}

function printTable(items) {
  const width = Math.max(...items.map(([label]) => label.length), 12);
  for (const [label, prefix,, address] of items) {
    const marker = address ? "OK" : "MISS";
    console.log(`${marker.padEnd(4)} ${label.padEnd(width)} ${prefix} -> ${address || "unset"}`);
  }
}

function addPartialEnvWarning(items, warnings) {
  const configured = items.filter(([, , , address]) => Boolean(address));
  const missing = items.filter(([, , , address]) => !address);
  if (!configured.length || !missing.length) return;

  const configuredLabels = configured.map(([label]) => label).join(", ");
  warnings.unshift(
    `Partial BNB contract env detected: ${configured.length}/${items.length} configured (${configuredLabels}). Treat this as stale/pre-final wiring until npm run frontend:env:bsc-testnet and npm run frontend:apply-env:bsc-testnet have populated the full set.`,
  );
}

async function main() {
  const chainId = parseChainId();
  const strict = hasArg("--strict") || truthy(process.env.CHECK_BNB_CONTRACT_ENV_STRICT);
  const rpc = hasArg("--rpc") || truthy(process.env.CHECK_BNB_CONTRACT_RPC);
  const skipRpc = hasArg("--no-rpc") || explicitlyFalse(process.env.CHECK_BNB_CONTRACT_RPC);
  const failures = [];
  const warnings = [];

  checkAbiFiles(failures);

  const items = CONTRACTS.map(([label, prefix, key]) => [label, prefix, key, readAddress(prefix, chainId)]);
  for (const [label, prefix,, address] of items) {
    if (!address) {
      const msg = `${label}: set ${prefix}_${chainId}${prefix === "VITE_FACTORY_ADDRESS" || prefix === "VITE_TREASURY_VAULT_ADDRESS" || prefix === "VITE_VOTE_TREASURY_ADDRESS" ? ` or ${prefix}` : ""}.`;
      (strict ? failures : warnings).push(msg);
    } else if (!ADDRESS_RE.test(address)) {
      failures.push(`${label}: ${prefix}_${chainId} must be a 20-byte 0x address, got ${address}.`);
    }
  }

  addPartialEnvWarning(items, warnings);

  for (const legacy of ["VITE_PANCAKE_ROUTER_ADDRESS", "VITE_PANCAKE_ROUTER_ADDRESS_97", "VITE_PANCAKE_ROUTER_ADDRESS_56"]) {
    if (readEnv(legacy)) failures.push(`Remove stale ${legacy}; use VITE_TOPAZ_ROUTER_ADDRESS_${chainId}.`);
  }

  console.log(`BNB frontend contract env drill for chain ${chainId}`);
  console.log(`strict: ${strict ? "yes" : "no"}`);
  console.log(`rpc:    ${rpc && !skipRpc ? "yes" : "no"}`);
  console.log("");
  printTable(items);

  if (warnings.length) {
    console.warn("\nWarnings:");
    for (const warning of warnings) console.warn(`- ${warning}`);
  }

  if (rpc && !skipRpc && failures.length === 0) {
    const { ethers } = await import("ethers");
    const rpcUrl = getRpcUrl(chainId);
    console.log(`\nReading bytecode through ${rpcUrl}`);
    const network = ethers.Network.from(chainId);
    const provider = new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: network, batchMaxCount: 1, batchStallTime: 0 });
    await Promise.all(items.map((item) => readContractCode(provider, item, failures)));
    await readFactory(ethers, provider, items.find(([, , key]) => key === "launchFactory")?.[3], failures);
  }

  if (failures.length) {
    console.error("\nBNB frontend contract env drill failed.");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("\nBNB frontend contract env drill completed.");
  if (!strict && warnings.length) {
    console.log("Missing or partial addresses are expected before final BSC deployment. Re-run with --strict after npm run frontend:env:bsc-testnet creates final env values.");
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
