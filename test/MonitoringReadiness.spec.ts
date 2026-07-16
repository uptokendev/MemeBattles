import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { buildMonitoringReadiness } = require("../scripts/monitoring-readiness.cjs");

const ADDRESSES = {
  deployer: "0x0000000000000000000000000000000000000001",
  treasurySafe: "0x0000000000000000000000000000000000000002",
  topazRouter: "0x0000000000000000000000000000000000000003",
  factory: "0x0000000000000000000000000000000000000004",
  implementation: "0x0000000000000000000000000000000000000005",
  treasuryRouter: "0x0000000000000000000000000000000000000006",
  treasuryVault: "0x0000000000000000000000000000000000000007",
  recruiterVault: "0x0000000000000000000000000000000000000008",
  communityVault: "0x0000000000000000000000000000000000000009",
  protocolVault: "0x000000000000000000000000000000000000000a",
  creatorRegistry: "0x000000000000000000000000000000000000000b",
  riskRegistry: "0x000000000000000000000000000000000000000c",
  graduationOracle: "0x000000000000000000000000000000000000000d",
  permanentLpLocker: "0x000000000000000000000000000000000000000e",
  upVoteTreasury: "0x000000000000000000000000000000000000000f",
  priceFeed: "0x0000000000000000000000000000000000000010",
};

function baseDeployment(overrides: Record<string, unknown> = {}) {
  return {
    network: "bscTestnet",
    chainId: 97,
    deployer: ADDRESSES.deployer,
    treasurySafe: ADDRESSES.treasurySafe,
    topazRouter: ADDRESSES.topazRouter,
    graduationPriceFeed: ADDRESSES.priceFeed,
    graduationMaxPriceAge: 3600,
    protocolFeeBps: "200",
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
      factoryTradeRouteProfile: 1,
      factoryFinalizeRouteProfile: 1,
      factoryRouteAuthority: ADDRESSES.deployer,
      unifiedRouterModeActive: true,
    },
    postDeployActions: [],
    ...overrides,
  };
}

function runCli(deployment: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "mwz-monitoring-readiness-"));
  const deploymentFile = path.join(dir, "deployment.json");
  writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "monitoring-readiness.cjs"), "bscTestnet"], {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOYMENT_FILE: deploymentFile },
    encoding: "utf8",
  });

  rmSync(dir, { recursive: true, force: true });
  return result;
}

describe("monitoring-readiness script", function () {
  it("accepts a deployment artifact with all keeper watch targets", async () => {
    const readiness = buildMonitoringReadiness(baseDeployment(), { target: "bscTestnet" });

    expect(readiness.ok).to.eq(true);
    expect(readiness.errors).to.deep.eq([]);
    expect(readiness.warnings).to.deep.eq([]);
    expect(readiness.watch.contracts.LaunchFactory).to.eq(ADDRESSES.factory);
    expect(readiness.watch.contracts.GraduationOracle).to.eq(ADDRESSES.graduationOracle);
    expect(readiness.watch.graduationPriceFeed).to.eq(ADDRESSES.priceFeed);
    expect(readiness.watch.topazRouter).to.eq(ADDRESSES.topazRouter);
    expect(readiness.watch.routing.factoryRouteAuthority).to.eq(ADDRESSES.deployer);
  });

  it("blocks monitoring when required deployment targets are missing", async () => {
    const readiness = buildMonitoringReadiness(
      baseDeployment({
        chainId: null,
        topazRouter: "",
        graduationPriceFeed: "0x0000000000000000000000000000000000000000",
        graduationMaxPriceAge: 0,
        contracts: {
          ...baseDeployment().contracts,
          LaunchFactory: "not-an-address",
        },
        routing: {
          factoryTradeRouteProfile: null,
          factoryFinalizeRouteProfile: undefined,
          factoryRouteAuthority: "0x0000000000000000000000000000000000000000",
          unifiedRouterModeActive: false,
        },
      })
    );

    expect(readiness.ok).to.eq(false);
    expect(readiness.errors).to.include("chainId: missing from deployment artifact");
    expect(readiness.errors).to.include("topazRouter: missing or invalid address");
    expect(readiness.errors).to.include("graduationPriceFeed: missing or invalid address");
    expect(readiness.errors).to.include("graduationMaxPriceAge: must be positive");
    expect(readiness.errors).to.include("LaunchFactory: missing or invalid address");
    expect(readiness.errors).to.include("routing.factoryTradeRouteProfile: missing");
    expect(readiness.errors).to.include("routing.factoryFinalizeRouteProfile: missing");
    expect(readiness.errors).to.include("routing.factoryRouteAuthority: missing or invalid address");
    expect(readiness.warnings).to.include("routing.unifiedRouterModeActive: expected true for production monitoring");
  });

  it("warns when operator post-deploy actions remain", async () => {
    const readiness = buildMonitoringReadiness(
      baseDeployment({ postDeployActions: ["transfer ownership", "enable payout lanes"] })
    );

    expect(readiness.ok).to.eq(true);
    expect(readiness.warnings).to.deep.eq(["postDeployActions: 2 action(s) still pending"]);
  });

  it("supports legacy top-level address fallbacks", async () => {
    const readiness = buildMonitoringReadiness(
      baseDeployment({
        contracts: {},
        router: ADDRESSES.topazRouter,
        factory: ADDRESSES.factory,
        campaignImplementation: ADDRESSES.implementation,
        treasuryRouter: ADDRESSES.treasuryRouter,
        treasuryVault: ADDRESSES.treasuryVault,
        recruiterVault: ADDRESSES.recruiterVault,
        communityVault: ADDRESSES.communityVault,
        protocolVault: ADDRESSES.protocolVault,
        creatorRegistry: ADDRESSES.creatorRegistry,
        riskRegistry: ADDRESSES.riskRegistry,
        graduationOracle: ADDRESSES.graduationOracle,
        permanentLpLocker: ADDRESSES.permanentLpLocker,
        voteTreasury: ADDRESSES.upVoteTreasury,
      })
    );

    expect(readiness.ok).to.eq(true);
    expect(readiness.watch.contracts.LaunchFactory).to.eq(ADDRESSES.factory);
    expect(readiness.watch.topazRouter).to.eq(ADDRESSES.topazRouter);
  });

  it("exits non-zero from the CLI when monitoring readiness is blocked", async () => {
    const result = runCli(baseDeployment({ graduationPriceFeed: "" }));

    expect(result.status).to.eq(1);
    expect(result.stdout).to.include("[monitoring] status: blocked");
    expect(result.stdout).to.include("graduationPriceFeed: missing or invalid address");
  });
});
