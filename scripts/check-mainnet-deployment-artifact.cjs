#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const file = process.env.DEPLOYMENT_FILE || path.join(__dirname, "..", "deployments", "bscMainnet.json");
if (!fs.existsSync(file)) {
  console.log(`[mainnet-artifact] SKIP ${file} does not exist yet (expected before first deploy)`);
  process.exit(0);
}

const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];
if (Number(deployment.chainId) !== 56) errors.push(`chainId must be 56, got ${deployment.chainId}`);
if (String(deployment.network || deployment.networkName || "") && !/mainnet|bscMainnet/i.test(String(deployment.network || deployment.networkName))) {
  errors.push(`network label looks wrong: ${deployment.network || deployment.networkName}`);
}
const serialized = JSON.stringify(deployment).toLowerCase();
if (serialized.includes("0x4e7af54d355684ef206dab0b5dca8695d1e75da2")) {
  errors.push("artifact contains known BSC testnet WBNB");
}
if (errors.length) {
  for (const error of errors) console.error(`[mainnet-artifact] ERROR ${error}`);
  process.exit(1);
}
console.log(`[mainnet-artifact] OK ${file}`);
