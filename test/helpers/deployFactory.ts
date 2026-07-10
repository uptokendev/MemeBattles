import { ethers } from "hardhat";

export async function deployLaunchFactory(routerAddress: string, treasuryRouterAddress: string) {
  const Campaign = await ethers.getContractFactory("LaunchCampaign");
  const campaignImplementation = await Campaign.deploy();
  await campaignImplementation.waitForDeployment();

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(
    routerAddress,
    treasuryRouterAddress,
    await campaignImplementation.getAddress()
  );
  await factory.waitForDeployment();

  return { factory, campaignImplementation };
}
