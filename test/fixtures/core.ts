import { ethers } from "hardhat";

export type CoreFixture = {
  owner: any;
  creator: any;
  alice: any;
  bob: any;
  feeRecipient: any;
  lpReceiver: any;
  router: any;
  v2factory: any;
  priceFeed: any;
  graduationOracle: any;
  treasuryVault: any;
  treasuryRouter: any;
  recruiterVault: any;
  communityVault: any;
  protocolVault: any;
  campaignImplementation: any;
  factory: any;
};

async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

export async function deployCoreFixture(): Promise<CoreFixture> {
  const [owner, creator, alice, bob, feeRecipient, lpReceiver] = await ethers.getSigners();

  const V2Factory = await ethers.getContractFactory("MockV2Factory");
  const v2factory = await V2Factory.deploy();
  await v2factory.waitForDeployment();

  const Router = await ethers.getContractFactory("MockRouter");
  // Use a non-zero WETH placeholder to better mirror mainnet router behavior.
  const router = await Router.deploy(await v2factory.getAddress(), await owner.getAddress());
  await router.waitForDeployment();

  const PriceFeed = await ethers.getContractFactory("MockUsdPriceFeed");
  const priceFeed = await PriceFeed.deploy(8);
  await priceFeed.waitForDeployment();
  const now = await latestTimestamp();
  await priceFeed.setRoundData(1n, ethers.parseUnits("1", 8), now, now, 1n);

  const GraduationOracle = await ethers.getContractFactory("GraduationOracle");
  const graduationOracle = await GraduationOracle.deploy(await priceFeed.getAddress(), 3600n);
  await graduationOracle.waitForDeployment();

  const TreasuryVault = await ethers.getContractFactory("TreasuryVaultV2");
  const treasuryVault = await TreasuryVault.deploy(await feeRecipient.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);
  await treasuryVault.waitForDeployment();

  const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
  const treasuryRouter = await TreasuryRouter.deploy(
    await owner.getAddress(),
    await treasuryVault.getAddress(),
    24 * 60 * 60
  );
  await treasuryRouter.waitForDeployment();

  const RecruiterVault = await ethers.getContractFactory("RecruiterRewardsVault");
  const recruiterVault = await RecruiterVault.deploy(await owner.getAddress());
  await recruiterVault.waitForDeployment();

  const CommunityVault = await ethers.getContractFactory("CommunityRewardsVault");
  const communityVault = await CommunityVault.deploy(await owner.getAddress(), await treasuryRouter.getAddress());
  await communityVault.waitForDeployment();

  const ProtocolVault = await ethers.getContractFactory("ProtocolRevenueVault");
  const protocolVault = await ProtocolVault.deploy(await owner.getAddress());
  await protocolVault.waitForDeployment();

  await treasuryRouter.connect(owner).setRecruiterRewardsVault(await recruiterVault.getAddress());
  await treasuryRouter.connect(owner).setCommunityRewardsVault(await communityVault.getAddress());
  await treasuryRouter.connect(owner).setProtocolRevenueVault(await protocolVault.getAddress());

  const Campaign = await ethers.getContractFactory("LaunchCampaign");
  const campaignImplementation = await Campaign.deploy();
  await campaignImplementation.waitForDeployment();

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(
    await router.getAddress(),
    await treasuryRouter.getAddress(),
    await campaignImplementation.getAddress(),
    await graduationOracle.getAddress()
  );
  await factory.waitForDeployment();

  // Use small, test-friendly config. With the fixture oracle at $1/native,
  // the 1 USD threshold maps to the old 1 native graduation target.
  await factory.connect(owner).setConfig({
    totalSupply: ethers.parseEther("1000"),
    curveBps: 5000,
    liquidityTokenBps: 4000,
    basePrice: 10n ** 12n,
    priceSlope: 10n ** 9n,
    graduationTarget: ethers.parseEther("1"),
    liquidityBps: 8000
  });

  // Tests assume the system is in Live Mode unless explicitly testing Prepare Mode.
  await factory.connect(owner).enableLive();

  return {
    owner,
    creator,
    alice,
    bob,
    feeRecipient: treasuryVault,
    lpReceiver,
    router,
    v2factory,
    priceFeed,
    graduationOracle,
    treasuryVault,
    treasuryRouter,
    recruiterVault,
    communityVault,
    protocolVault,
    campaignImplementation,
    factory,
  };
}
