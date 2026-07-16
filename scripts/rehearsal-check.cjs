#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const defaultNpmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const focusedSpecs = [
  "test/CheckDeployEnv.spec.ts",
  "test/VerifyDeploymentHelpers.spec.ts",
  "test/LaunchCampaignQuoteEdges.spec.ts",
  "test/LaunchCampaignCloseout.spec.ts",
  "test/PackageScripts.spec.ts",
];

const checks = [
  ["focused hardening specs", ["exec", "--", "hardhat", "test", ...focusedSpecs]],
  ["local protocol rehearsal", ["run", "protocol:rehearsal"]],
];

function runRehearsalChecks(options = {}) {
  const spawn = options.spawn || spawnSync;
  const npmCmd = options.npmCmd || defaultNpmCmd;
  const stdio = options.stdio || "inherit";

  console.log("[rehearsal-check] Running focused hardening checks and local protocol rehearsal.");

  for (const [label, args] of checks) {
    console.log(`\n[rehearsal-check] ${label}`);
    const result = spawn(npmCmd, args, { stdio });

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
  focusedSpecs,
  runRehearsalChecks,
};

if (require.main === module) {
  const result = runRehearsalChecks();
  if (!result.ok) process.exit(result.status);
}
