#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const networkName = process.argv[2] || process.env.HARDHAT_NETWORK || "bscTestnet";
const repositoryRoot = path.join(__dirname, "..");
const deploymentFile = path.join(repositoryRoot, "deployments", `${networkName}.json`);

if (!fs.existsSync(deploymentFile)) {
  console.error(`[route-authority-deployment] deployment file not found: ${deploymentFile}`);
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
const factoryAddress =
  deployment.factoryRegistry?.activeFactory ||
  deployment.contracts?.LaunchFactory ||
  deployment.LaunchFactory;

if (!/^0x[a-fA-F0-9]{40}$/.test(factoryAddress || "")) {
  console.error(`[route-authority-deployment] active LaunchFactory missing from ${deploymentFile}`);
  process.exit(1);
}

console.log(`[route-authority-deployment] deployment=${deploymentFile}`);
console.log(`[route-authority-deployment] factory=${factoryAddress}`);

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npxCommand,
  ["hardhat", "run", "scripts/verify-route-authority.cjs", "--network", networkName],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NETWORK_NAME: networkName,
      LAUNCH_FACTORY_ADDRESS: factoryAddress,
    },
  },
);

if (result.error) {
  console.error(`[route-authority-deployment] verifier could not start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status || 0);
