#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const defaultNpmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const spawnOptions = (stdio) => ({ stdio, shell: process.platform === "win32" });

const checks = [
  ["bscTestnet deploy env", ["run", "deploy:check-env:bsc-testnet"]],
  ["deployment wiring", ["run", "verify:deployment:bsc-testnet"]],
  ["route authority", ["run", "verify:route-authority:bsc-testnet"]],
  ["indexer schema", ["run", "indexer:schema"]],
  ["indexer manifest", ["run", "indexer:manifest:bsc-testnet"]],
  ["monitoring readiness", ["run", "monitor:readiness:bsc-testnet"]],
  ["monitoring snapshot", ["run", "monitor:snapshot:bsc-testnet"]],
];

function runTestnetAcceptance(options = {}) {
  const spawn = options.spawn || spawnSync;
  const npmCmd = options.npmCmd || defaultNpmCmd;
  const stdio = options.stdio || "inherit";

  console.log("[testnet-acceptance] Running BSC testnet post-deploy acceptance checks.");

  for (const [label, args] of checks) {
    console.log(`\n[testnet-acceptance] ${label}`);
    const result = spawn(npmCmd, args, spawnOptions(stdio));

    if (result.error) {
      const message = `[testnet-acceptance] ${label} could not start: ${result.error.message}`;
      console.error(message);
      return { ok: false, status: 1, label, message };
    }

    if (result.status !== 0) {
      const status = result.status || 1;
      const message = `[testnet-acceptance] ${label} failed. Stop testnet acceptance.`;
      console.error(message);
      return { ok: false, status, label, message };
    }
  }

  console.log("\n[testnet-acceptance] All BSC testnet acceptance checks passed.");
  return { ok: true, status: 0, label: "complete", message: "All BSC testnet acceptance checks passed" };
}

module.exports = {
  checks,
  defaultNpmCmd,
  runTestnetAcceptance,
  spawnOptions,
};

if (require.main === module) {
  const result = runTestnetAcceptance();
  if (!result.ok) process.exit(result.status);
}
