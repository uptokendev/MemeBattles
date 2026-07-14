#!/usr/bin/env node
require("dotenv").config();

const TARGET = process.argv[2] || process.env.HARDHAT_NETWORK || "hardhat";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_RE = /^(0x)?[a-fA-F0-9]{64}$/;

const ROUTER_ENVS = ["TOPAZ_ROUTER", "TOPAZ_V2_ROUTER", "ROUTER_ADDRESS", "PANCAKE_ROUTER", "PANCAKE_V2_ROUTER"];
const PRICE_ENVS = ["GRADUATION_ORACLE_ADDRESS", "BNB_USD_PRICE_FEED", "NATIVE_USD_PRICE_FEED", "GRADUATION_PRICE_FEED"];

const errors = [];
const warnings = [];

function raw(name) {
  return (process.env[name] || "").trim();
}

function hasAny(names) {
  return names.some((name) => raw(name));
}

function requireEnv(name, message) {
  if (!raw(name)) errors.push(`${name}: ${message || "missing"}`);
}

function checkAddress(name, required = false) {
  const value = raw(name);
  if (!value) {
    if (required) errors.push(`${name}: missing address`);
    return;
  }
  if (!ADDRESS_RE.test(value)) errors.push(`${name}: expected 20-byte 0x address`);
}

function checkPrivateKey(name, required = false) {
  const value = raw(name);
  if (!value) {
    if (required) errors.push(`${name}: missing private key`);
    return;
  }
  if (!PRIVATE_KEY_RE.test(value)) errors.push(`${name}: expected 32-byte hex private key`);
}

function checkBool(name) {
  const value = raw(name).toLowerCase();
  if (!value) return;
  if (!["1", "0", "true", "false", "yes", "no", "on", "off"].includes(value)) {
    errors.push(`${name}: expected boolean value`);
  }
}

function checkRouteProfile(name) {
  const value = raw(name);
  if (!value) return;
  if (!["0", "1", "2"].includes(value)) errors.push(`${name}: expected 0, 1, or 2`);
}

function checkBigInt(name) {
  const value = raw(name);
  if (!value) return;
  try {
    if (BigInt(value) < 0n) errors.push(`${name}: expected non-negative integer`);
  } catch {
    errors.push(`${name}: expected integer`);
  }
}

function firstConfigured(names) {
  return names.find((name) => raw(name));
}

function checkCommon() {
  checkAddress("TREASURY_SAFE", TARGET !== "hardhat");
  checkAddress("ROUTE_AUTHORITY_ADDRESS");
  checkPrivateKey("ROUTE_AUTHORITY_PRIVATE_KEY");
  checkRouteProfile("PHASE1_TRADE_ROUTE_PROFILE");
  checkRouteProfile("PHASE1_FINALIZE_ROUTE_PROFILE");

  checkAddress("LEAGUE_PAYOUT_OPERATOR");
  checkAddress("LEAGUE_ROOT_POSTER");
  checkAddress("RECRUITER_PAYOUT_OPERATOR");

  [
    "LEAGUE_PAYOUT_MAX_PER_TX",
    "LEAGUE_PAYOUT_DAILY_CAP",
    "LEAGUE_CLAIM_MAX_PER_TX",
    "LEAGUE_CLAIM_MAX_EPOCH_TOTAL",
    "RECRUITER_PAYOUT_MAX_PER_TX",
    "RECRUITER_PAYOUT_DAILY_CAP",
  ].forEach(checkBigInt);

  ["ENABLE_LEAGUE_PAYOUTS", "ENABLE_LEAGUE_CLAIMS", "ENABLE_RECRUITER_PAYOUTS", "DEPLOY_MOCK_PRICE_FEED"].forEach(checkBool);

  if (!raw("ROUTE_AUTHORITY_ADDRESS") && !raw("ROUTE_AUTHORITY_PRIVATE_KEY")) {
    warnings.push("ROUTE_AUTHORITY_ADDRESS is not set; route-authorized launches/trades will be unavailable until set on-chain.");
  }
}

function checkLocal() {
  checkCommon();
  if (!raw("TREASURY_SAFE")) warnings.push("TREASURY_SAFE is unset; local deploy will fall back to the deployer address.");
  if (!hasAny(ROUTER_ENVS)) warnings.push("No Topaz router configured; local deploy will use a mock router.");
  if (!hasAny(PRICE_ENVS)) warnings.push("No graduation oracle/price feed configured; local deploy will use a mock price feed.");
}

function checkBscTestnet() {
  requireEnv("BSC_TESTNET_RPC", "required for --network bscTestnet");
  checkPrivateKey("DEPLOYER_PK", true);
  checkCommon();
  checkAddress("TREASURY_SAFE", true);

  if (!hasAny(ROUTER_ENVS)) {
    errors.push(`Topaz router missing: set one of ${ROUTER_ENVS.join(", ")}`);
  }
  if (!hasAny(PRICE_ENVS)) {
    errors.push(`Graduation oracle/price feed missing: set one of ${PRICE_ENVS.join(", ")}`);
  }

  for (const name of ROUTER_ENVS) checkAddress(name);
  for (const name of PRICE_ENVS) checkAddress(name);

  if (!raw("ROUTE_AUTHORITY_ADDRESS") && !raw("ROUTE_AUTHORITY_PRIVATE_KEY")) {
    errors.push("ROUTE_AUTHORITY_ADDRESS or ROUTE_AUTHORITY_PRIVATE_KEY is required for testnet rollout");
  }

  if (raw("DEPLOY_MOCK_TOPAZ_ROUTER") || raw("DEPLOY_MOCK_ROUTER")) {
    warnings.push("Mock Topaz router env is set. Do not use mock routers for bscTestnet deployment.");
  }
}

if (TARGET === "bscTestnet") checkBscTestnet();
else checkLocal();

console.log(`[deploy-env] target=${TARGET}`);
console.log(`[deploy-env] router=${firstConfigured(ROUTER_ENVS) || "unset"}`);
console.log(`[deploy-env] graduation=${firstConfigured(PRICE_ENVS) || "unset"}`);
console.log(`[deploy-env] treasurySafe=${raw("TREASURY_SAFE") || "fallback/deployer"}`);
console.log(`[deploy-env] routeAuthority=${raw("ROUTE_AUTHORITY_ADDRESS") || (raw("ROUTE_AUTHORITY_PRIVATE_KEY") ? "private-key-derived" : "unset")}`);

for (const warning of warnings) console.warn(`[deploy-env] warning: ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`[deploy-env] error: ${error}`);
  process.exitCode = 1;
} else {
  console.log("[deploy-env] OK");
}
