import { expect } from "chai";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ADDRESSES = {
  deployer: "0x0000000000000000000000000000000000000021",
  treasurySafe: "0x0000000000000000000000000000000000000022",
  router: "0x0000000000000000000000000000000000000023",
  factory: "0x0000000000000000000000000000000000000024",
  implementation: "0x0000000000000000000000000000000000000025",
  treasuryRouter: "0x0000000000000000000000000000000000000026",
  treasuryVault: "0x0000000000000000000000000000000000000027",
  recruiterVault: "0x0000000000000000000000000000000000000028",
  communityVault: "0x0000000000000000000000000000000000000029",
  protocolVault: "0x000000000000000000000000000000000000002a",
  creatorRegistry: "0x000000000000000000000000000000000000002b",
  riskRegistry: "0x000000000000000000000000000000000000002c",
  graduationOracle: "0x000000000000000000000000000000000000002d",
  permanentLpLocker: "0x000000000000000000000000000000000000002e",
  upVoteTreasury: "0x000000000000000000000000000000000000002f",
  priceFeed: "0x0000000000000000000000000000000000000030",
};

function deployment() {
  return {
    network: "edgeNet",
    chainId: 31337,
    deployer: ADDRESSES.deployer,
    treasurySafe: ADDRESSES.treasurySafe,
    topazRouter: ADDRESSES.router,
    graduationPriceFeed: ADDRESSES.priceFeed,
    graduationMaxPriceAge: 3600,
    protocolFeeBps: 200,
    contracts: {
      LaunchFactory: ADDRESSES.factory,
      LaunchCampaignImplementation: ADDRESSES.implementation,
      TreasuryRouter: ADDRESSES.treasuryRouter,
      TreasuryVaultV2: ADDRESSES.treasuryVault,
      RecruiterRewardsVault: ADDRESSES.recruiterVault,
      CommunityRewardsVault: ADDRESSES.communityVault,
      ProtocolRevenueVault: ADDRESSES.protocolVault,
      CreatorRegistry: ADDRESSES.creatorRegistry,
      RiskRegistry: ADDRESSES.riskRegistry,
      GraduationOracle: ADDRESSES.graduationOracle,
      PermanentLpLocker: ADDRESSES.permanentLpLocker,
      UPVoteTreasury: ADDRESSES.upVoteTreasury,
    },
    routing: {
      factoryTradeRouteProfile: 2,
      factoryFinalizeRouteProfile: 1,
      factoryRouteAuthority: ADDRESSES.deployer,
      unifiedRouterModeActive: false,
    },
    postDeployActions: [],
  };
}

function runSummary(args: string[], env: Record<string, string>) {
  const script = path.join(process.cwd(), "scripts", "deployment-summary.cjs");
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("deployment-summary CLI edge cases", function () {
  it("fails clearly when the deployment file is missing", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-summary-missing-"));
    const missingFile = path.join(dir, "missing.json");

    try {
      const result = runSummary(["hardhat"], { DEPLOYMENT_FILE: missingFile });

      expect(result.status).to.eq(1);
      expect(result.stderr).to.include("Deployment file not found");
      expect(result.stderr).to.include(missingFile);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses HARDHAT_NETWORK as the target name when no CLI target is provided", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-summary-target-"));
    const deploymentFile = path.join(dir, "deployment.json");
    const expectedFrontendFile = path.join(dir, "bscTestnet.frontend.env");
    writeFileSync(deploymentFile, JSON.stringify(deployment(), null, 2));

    try {
      const result = runSummary([], { DEPLOYMENT_FILE: deploymentFile, HARDHAT_NETWORK: "bscTestnet" });

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include("network                            edgeNet");
      expect(result.stdout).to.include(`${expectedFrontendFile} (not written yet)`);
      expect(existsSync(expectedFrontendFile)).to.eq(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints false routing booleans instead of treating them as unset", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-summary-routing-"));
    const deploymentFile = path.join(dir, "deployment.json");
    writeFileSync(deploymentFile, JSON.stringify(deployment(), null, 2));

    try {
      const result = runSummary(["edgeNet"], { DEPLOYMENT_FILE: deploymentFile });

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include("factoryTradeRouteProfile           2");
      expect(result.stdout).to.include("factoryFinalizeRouteProfile        1");
      expect(result.stdout).to.include("unifiedRouterModeActive            unset");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
