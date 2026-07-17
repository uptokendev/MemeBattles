#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const defaultNpmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const defaultNpxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const spawnOptions = (stdio) => ({ stdio, shell: process.platform === "win32" });

const focusedSpecs = [
  "test/CheckDeployEnv.spec.ts",
  "test/VerifyDeploymentHelpers.spec.ts",
  "test/VerifyRouteAuthority.spec.ts",
  "test/LaunchFactory.spec.ts",
  "test/LaunchFactoryDefaultEconomics.spec.ts",
  "test/LaunchCampaignQuoteEdges.spec.ts",
  "test/LaunchCampaignCloseout.spec.ts",
  "test/EconomicSimulations.spec.ts",
  "test/IndexerManifest.spec.ts",
  "test/IndexerSchema.spec.ts",
  "test/IndexerRuntime.spec.ts",
  "test/MonitoringReadiness.spec.ts",
  "test/MonitoringSnapshot.spec.ts",
  "test/TestnetAcceptance.spec.ts",
  "test/PackageScripts.spec.ts",
];

const checks = [
  ["focused hardening specs", "npx", ["hardhat", "test", ...focusedSpecs]],
  ["local protocol rehearsal", "npm", ["run", "protocol:rehearsal"]],
];

function commandFor(kind, options) {
  if (kind === "npx") return options.npxCmd || defaultNpxCmd;
  return options.npmCmd || defaultNpmCmd;
}

function runRehearsalChecks(options = {}) {
  const spawn = options.spawn || spawnSync;
  const stdio = options.stdio || "inherit";

  console.log("[rehearsal-check] Running focused hardening checks and local protocol rehearsal.");

  for (const [label, kind, args] of checks) {
    console.log(`\n[rehearsal-check] ${label}`);
    const result = spawn(commandFor(kind, options), args, spawnOptions(stdio));

    if (result.error) {
      const message = `[rehearsal-check] ${label} could not start: ${result.error.message}`;
      console.error(message);
      return { ok: false, status: 1, label, message };
    }

    if (result.status !== 0) {
      const status = result.status || 1;
      const message = `[rehearsal-check] ${label} failed.`;
      console.error(message);
      return { ok: false, status, label, message };
    }
  }

  console.log("\n[rehearsal-check] Focused hardening checks passed.");
  return { ok: true, status: 0, label: "complete", message: "Focused hardening checks passed" };
}

module.exports = {
  checks,
  defaultNpmCmd,
  defaultNpxCmd,
  focusedSpecs,
  runRehearsalChecks,
  spawnOptions,
};

if (require.main === module) {
  const result = runRehearsalChecks();
  if (!result.ok) process.exit(result.status);
}
