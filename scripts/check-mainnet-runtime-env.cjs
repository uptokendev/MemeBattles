#!/usr/bin/env node
/**
 * Fail-closed checks for a 56 + Solana 101 production runtime.
 * Usage: node scripts/check-mainnet-runtime-env.cjs [all|indexer|frontend]
 */
const TARGET = String(process.argv[2] || "all").toLowerCase();

const errors = [];
const warnings = [];

function raw(name) {
  return String(process.env[name] || "").trim();
}

function requireEnv(name, extra = "") {
  if (!raw(name)) errors.push(`${name}: required for mainnet${extra ? ` (${extra})` : ""}`);
}

function forbidTruthy(name, reason) {
  const value = raw(name).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) errors.push(`${name}: ${reason}`);
}

function requireNotTestnetRpc(name) {
  const value = raw(name).toLowerCase();
  if (!value) return;
  if (/(?:testnet|prebsc|chapel|devnet)/.test(value)) {
    errors.push(`${name}: looks like a testnet/devnet RPC`);
  }
}

if (TARGET === "all" || TARGET === "frontend") {
  if (raw("VITE_DEFAULT_CHAIN_ID") && raw("VITE_DEFAULT_CHAIN_ID") !== "56") {
    errors.push("VITE_DEFAULT_CHAIN_ID: must be 56 for mainnet frontend");
  }
  if (raw("VITE_SOLANA_REWARD_CHAIN_ID") && raw("VITE_SOLANA_REWARD_CHAIN_ID") !== "101") {
    errors.push("VITE_SOLANA_REWARD_CHAIN_ID: production must stay on 101");
  }
  forbidTruthy("VITE_ENABLE_SOLANA_DEVNET_REWARDS", "must stay false on mainnet");
  forbidTruthy("VITE_ENABLE_TEST_GRADUATION_THRESHOLD", "test graduation must stay off on mainnet");
  requireNotTestnetRpc("VITE_PUBLIC_RPC_56");
  requireNotTestnetRpc("VITE_SOLANA_MAINNET_RPC");
  requireNotTestnetRpc("VITE_PUBLIC_RPC_101");
}

if (TARGET === "all" || TARGET === "indexer") {
  requireEnv("DATABASE_URL");
  requireEnv("BSC_RPC_HTTP_56", "paid chain-56 RPC");
  requireNotTestnetRpc("BSC_RPC_HTTP_56");
  requireNotTestnetRpc("SOLANA_RPC_HTTP");
  requireNotTestnetRpc("SOLANA_RPC_URL_101");
  if (raw("DEFAULT_EVM_CHAIN_ID") && raw("DEFAULT_EVM_CHAIN_ID") !== "56") {
    errors.push("DEFAULT_EVM_CHAIN_ID: must be 56 for mainnet indexer");
  }
  if (raw("DEPLOYMENT_NETWORK") && raw("DEPLOYMENT_NETWORK").toLowerCase() !== "mainnet") {
    errors.push("DEPLOYMENT_NETWORK: must be mainnet");
  }
}

console.log(`[mainnet-env] target=${TARGET}`);
for (const warning of warnings) console.warn(`[mainnet-env] WARN ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`[mainnet-env] ERROR ${error}`);
  process.exit(1);
}
console.log("[mainnet-env] OK");
