import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
    network: "unitnet",
    chainId: 31337,
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

function runSummary(deployment: unknown, opts: { envExists?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "mwz-deployment-summary-"));
  const deploymentFile = path.join(dir, "deployment.json");
  const frontendEnvFile = path.join(dir, "frontend.env");
  writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  if (opts.envExists) writeFileSync(frontendEnvFile, "# existing env\n");

  const script = path.join(process.cwd(), "scripts", "deployment-summary.cjs");
  const result = spawnSync(process.execPath, [script, "unitnet"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEPLOYMENT_FILE: deploymentFile,
      FRONTEND_ENV_FILE: frontendEnvFile,
    },
    encoding: "utf8",
  });

  const envFileExists = existsSync(frontendEnvFile);
  rmSync(dir, { recursive: true, force: true });
  return { ...result, deploymentFile, frontendEnvFile, envFileExists };
}

describe("deployment-summary script", function () {
  it("prints a valid summary from canonical deployment keys", async () => {
    const result = runSummary(baseDeployment(), { envExists: true });

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("[deployment-summary] file:");
    expect(result.stdout).to.include("network                            unitnet");
    expect(result.stdout).to.include(`LaunchFactory                      ${ADDRESSES.factory}`);
    expect(result.stdout).to.include(`TreasuryRouter                     ${ADDRESSES.treasuryRouter}`);
    expect(result.stdout).to.include("factoryTradeRouteProfile           1");
    expect(result.stdout).to.include("unifiedRouterModeActive            true");
    expect(result.stdout).to.include("status                             valid");
    expect(result.stdout).to.include("entries                            12");
    expect(result.stdout).to.include("none");
  });

  it("marks frontend env file as not written yet when the env file is absent", async () => {
    const result = runSummary(baseDeployment());

    expect(result.status).to.eq(0);
    expect(result.envFileExists).to.eq(false);
    expect(result.stdout).to.include("frontend.env (not written yet)");
    expect(result.stdout).to.include("status                             valid");
  });

  it("prints post-deploy actions when follow-up operator work remains", async () => {
    const result = runSummary(
      baseDeployment({
        postDeployActions: ["enable recruiter payouts", "transfer ownership to treasury safe"],
      })
    );

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("- enable recruiter payouts");
    expect(result.stdout).to.include("- transfer ownership to treasury safe");
  });

  it("supports legacy top-level address fallbacks", async () => {
    const deployment = baseDeployment({
      contracts: {},
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
    });

    const result = runSummary(deployment);

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include(`LaunchFactory                      ${ADDRESSES.factory}`);
    expect(result.stdout).to.include(`UPVoteTreasury                     ${ADDRESSES.upVoteTreasury}`);
    expect(result.stdout).to.include("status                             valid");
  });

  it("exits non-zero when frontend env validation fails", async () => {
    const invalid = baseDeployment({
      contracts: {
        ...baseDeployment().contracts,
        LaunchFactory: "not-an-address",
      },
    });
    const result = runSummary(invalid);

    expect(result.status).to.eq(1);
    expect(result.stdout).to.include("status                             invalid:");
    expect(result.stdout).to.include("LaunchFactory: missing or invalid address");
  });
});
