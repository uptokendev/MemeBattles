#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { writeIndexerManifest } = require("./lib/indexerManifest.cjs");

const target = process.argv[2] || process.env.HARDHAT_NETWORK || "hardhat";
const deploymentFile = process.env.DEPLOYMENT_FILE
  ? path.resolve(process.env.DEPLOYMENT_FILE)
  : path.join(__dirname, "..", "deployments", `${target}.json`);
const outFile = process.env.INDEXER_MANIFEST_FILE
  ? path.resolve(process.env.INDEXER_MANIFEST_FILE)
  : path.join(path.dirname(deploymentFile), `${target}.indexer-manifest.json`);

function readDeployment() {
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}. Run deploy first or set DEPLOYMENT_FILE.`);
  }
  return JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
}

const manifest = writeIndexerManifest(readDeployment(), outFile, deploymentFile);
console.log(`[indexer-manifest] Loaded deployment: ${deploymentFile}`);
console.log(`[indexer-manifest] Wrote: ${outFile}`);
console.log(`[indexer-manifest] chainId=${manifest.chainId}`);
console.log(`[indexer-manifest] contracts=${Object.keys(manifest.contracts).length}`);
