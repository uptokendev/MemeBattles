#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { writeFrontendEnv } = require("./lib/frontendEnv.cjs");

const target = process.argv[2] || process.env.HARDHAT_NETWORK || "hardhat";
const deploymentFile = process.env.DEPLOYMENT_FILE
  ? path.resolve(process.env.DEPLOYMENT_FILE)
  : path.join(__dirname, "..", "deployments", `${target}.json`);

function readDeployment() {
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}. Run deploy first or set DEPLOYMENT_FILE.`);
  }
  return JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
}

const deployment = readDeployment();
const outFile = process.env.FRONTEND_ENV_FILE
  ? path.resolve(process.env.FRONTEND_ENV_FILE)
  : path.join(path.dirname(deploymentFile), `${target}.frontend.env`);
const output = writeFrontendEnv(deployment, outFile, deploymentFile);

console.log(`[frontend-env] Loaded deployment: ${deploymentFile}`);
console.log(`[frontend-env] Wrote: ${outFile}`);
console.log(output.trimEnd());
