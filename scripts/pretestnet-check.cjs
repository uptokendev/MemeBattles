#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const defaultNpmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const checks = [
  ["test", ["run", "test"]],
  ["size", ["run", "size"]],
  ["indexer schema", ["run", "indexer:schema"]],
  ["security check", ["run", "security:check"]],
  ["local deploy env", ["run", "deploy:check-env"]],
  ["bscTestnet deploy env", ["run", "deploy:check-env:bsc-testnet"]],
];

function runPretestnetChecks(options = {}) {
  const spawn = options.spawn || spawnSync;
  const npmCmd = options.npmCmd || defaultNpmCmd;
  const stdio = options.stdio || "inherit";

  console.log("[pretestnet] Running readiness checks before any BSC testnet deploy.");

  for (const [label, args] of checks) {
    console.log(`\n[pretestnet] ${label}`);
    const result = spawn(npmCmd, args, { stdio });

    if (result.error) {
      const message = `[pretestnet] ${label} could not start: ${result.error.message}`;
      console.error(message);
      return { ok: false, status: 1, label, message };
    }

    if (result.status !== 0) {
      const status = result.status || 1;
      const message = `[pretestnet] ${label} failed. Stop before testnet deploy.`;
      console.error(message);
      return { ok: false, status, label, message };
    }
  }

  console.log("\n[pretestnet] All readiness checks passed. BSC testnet deploy can be considered.");
  return { ok: true, status: 0, label: "complete", message: "All readiness checks passed" };
}

module.exports = {
  checks,
  defaultNpmCmd,
  runPretestnetChecks,
};

if (require.main === module) {
  const result = runPretestnetChecks();
  if (!result.ok) process.exit(result.status);
}
