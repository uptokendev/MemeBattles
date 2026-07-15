import { expect } from "chai";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ADDRESSES = {
  factory: "0x0000000000000000000000000000000000000011",
  implementation: "0x0000000000000000000000000000000000000012",
  treasuryRouter: "0x0000000000000000000000000000000000000013",
  communityVault: "0x0000000000000000000000000000000000000014",
  recruiterVault: "0x0000000000000000000000000000000000000015",
  protocolVault: "0x0000000000000000000000000000000000000016",
  creatorRegistry: "0x0000000000000000000000000000000000000017",
  riskRegistry: "0x0000000000000000000000000000000000000018",
  graduationOracle: "0x0000000000000000000000000000000000000019",
  topazRouter: "0x000000000000000000000000000000000000001a",
  permanentLpLocker: "0x000000000000000000000000000000000000001b",
  upVoteTreasury: "0x000000000000000000000000000000000000001c",
};

function deployment(chainId: number | string = 31337) {
  return {
    chainId,
    topazRouter: ADDRESSES.topazRouter,
    contracts: {
      LaunchFactory: ADDRESSES.factory,
      LaunchCampaignImplementation: ADDRESSES.implementation,
      TreasuryRouter: ADDRESSES.treasuryRouter,
      CommunityRewardsVault: ADDRESSES.communityVault,
      RecruiterRewardsVault: ADDRESSES.recruiterVault,
      ProtocolRevenueVault: ADDRESSES.protocolVault,
      CreatorRegistry: ADDRESSES.creatorRegistry,
      RiskRegistry: ADDRESSES.riskRegistry,
      GraduationOracle: ADDRESSES.graduationOracle,
      PermanentLpLocker: ADDRESSES.permanentLpLocker,
      UPVoteTreasury: ADDRESSES.upVoteTreasury,
    },
  };
}

function runExport(args: string[], env: Record<string, string>) {
  const script = path.join(process.cwd(), "scripts", "export-frontend-env.cjs");
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("export-frontend-env CLI edge cases", function () {
  it("writes a requested nested frontend env file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-export-env-"));
    const deploymentFile = path.join(dir, "deployment.json");
    const outFile = path.join(dir, "nested", "frontend.env");
    writeFileSync(deploymentFile, JSON.stringify(deployment(), null, 2));

    try {
      const result = runExport(["hardhat"], { DEPLOYMENT_FILE: deploymentFile, FRONTEND_ENV_FILE: outFile });

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include(`[frontend-env] Loaded deployment: ${deploymentFile}`);
      expect(result.stdout).to.include(`[frontend-env] Wrote: ${outFile}`);
      expect(existsSync(outFile)).to.eq(true);
      expect(readFileSync(outFile, "utf8")).to.include(`VITE_FACTORY_ADDRESS_31337=${ADDRESSES.factory}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses HARDHAT_NETWORK for the default output file name when no CLI target is passed", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-export-env-target-"));
    const deploymentFile = path.join(dir, "deployment.json");
    const expectedOutFile = path.join(dir, "bscTestnet.frontend.env");
    writeFileSync(deploymentFile, JSON.stringify(deployment(97), null, 2));

    try {
      const result = runExport([], { DEPLOYMENT_FILE: deploymentFile, HARDHAT_NETWORK: "bscTestnet" });

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include(`[frontend-env] Wrote: ${expectedOutFile}`);
      expect(readFileSync(expectedOutFile, "utf8")).to.include(`VITE_FACTORY_ADDRESS_97=${ADDRESSES.factory}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails before writing when the deployment file is missing", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-export-env-missing-"));
    const deploymentFile = path.join(dir, "missing.json");
    const outFile = path.join(dir, "frontend.env");

    try {
      const result = runExport(["hardhat"], { DEPLOYMENT_FILE: deploymentFile, FRONTEND_ENV_FILE: outFile });

      expect(result.status).to.eq(1);
      expect(result.stderr).to.include("Deployment file not found");
      expect(existsSync(outFile)).to.eq(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
