#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const checks = [
  ["test", ["run", "test"]],
  ["size", ["run", "size"]],
  ["local deploy env", ["run", "deploy:check-env"]],
  ["bscTestnet deploy env", ["run", "deploy:check-env:bsc-testnet"]],
];

console.log("[pretestnet] Running readiness checks before any BSC testnet deploy.");

for (const [label, args] of checks) {
  console.log(`\n[pretestnet] ${label}`);
  const result = spawnSync(npmCmd, args, { stdio: "inherit" });

  if (result.error) {
    console.error(`[pretestnet] ${label} could not start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[pretestnet] ${label} failed. Stop before testnet deploy.`);
    process.exit(result.status || 1);
  }
}

console.log("\n[pretestnet] All readiness checks passed. BSC testnet deploy can be considered.");
