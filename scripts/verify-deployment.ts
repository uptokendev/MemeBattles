import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

function assertEq(label: string, actual: string, expected: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`[verify] ${label}: ok`);
}

function assertTrue(label: string, value: boolean) {
  if (!value) throw new Error(`${label}: expected true`);
  console.log(`[verify] ${label}: ok`);
}

async function assertCode(label: string, address: string) {
  if (!address || address === ethers.ZeroAddress) throw new Error(`${label}: missing address`);
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label}: ${address} has no code on ${network.name}`);
  console.log(`[verify] ${label} code: ok`);
}

export function loadDeployment() {
  const file = process.env.DEPLOYMENT_FILE
    ? path.resolve(process.env.DEPLOYMENT_FILE)
    : path.join(__dirname, "..", "deployments", `${network.name}.json`);

  if (!fs.existsSync(file)) {
    throw new Error(`Deployment file not found: ${file}. Run scripts/deploy.ts first or set DEPLOYMENT_FILE.`);
  }

  const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`[verify] Loaded deployment: ${file}`);
  return deployment;
}

export async function verifyDeployment(deployment: any) {
  const contracts = deployment.contracts ?? {};
  const postDeployActions: string[] = deployment.postDeployActions ?? [];

  if (deployment.network && deployment.network !== network.name) {
    console.warn(`[verify] Deployment file network is ${deployment.network}, current Hardhat network is ${network.name}.`);
  }

  const expectedChainId = BigInt(deployment.chainId);
  const actualChainId = (await ethers.provider.getNetwork()).chainId;
  if (expectedChainId !== actualChainId) {
    throw new Error(`chainId: expected ${expectedChainId}, got ${actualChainId}`);
  }
  console.log(`[verify] chainId ${actualChainId}: ok`);

  const requiredContracts = [
    "TreasuryVaultV2",
    "TreasuryRouter",
    "RecruiterRewardsVault",
    "CommunityRewardsVault",
    "ProtocolRevenueVault",
    "CreatorRegistry",
    "RiskRegistry",
    "GraduationOracle",
    "LaunchCampaignImplementation",
    "LaunchFactory",
    "PermanentLpLocker",
    "UPVoteTreasury",
  ];

  for (const name of requiredContracts) {
    await assertCode(name, contracts[name]);
  }

  if (deployment.topazRouter) await assertCode("TopazRouter", deployment.topazRouter);
  if (deployment.graduationPriceFeed) await assertCode("GraduationPriceFeed", deployment.graduationPriceFeed);

  const factory = await ethers.getContractAt("LaunchFactory", contracts.LaunchFactory);
  assertEq("factory.router", await factory.router(), deployment.topazRouter ?? deployment.router);
  assertEq("factory.feeRecipient", await factory.feeRecipient(), contracts.TreasuryRouter);
  assertEq("factory.leagueReceiver", await factory.leagueReceiver(), contracts.TreasuryRouter);
  assertEq("factory.campaignImplementation", await factory.campaignImplementation(), contracts.LaunchCampaignImplementation);
  assertEq("factory.graduationOracle", await factory.graduationOracle(), contracts.GraduationOracle);
  assertEq("factory.permanentLpLocker", await factory.permanentLpLocker(), contracts.PermanentLpLocker);
  assertEq("factory.creatorRegistry", await factory.creatorRegistry(), contracts.CreatorRegistry);
  assertEq("factory.riskRegistry", await factory.riskRegistry(), contracts.RiskRegistry);

  const locker = await ethers.getContractAt("PermanentLpLocker", contracts.PermanentLpLocker);
  assertEq("permanentLpLocker.admin", await locker.admin(), contracts.LaunchFactory);

  const creatorRegistry = await ethers.getContractAt("CreatorRegistry", contracts.CreatorRegistry);
  assertTrue("creatorRegistry.launchRecorder(factory)", await creatorRegistry.launchRecorder(contracts.LaunchFactory));
  assertEq("creatorRegistry.owner", await creatorRegistry.owner(), deployment.security?.registryOwner ?? deployment.treasurySafe);

  const riskRegistry = await ethers.getContractAt("RiskRegistry", contracts.RiskRegistry);
  assertEq("riskRegistry.owner", await riskRegistry.owner(), deployment.security?.registryOwner ?? deployment.treasurySafe);

  const oracle = await ethers.getContractAt("GraduationOracle", contracts.GraduationOracle);
  if (deployment.graduationPriceFeed) assertEq("graduationOracle.priceFeed", await oracle.priceFeed(), deployment.graduationPriceFeed);
  if (deployment.graduationMaxPriceAge !== null && deployment.graduationMaxPriceAge !== undefined) {
    const actualMaxAge = await oracle.maxPriceAge();
    if (actualMaxAge !== BigInt(deployment.graduationMaxPriceAge)) {
      throw new Error(`graduationOracle.maxPriceAge: expected ${deployment.graduationMaxPriceAge}, got ${actualMaxAge}`);
    }
    console.log("[verify] graduationOracle.maxPriceAge: ok");
  }

  const treasuryRouter = await ethers.getContractAt("TreasuryRouter", contracts.TreasuryRouter);
  assertEq("treasuryRouter.admin", await treasuryRouter.admin(), deployment.treasurySafe);
  assertEq("treasuryRouter.activeVault", await treasuryRouter.activeVault(), contracts.TreasuryVaultV2);

  const vault = await ethers.getContractAt("TreasuryVaultV2", contracts.TreasuryVaultV2);
  assertEq("treasuryVault.multisig", await vault.multisig(), deployment.treasurySafe);

  if (postDeployActions.length === 0) {
    assertEq("treasuryRouter.recruiterRewardsVault", await treasuryRouter.recruiterRewardsVault(), contracts.RecruiterRewardsVault);
    assertEq("treasuryRouter.communityRewardsVault", await treasuryRouter.communityRewardsVault(), contracts.CommunityRewardsVault);
    assertEq("treasuryRouter.protocolRevenueVault", await treasuryRouter.protocolRevenueVault(), contracts.ProtocolRevenueVault);

    const communityVault = await ethers.getContractAt("CommunityRewardsVault", contracts.CommunityRewardsVault);
    assertEq("communityRewardsVault.router", await communityVault.router(), contracts.TreasuryRouter);
  } else {
    console.warn("[verify] Deferred multisig/admin actions remain:");
    for (const action of postDeployActions) console.warn(`[verify] - ${action}`);
  }

  console.log("[verify] Deployment wiring verification complete.");
}

async function main() {
  await verifyDeployment(loadDeployment());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
