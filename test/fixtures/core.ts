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
  treasuryVault: any;
  treasuryRouter: any;
  campaignImplementation: any;
  factory: any;
};

export async function deployCoreFixture(): Promise<CoreFixture> {
  const [owner, creator, alice, bob, feeRecipient, lpReceiver] = await ethers.getSigners();

  const V2Factory = await ethers.getContractFactory("MockV2Factory");
  const v2factory = await V2Factory.deploy();
  await v2factory.waitForDeployment();

  const Router = await ethers.getContractFactory("MockRouter");
  // Use a non-zero WETH placeholder to better mirror mainnet router behavior.
  const router = await Router.deploy(await v2factory.getAddress(), await owner.getAddress());
  await router.waitForDeployment();

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

  const Campaign = await ethers.getContractFactory("LaunchCampaign");
  const campaignImplementation = await Campaign.deploy();
  await campaignImplementation.waitForDeployment();

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(
    await router.getAddress(),
    await treasuryRouter.getAddress(),
    await campaignImplementation.getAddress()
  );
  await factory.waitForDeployment();

  // Use small, test-friendly config
  await factory.connect(owner).setConfig({
    totalSupply: ethers.parseEther("1000"),      // 1000 tokens
    curveBps: 5000,                              // 50% curve
    liquidityTokenBps: 4000,                     // 40% LP
    basePrice: 10n ** 12n,                       // 0.000001 native per token (scaled)
    priceSlope: 10n ** 9n,                       // slope
    graduationTarget: ethers.parseEther("1"),    // 1 native target
    liquidityBps: 8000                           // 80% of raised (after finalize fee) to LP
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
    treasuryVault,
    treasuryRouter,
    campaignImplementation,
    factory,
  };
}
