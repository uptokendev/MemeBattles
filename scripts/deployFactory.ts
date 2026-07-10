import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${await deployer.getAddress()}`);

  let routerAddress = (process.env.ROUTER_ADDRESS ?? "").trim();
  let treasuryRouterAddress = (process.env.TREASURY_ROUTER_ADDRESS ?? "").trim();
  const deployMock = process.env.DEPLOY_MOCK_ROUTER === "true";

  if (!routerAddress && deployMock) {
    const wrapped = (process.env.MOCK_ROUTER_WRAPPED ?? deployer.address).trim();
    console.log(`Deploying MockRouter with wrapped token ${wrapped}...`);
    const MockV2Factory = await ethers.getContractFactory("MockV2Factory");
    const mockV2Factory = await MockV2Factory.deploy();
    await mockV2Factory.waitForDeployment();

    const MockRouter = await ethers.getContractFactory("MockRouter");
    const mockRouter = await MockRouter.deploy(await mockV2Factory.getAddress(), wrapped);
    await mockRouter.waitForDeployment();
    routerAddress = await mockRouter.getAddress();
    console.log(`MockRouter deployed at ${routerAddress}`);
  }

  if (!treasuryRouterAddress && deployMock) {
    console.log("Deploying mock TreasuryVault and TreasuryRouter...");
    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    const vault = await TreasuryVault.deploy(deployer.address);
    await vault.waitForDeployment();

    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    const treasuryRouter = await TreasuryRouter.deploy(deployer.address, await vault.getAddress(), 24 * 60 * 60);
    await treasuryRouter.waitForDeployment();
    treasuryRouterAddress = await treasuryRouter.getAddress();
    console.log(`TreasuryRouter deployed at ${treasuryRouterAddress}`);
  }

  if (!routerAddress) {
    throw new Error(
      "Missing ROUTER_ADDRESS. Provide a Pancake router address or set DEPLOY_MOCK_ROUTER=true for local tests."
    );
  }

  if (!treasuryRouterAddress) {
    throw new Error(
      "Missing TREASURY_ROUTER_ADDRESS. Provide the TreasuryRouter address or set DEPLOY_MOCK_ROUTER=true for local tests."
    );
  }

  console.log("Deploying locked LaunchCampaign implementation...");
  const LaunchCampaign = await ethers.getContractFactory("LaunchCampaign");
  const implementation = await LaunchCampaign.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  console.log(`LaunchCampaign implementation deployed at ${implementationAddress}`);

  console.log(`Deploying LaunchFactory with router ${routerAddress} and treasury router ${treasuryRouterAddress}...`);
  const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
  const factory = await LaunchFactory.deploy(routerAddress, treasuryRouterAddress, implementationAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`LaunchFactory deployed at ${factoryAddress}`);

  const protocolFeeBpsRaw = (process.env.PROTOCOL_FEE_BPS ?? "").trim();
  if (protocolFeeBpsRaw) {
    const feeValue = Number(protocolFeeBpsRaw);
    if (!Number.isFinite(feeValue) || feeValue < 0 || feeValue > 1000) {
      throw new Error("PROTOCOL_FEE_BPS must be between 0 and 1000.");
    }
    console.log(`Setting protocol fee to ${feeValue} bps...`);
    const tx = await factory.setProtocolFee(feeValue);
    await tx.wait();
  }

  console.log("Deployment complete. Export these addresses for the frontend:");
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`CAMPAIGN_IMPLEMENTATION_ADDRESS=${implementationAddress}`);
  if (deployMock) {
    console.log(`MOCK_ROUTER_ADDRESS=${routerAddress}`);
    console.log(`TREASURY_ROUTER_ADDRESS=${treasuryRouterAddress}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
