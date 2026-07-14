#!/usr/bin/env node
require("dotenv").config();

const TARGET = process.argv[2] || process.env.HARDHAT_NETWORK || "hardhat";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_RE = /^(0x)?[a-fA-F0-9]{64}$/;

const ROUTER_ENVS = ["TOPAZ_ROUTER", "TOPAZ_V2_ROUTER", "ROUTER_ADDRESS", "PANCAKE_ROUTER", "PANCAKE_V2_ROUTER"];
const PRICE_ENVS = ["GRADUATION_ORACLE_ADDRESS", "BNB_USD_PRICE_FEED", "NATIVE_USD_PRICE_FEED", "GRADUATION_PRICE_FEED"];
const REAL_NETWORK_ADMIN_ENVS = [
  "TREASURY_SAFE",
  "ROUTE_AUTHORITY_ADDRESS",
  "LEAGUE_PAYOUT_OPERATOR",
  "LEAGUE_ROOT_POSTER",
  "RECRUITER_PAYOUT_OPERATOR",
];
const MOCK_FLAG_ENVS = ["DEPLOY_MOCK_TOPAZ_ROUTER", "DEPLOY_MOCK_ROUTER", "DEPLOY_MOCK_PRICE_FEED"];
const KNOWN_LOCAL_ADDRESSES = new Set([
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
]);
const KNOWN_LOCAL_PRIVATE_KEYS = new Set([
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "59c6995e998f97a5a0044966f0945389d8f4e2145e3ea535c9ea6d1cfef39d4",
  "5de4111a2f57843d4a54c1c7d2254141e70cdb4c5b4bc7d22477d90b4f0ad7a3",
]);

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

function normalizePrivateKey(value) {
  return value.toLowerCase().replace(/^0x/, "");
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

function checkNotLocalAddress(name) {
  const value = raw(name);
  if (!value || !ADDRESS_RE.test(value)) return;
  if (KNOWN_LOCAL_ADDRESSES.has(value.toLowerCase())) {
    errors.push(`${name}: uses a default Hardhat local account; set a real testnet-controlled address`);
  }
}

function checkNotLocalPrivateKey(name) {
  const value = raw(name);
  if (!value || !PRIVATE_KEY_RE.test(value)) return;
  if (KNOWN_LOCAL_PRIVATE_KEYS.has(normalizePrivateKey(value))) {
    errors.push(`${name}: uses a default Hardhat local private key; set a real funded testnet deployer key`);
  }
}

function isTruthyEnv(name) {
  const value = raw(name).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
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
    "GRADUATION_ORACLE_MAX_PRICE_AGE_SECONDS",
    "LEAGUE_PAYOUT_MAX_PER_TX",
    "LEAGUE_PAYOUT_DAILY_CAP",
    "LEAGUE_CLAIM_MAX_PER_TX",
    "LEAGUE_CLAIM_MAX_EPOCH_TOTAL",
    "RECRUITER_PAYOUT_MAX_PER_TX",
    "RECRUITER_PAYOUT_DAILY_CAP",
  ].forEach(checkBigInt);

  ["ENABLE_LEAGUE_PAYOUTS", "ENABLE_LEAGUE_CLAIMS", "ENABLE_RECRUITER_PAYOUTS", ...MOCK_FLAG_ENVS].forEach(checkBool);

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
  checkNotLocalPrivateKey("DEPLOYER_PK");
  checkNotLocalPrivateKey("ROUTE_AUTHORITY_PRIVATE_KEY");
  REAL_NETWORK_ADMIN_ENVS.forEach(checkNotLocalAddress);

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

  for (const name of MOCK_FLAG_ENVS) {
    if (isTruthyEnv(name)) errors.push(`${name}: mocks are only allowed for local hardhat rehearsal`);
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
