#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";

const commonChecks = [
  ["compile contracts", ["run", "compile"]],
  ["hardhat unit tests", ["run", "test"]],
  ["coverage", ["run", "coverage"]],
  ["gas report", ["run", "gas"]],
  ["contract size", ["run", "size"]],
  ["security access matrix", ["run", "security:matrix"]],
  ["security check", ["run", "security:check"]],
  ["economic simulation suite", ["run", "economics:simulate:suite"]],
  ["indexer schema export", ["run", "indexer:schema"]],
];

const suites = {
  local: [
    ...commonChecks,
    ["local deploy env", ["run", "deploy:check-env"]],
    ["local protocol rehearsal", ["run", "protocol:rehearsal"]],
    ["rehearsal check", ["run", "rehearsal:check"]],
    ["local frontend env export", ["run", "frontend:env"]],
    ["frontend contract check", ["run", "frontend:contracts:check"]],
    ["local indexer manifest", ["run", "indexer:manifest:localhost"]],
    ["local deployment summary", ["run", "deployment:summary"]],
  ],
  bscTestnet: [
    ...commonChecks,
    ["BSC Testnet deploy env", ["run", "deploy:check-env:bsc-testnet"]],
    ["BSC Testnet frontend env export", ["run", "frontend:env:bsc-testnet"]],
    ["BSC Testnet frontend contract check", ["run", "frontend:contracts:check:bsc-testnet"]],
    ["BSC Testnet indexer manifest", ["run", "indexer:manifest:bsc-testnet"]],
    ["BSC Testnet deployment verification", ["run", "verify:deployment:bsc-testnet"]],
    ["BSC Testnet route authority verification", ["run", "verify:route-authority:bsc-testnet"]],
    ["BSC Testnet deployment summary", ["run", "deployment:summary:bsc-testnet"]],
    ["BSC Testnet monitoring readiness", ["run", "monitor:readiness:bsc-testnet"]],
    ["BSC Testnet monitoring snapshot", ["run", "monitor:snapshot:bsc-testnet"]],
    ["BSC Testnet Topaz graduation flow", ["run", "testnet:topaz-graduation"]],
  ],
};

function normalizeMode(raw) {
  const mode = String(raw || "local").trim().toLowerCase();
  if (mode === "local" || mode === "localhost") return "local";
  if (mode === "bsc-testnet" || mode === "bsctestnet" || mode === "testnet") return "bscTestnet";
  return null;
}

function runSuite(mode, options = {}) {
  const suite = suites[mode];
  if (!suite) {
    console.error(`[full-suite] Unknown suite "${mode}". Use local or bsc-testnet.`);
    return 1;
  }

  const spawn = options.spawn || spawnSync;
  const stdio = options.stdio || "inherit";
  const startedAt = Date.now();

  console.log(`[full-suite] Running ${mode} suite with ${suite.length} checks.`);

  for (const [label, args] of suite) {
    const checkStartedAt = Date.now();
    console.log(`\n[full-suite] ${label}`);
    const result = spawn(npmCmd, args, { stdio, shell });
    const elapsed = Math.round((Date.now() - checkStartedAt) / 1000);

    if (result.error) {
      console.error(`[full-suite] ${label} could not start after ${elapsed}s: ${result.error.message}`);
      return 1;
    }

    if (result.status !== 0) {
      console.error(`[full-suite] ${label} failed after ${elapsed}s. Stop the suite.`);
      return result.status || 1;
    }

    console.log(`[full-suite] ${label} passed in ${elapsed}s.`);
  }

  const total = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n[full-suite] ${mode} suite passed in ${total}s.`);
  return 0;
}

if (require.main === module) {
  const mode = normalizeMode(process.argv[2]);
  if (!mode) {
    console.error("[full-suite] Usage: node scripts/full-test-suite.cjs <local|bsc-testnet>");
    process.exit(1);
  }
  process.exit(runSuite(mode));
}

module.exports = {
  commonChecks,
  normalizeMode,
  runSuite,
  suites,
};
