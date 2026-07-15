import { expect } from "chai";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ethers } from "hardhat";
import {
  assertCode,
  assertTopazRouter,
  hardhatEphemeralHint,
  loadDeployment,
  pickAddress,
  resolveContracts,
} from "../scripts/verify-deployment";

const CANONICAL = "0x1111111111111111111111111111111111111111";
const FALLBACK = "0x2222222222222222222222222222222222222222";
const TOP_LEVEL = "0x3333333333333333333333333333333333333333";

async function expectRejects(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch (error: any) {
    expect(error.message).to.include(message);
    return;
  }
  throw new Error(`Expected rejection including: ${message}`);
}

describe("verify-deployment helpers", function () {
  let originalDeploymentFile: string | undefined;
  let tempDir: string | undefined;

  beforeEach(() => {
    originalDeploymentFile = process.env.DEPLOYMENT_FILE;
    tempDir = mkdtempSync(path.join(tmpdir(), "mwz-verify-deployment-"));
  });

  afterEach(() => {
    if (originalDeploymentFile === undefined) delete process.env.DEPLOYMENT_FILE;
    else process.env.DEPLOYMENT_FILE = originalDeploymentFile;
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads a deployment from DEPLOYMENT_FILE and reports a missing file clearly", async () => {
    const deploymentFile = path.join(tempDir!, "deployment.json");
    const deployment = { network: "hardhat", chainId: 31337, contracts: { LaunchFactory: CANONICAL } };
    writeFileSync(deploymentFile, JSON.stringify(deployment));
    process.env.DEPLOYMENT_FILE = deploymentFile;

    expect(loadDeployment()).to.deep.eq(deployment);

    process.env.DEPLOYMENT_FILE = path.join(tempDir!, "missing.json");
    expect(() => loadDeployment()).to.throw("Deployment file not found");
  });

  it("picks canonical addresses before legacy fallback aliases", async () => {
    expect(
      pickAddress(
        {
          contracts: {
            LaunchFactory: CANONICAL,
            factory: FALLBACK,
          },
          LaunchFactory: TOP_LEVEL,
        },
        "LaunchFactory",
        ["factory"]
      )
    ).to.eq(CANONICAL);

    expect(pickAddress({ contracts: { factory: FALLBACK }, LaunchFactory: TOP_LEVEL }, "LaunchFactory", ["factory"])).to.eq(
      TOP_LEVEL
    );
    expect(pickAddress({ contracts: { factory: FALLBACK } }, "LaunchFactory", ["factory"])).to.eq(FALLBACK);
    expect(pickAddress({ contracts: {}, factory: TOP_LEVEL }, "LaunchFactory", ["factory"])).to.eq(TOP_LEVEL);
    expect(pickAddress({ contracts: {} }, "LaunchFactory", ["factory"])).to.eq("");
  });

  it("resolves canonical contract names from legacy deployment aliases", async () => {
    const resolved = resolveContracts({
      contracts: {},
      factoryAddress: "0x0000000000000000000000000000000000000001",
      campaignImplementation: "0x0000000000000000000000000000000000000002",
      leagueRouter: "0x0000000000000000000000000000000000000003",
      vault: "0x0000000000000000000000000000000000000004",
      recruiterVault: "0x0000000000000000000000000000000000000005",
      communityVault: "0x0000000000000000000000000000000000000006",
      protocolVault: "0x0000000000000000000000000000000000000007",
      creatorRegistry: "0x0000000000000000000000000000000000000008",
      riskRegistry: "0x0000000000000000000000000000000000000009",
      graduationOracle: "0x000000000000000000000000000000000000000a",
      permanentLpLocker: "0x000000000000000000000000000000000000000b",
      voteTreasuryAddress: "0x000000000000000000000000000000000000000c",
    });

    expect(resolved).to.deep.eq({
      LaunchFactory: "0x0000000000000000000000000000000000000001",
      LaunchCampaignImplementation: "0x0000000000000000000000000000000000000002",
      TreasuryRouter: "0x0000000000000000000000000000000000000003",
      TreasuryVaultV2: "0x0000000000000000000000000000000000000004",
      RecruiterRewardsVault: "0x0000000000000000000000000000000000000005",
      CommunityRewardsVault: "0x0000000000000000000000000000000000000006",
      ProtocolRevenueVault: "0x0000000000000000000000000000000000000007",
      CreatorRegistry: "0x0000000000000000000000000000000000000008",
      RiskRegistry: "0x0000000000000000000000000000000000000009",
      GraduationOracle: "0x000000000000000000000000000000000000000a",
      PermanentLpLocker: "0x000000000000000000000000000000000000000b",
      UPVoteTreasury: "0x000000000000000000000000000000000000000c",
    });
  });

  it("explains hardhat ephemeral-network verification failures", async () => {
    const [owner] = await ethers.getSigners();

    expect(hardhatEphemeralHint()).to.include("ephemeral between commands");
    await expectRejects(assertCode("MissingThing", ethers.ZeroAddress), "MissingThing: missing address");
    await expectRejects(assertCode("OwnerEOA", await owner.getAddress()), "has no code on hardhat");
  });

  it("accepts addresses that contain deployed bytecode", async () => {
    const [owner] = await ethers.getSigners();
    const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
    const distributor = await RewardDistributor.deploy(await owner.getAddress());
    await distributor.waitForDeployment();

    await assertCode("RewardDistributor", await distributor.getAddress());
  });

  it("accepts deployed Topaz-style routers and rejects non-router contracts with code", async () => {
    const [owner] = await ethers.getSigners();
    const TopazFactory = await ethers.getContractFactory("MockTopazFactory");
    const topazFactory = await TopazFactory.deploy();
    await topazFactory.waitForDeployment();

    const TopazRouter = await ethers.getContractFactory("MockTopazRouter");
    const topazRouter = await TopazRouter.deploy(await topazFactory.getAddress(), await owner.getAddress());
    await topazRouter.waitForDeployment();

    await assertTopazRouter("TopazRouter", await topazRouter.getAddress());

    const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
    const distributor = await RewardDistributor.deploy(await owner.getAddress());
    await distributor.waitForDeployment();

    await expectRejects(assertTopazRouter("TopazRouter", await distributor.getAddress()), "does not expose the Topaz router");
  });
});