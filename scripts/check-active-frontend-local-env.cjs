#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { buildFrontendEnv } = require("./lib/frontendEnv.cjs");

function parseEnv(content) {
  const values = new Map();
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!values.has(key)) values.set(key, value);
  }
  return values;
}

function resolveFile(envName, fallback) {
  const configured = String(process.env[envName] || "").trim();
  return configured ? path.resolve(configured) : fallback;
}

function main() {
  const root = path.resolve(__dirname, "..");
  const deploymentFile = resolveFile(
    "DEPLOYMENT_FILE",
    path.join(root, "deployments", "bscTestnet.scheduled-test-factory.json"),
  );
  const localEnvFile = resolveFile(
    "FRONTEND_LOCAL_ENV_FILE",
    path.join(root, "frontend", ".env.local"),
  );

  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Active deployment file not found: ${deploymentFile}`);
  }
  if (!fs.existsSync(localEnvFile)) {
    throw new Error(`Frontend local env file not found: ${localEnvFile}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const expected = parseEnv(buildFrontendEnv(deployment, deploymentFile));
  const actual = parseEnv(fs.readFileSync(localEnvFile, "utf8"));
  const mismatches = [];

  console.log(`[active-frontend-env] deployment=${deploymentFile}`);
  console.log(`[active-frontend-env] localEnv=${localEnvFile}`);

  for (const [key, expectedValue] of expected) {
    const actualValue = actual.get(key) || "";
    const ok = actualValue.toLowerCase() === expectedValue.toLowerCase();
    console.log(`${ok ? "OK  " : "FAIL"} ${key} -> ${actualValue || "missing"}`);
    if (!ok) {
      mismatches.push(`${key}: expected ${expectedValue}, got ${actualValue || "missing"}`);
    }
  }

  const activeFactory = expected.get(`VITE_FACTORY_ADDRESS_${deployment.chainId}`);
  const legacyFactory = deployment.factoryReplacement?.oldFactory || "";
  console.log(`\n[active-frontend-env] active factory=${activeFactory}`);
  if (legacyFactory) console.log(`[active-frontend-env] legacy factory=${legacyFactory}`);

  if (mismatches.length) {
    console.error("\n[active-frontend-env] Frontend local env does not match the active deployment:");
    for (const mismatch of mismatches) console.error(`- ${mismatch}`);
    console.error(
      "Run: npm run frontend:apply-scheduled-env:bsc-testnet, then rerun this check.",
    );
    process.exit(1);
  }

  console.log("\n[active-frontend-env] Frontend local contract env matches the active scheduled deployment.");
}

try {
  main();
} catch (error) {
  console.error(`[active-frontend-env] error: ${error.message}`);
  process.exit(1);
}
