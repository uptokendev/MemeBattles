import { ethers } from "hardhat";
import { deployLaunchFactory } from "./deployFactory";

export async function deployMockDexRouter(wrappedAddress: string) {
  const TopazFactory = await ethers.getContractFactory("MockTopazFactory");
  const v2factory = await TopazFactory.deploy();
  await v2factory.waitForDeployment();

  const DexRouter = await ethers.getContractFactory("MockTopazRouter");
  const dexRouter = await DexRouter.deploy(await v2factory.getAddress(), wrappedAddress);
  await dexRouter.waitForDeployment();

  return { v2factory, dexRouter };
}

export async function deployConfiguredTreasuryRouter(adminAddress: string) {
  const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
  const leagueVault = await AcceptingReceiver.deploy();
  const recruiterVault = await AcceptingReceiver.deploy();
  const protocolVault = await AcceptingReceiver.deploy();
  await Promise.all([
    leagueVault.waitForDeployment(),
    recruiterVault.waitForDeployment(),
    protocolVault.waitForDeployment(),
  ]);

  const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
  const treasuryRouter = await TreasuryRouter.deploy(adminAddress, await leagueVault.getAddress(), 3600);
  await treasuryRouter.waitForDeployment();

  const CommunityRewardsVault = await ethers.getContractFactory("CommunityRewardsVault");
  const communityVault = await CommunityRewardsVault.deploy(adminAddress, await treasuryRouter.getAddress());
  await communityVault.waitForDeployment();

  await treasuryRouter.setRecruiterRewardsVault(await recruiterVault.getAddress());
  await treasuryRouter.setCommunityRewardsVault(await communityVault.getAddress());
  await treasuryRouter.setProtocolRevenueVault(await protocolVault.getAddress());

  return { treasuryRouter, leagueVault, recruiterVault, protocolVault, communityVault };
}

export async function deployRoutedLaunchFactory(admin: any) {
  const { dexRouter, v2factory } = await deployMockDexRouter(await admin.getAddress());
  const routing = await deployConfiguredTreasuryRouter(await admin.getAddress());
  const { factory, campaignImplementation } = await deployLaunchFactory(
    await dexRouter.getAddress(),
    await routing.treasuryRouter.getAddress()
  );

  return { dexRouter, v2factory, ...routing, factory, campaignImplementation };
}
