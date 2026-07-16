import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("package scripts", function () {
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

  it("keeps core compile, test, coverage, gas, and size scripts", async () => {
    expect(pkg.scripts.compile).to.eq("hardhat compile");
    expect(pkg.scripts.test).to.eq("hardhat test");
    expect(pkg.scripts.coverage).to.eq("hardhat coverage");
    expect(pkg.scripts.gas).to.eq("REPORT_GAS=true hardhat test");
    expect(pkg.scripts.size).to.eq("hardhat run scripts/check-contract-size.ts");
  });

  it("keeps deployment environment and verification scripts wired", async () => {
    expect(pkg.scripts["deploy:check-env"]).to.eq("node scripts/check-deploy-env.cjs");
    expect(pkg.scripts["deploy:check-env:bsc-testnet"]).to.eq("node scripts/check-deploy-env.cjs bscTestnet");
    expect(pkg.scripts["deploy:verify"]).to.eq("hardhat run scripts/deploy-and-verify.ts");
    expect(pkg.scripts["deploy:verify:bsc-testnet"]).to.eq("hardhat run scripts/deploy-and-verify.ts --network bscTestnet");
    expect(pkg.scripts["verify:deployment"]).to.eq("hardhat run scripts/verify-deployment.ts");
    expect(pkg.scripts["verify:route-authority"]).to.eq("hardhat run scripts/verify-route-authority.cjs");
    expect(pkg.scripts["protocol:rehearsal"]).to.eq("hardhat run scripts/local-protocol-rehearsal.ts");
    expect(pkg.scripts["rehearsal:check"]).to.eq("node scripts/rehearsal-check.cjs");
  });

  it("keeps frontend ABI and env export scripts wired", async () => {
    expect(pkg.scripts["sync:frontend-abis"]).to.eq("node scripts/sync-frontend-abis.cjs");
    expect(pkg.scripts["compile:frontend-abis"]).to.eq("hardhat compile && node scripts/sync-frontend-abis.cjs");
    expect(pkg.scripts["frontend:env"]).to.eq("node scripts/export-frontend-env.cjs");
    expect(pkg.scripts["frontend:env:bsc-testnet"]).to.eq("node scripts/export-frontend-env.cjs bscTestnet");
  });

  it("keeps pretestnet, deployment summary, and simulation scripts wired", async () => {
    expect(pkg.scripts["pretestnet:check"]).to.eq("node scripts/pretestnet-check.cjs");
    expect(pkg.scripts["deployment:summary"]).to.eq("node scripts/deployment-summary.cjs");
    expect(pkg.scripts["deployment:summary:bsc-testnet"]).to.eq("node scripts/deployment-summary.cjs bscTestnet");
    expect(pkg.scripts["economics:simulate"]).to.eq("node scripts/economic-simulations.cjs");
    expect(pkg.scripts["economics:simulate:suite"]).to.eq("node scripts/economic-simulations.cjs --config config/economic-scenarios.json");
    expect(pkg.scripts["economics:simulate:acceptance"]).to.eq(
      "node scripts/economic-simulations.cjs --config config/economic-scenarios.json --output output/economic-simulation-results.json",
    );
  });

  it("uses the expected package manager and core dependencies", async () => {
    expect(pkg.packageManager).to.include("yarn@1.22.22");
    expect(pkg.devDependencies.hardhat).to.eq("^2.22.10");
    expect(pkg.devDependencies["@nomicfoundation/hardhat-toolbox"]).to.eq("^5.0.0");
    expect(pkg.dependencies["@openzeppelin/contracts"]).to.eq("^5.0.2");
  });
});
