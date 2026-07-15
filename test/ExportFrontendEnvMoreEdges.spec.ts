import { expect } from "chai";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

const A = {
  factory: "0x0000000000000000000000000000000000000301",
  implementation: "0x0000000000000000000000000000000000000302",
  treasuryRouter: "0x0000000000000000000000000000000000000303",
  communityVault: "0x0000000000000000000000000000000000000304",
  recruiterVault: "0x0000000000000000000000000000000000000305",
  protocolVault: "0x0000000000000000000000000000000000000306",
  creatorRegistry: "0x0000000000000000000000000000000000000307",
  riskRegistry: "0x0000000000000000000000000000000000000308",
  graduationOracle: "0x0000000000000000000000000000000000000309",
  topazRouter: "0x000000000000000000000000000000000000030a",
  permanentLpLocker: "0x000000000000000000000000000000000000030b",
  upVoteTreasury: "0x000000000000000000000000000000000000030c",
};

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 97,
    topazRouter: A.topazRouter,
    contracts: {
      LaunchFactory: A.factory,
      LaunchCampaignImplementation: A.implementation,
      TreasuryRouter: A.treasuryRouter,
      CommunityRewardsVault: A.communityVault,
      RecruiterRewardsVault: A.recruiterVault,
      ProtocolRevenueVault: A.protocolVault,
      CreatorRegistry: A.creatorRegistry,
      RiskRegistry: A.riskRegistry,
      GraduationOracle: A.graduationOracle,
      PermanentLpLocker: A.permanentLpLocker,
      UPVoteTreasury: A.upVoteTreasury,
    },
    ...overrides,
  };
}

function runExport(deploymentFile: string, outFile?: string) {
  const script = path.join(process.cwd(), "scripts", "export-frontend-env.cjs");
  return spawnSync(process.execPath, [script, "bscTestnet"], {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOYMENT_FILE: deploymentFile, ...(outFile ? { FRONTEND_ENV_FILE: outFile } : {}) },
    encoding: "utf8",
  });
}

describe("export-frontend-env additional CLI edges", function () {
  it("does not create an output file when frontend env validation fails", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-export-more-bad-"));
    const deploymentFile = path.join(dir, "deployment.json");
    const outFile = path.join(dir, "frontend.env");
    const badContracts = { ...(deployment().contracts as Record<string, string>), LaunchFactory: "bad" };
    writeFileSync(deploymentFile, JSON.stringify(deployment({ contracts: badContracts }), null, 2));

    try {
      const result = runExport(deploymentFile, outFile);

      expect(result.status).to.eq(1);
      expect(result.stderr).to.include("LaunchFactory: missing or invalid address");
      expect(existsSync(outFile)).to.eq(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the CLI target for the default frontend env filename", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-export-more-target-"));
    const deploymentFile = path.join(dir, "deployment.json");
    const expectedOutFile = path.join(dir, "bscTestnet.frontend.env");
    writeFileSync(deploymentFile, JSON.stringify(deployment(), null, 2));

    try {
      const result = runExport(deploymentFile);

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include(`[frontend-env] Wrote: ${expectedOutFile}`);
      expect(existsSync(expectedOutFile)).to.eq(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints the generated Vite variables to stdout", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-export-more-print-"));
    const deploymentFile = path.join(dir, "deployment.json");
    writeFileSync(deploymentFile, JSON.stringify(deployment(), null, 2));

    try {
      const result = runExport(deploymentFile);

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include(`VITE_FACTORY_ADDRESS_97=${A.factory}`);
      expect(result.stdout).to.include(`VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_97=${A.implementation}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
