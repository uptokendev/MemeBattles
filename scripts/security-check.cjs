#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const npmCmd = process.platform === "win32" ? "npm" : "npm";
const useShell = process.platform === "win32";

const REQUIRED = [
  ["compile", ["run", "compile"]],
  ["contract size", ["run", "size"]],
  ["security matrix", ["run", "security:matrix"]],
];

const OPTIONAL = [
  ["tests", ["test"]],
  ["coverage", ["run", "coverage"]],
  ["gas", ["run", "gas"]],
];

function run(label, args, required) {
  console.log(`\n[security-check] ${label}`);
  const result = spawnSync(npmCmd, args, { stdio: "inherit", shell: useShell });
  if (result.error) {
    const message = `${label} could not start: ${result.error.message}`;
    if (required) throw new Error(message);
    console.warn(`[security-check] optional skipped: ${message}`);
    return false;
  }
  if (result.status !== 0) {
    const message = `${label} failed with status ${result.status}`;
    if (required) throw new Error(message);
    console.warn(`[security-check] optional failed: ${message}`);
    return false;
  }
  return true;
}

function main() {
  for (const [label, args] of REQUIRED) run(label, args, true);
  if (process.env.SECURITY_CHECK_FULL === "1" || process.env.SECURITY_CHECK_FULL === "true") {
    for (const [label, args] of OPTIONAL) run(label, args, false);
  } else {
    console.log("\n[security-check] Optional long checks skipped. Set SECURITY_CHECK_FULL=1 to run tests, coverage, and gas.");
  }
  console.log("\n[security-check] complete");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
