import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { network } from "hardhat";

/**
 * Gate D driver.
 *
 * Local Hardhat: the executable evidence pack lives in
 * test/BnbLifecycleCertification.spec.ts (create → bond → graduate →
 * Topaz BUY/SELL → harvest 80/20 → LP principal). This script delegates to it.
 *
 * bscTestnet: remaining-path only. Continues WIC on factory 0x77Af… —
 * no CREATE, no extra pre-grad history. Factory/locker never come from
 * deployments/bscTestnet.json. Evidence is consumed by
 * test-topaz-graduation-flow.ts with TOPAZ_ACCEPTANCE_REQUIRE_EVIDENCE=true.
 */
async function main() {
  if (network.name === "hardhat" || network.name === "localhost") {
    const result = spawnSync("npx", ["hardhat", "test", "test/BnbLifecycleCertification.spec.ts"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    if (result.status !== 0) process.exit(result.status || 1);
    const evidence = path.join(__dirname, "..", "reports", "bnb-lifecycle-certification-local.json");
    if (!fs.existsSync(evidence)) {
      throw new Error(`local lifecycle did not write ${evidence}`);
    }
    console.log("[bnb-lifecycle] local Gate D evidence written", evidence);
    return;
  }

  if (network.name !== "bscTestnet") {
    throw new Error(`unsupported network ${network.name}; use hardhat or bscTestnet`);
  }

  const remaining = spawnSync(
    "npx",
    ["hardhat", "run", "scripts/run-bnb-graduation-postgrad.ts", "--network", "bscTestnet"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    },
  );
  if (remaining.status !== 0) process.exit(remaining.status || 1);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
