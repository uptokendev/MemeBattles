import { expect } from "chai";
import { ethers } from "hardhat";
import { deployConfiguredTreasuryRouter } from "./helpers/deployRouting";
import { deployLaunchFactory } from "./helpers/deployFactory";

function launchRequest(overrides: Record<string, unknown> = {}) {
  return {
    name: "Adapter Launch",
    symbol: "ADPT",
    logoURI: "ipfs://adapter",
    xAccount: "",
    website: "",
    extraLink: "",
    basePrice: 0n,
    priceSlope: 0n,
    graduationTarget: ethers.parseEther("1000"),
    lpReceiver: ethers.ZeroAddress,
    ...overrides,
  };
}

async function deployAdapterStack() {
  const [owner, creator, trader] = await ethers.getSigners();

  const TopazFactory = await ethers.getContractFactory("MockTopazFactory");
  const topazFactory = await TopazFactory.deploy();
  await topazFactory.waitForDeployment();

  // The adapter requires a deployed wrapped-native contract. The production-ABI mock only
  // uses its address for pool discovery, so a deployed pool mock is sufficient here.
  const WrappedNative = await ethers.getContractFactory("MockTopazPool");
  const wrappedNative = await WrappedNative.deploy();
  await wrappedNative.waitForDeployment();

  const ProductionRouter = await ethers.getContractFactory("MockTopazProductionRouter");
  const productionRouter = await ProductionRouter.deploy(
    await topazFactory.getAddress(),
    await wrappedNative.getAddress()
  );
  await productionRouter.waitForDeployment();

  const Adapter = await ethers.getContractFactory("TopazRouterAdapter");
  const adapter = await Adapter.deploy(await productionRouter.getAddress());
  await adapter.waitForDeployment();

  const routing = await deployConfiguredTreasuryRouter(await owner.getAddress());
  const { factory, campaignImplementation } = await deployLaunchFactory(
    await adapter.getAddress(),
    await routing.treasuryRouter.getAddress()
  );

  await factory.connect(owner).setRequireRouteAuthorization(false);
  await factory.connect(owner).setRequireAuthorizedTrading(false);
  await factory.connect(owner).setConfig({
    totalSupply: ethers.parseEther("1000"),
    curveBps: 5000,
    liquidityTokenBps: 4000,
    basePrice: 10n ** 12n,
    priceSlope: 10n ** 9n,
    graduationTarget: ethers.parseEther("1"),
    liquidityBps: 8000,
  });
  await factory.connect(owner).enableLive();

  return {
    owner,
    creator,
    trader,
    topazFactory,
    wrappedNative,
    productionRouter,
    adapter,
    factory,
    campaignImplementation,
    ...routing,
  };
}

describe("TopazRouterAdapter", function () {
  it("rejects missing production dependencies and exposes the production factory and wrapped native", async () => {
    const [owner] = await ethers.getSigners();
    const Adapter = await ethers.getContractFactory("TopazRouterAdapter");

    await expect(Adapter.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Adapter, "ZeroAddress");
    await expect(Adapter.deploy(await owner.getAddress())).to.be.revertedWithCustomError(Adapter, "ContractCodeMissing");

    const TopazFactory = await ethers.getContractFactory("MockTopazFactory");
    const topazFactory = await TopazFactory.deploy();
    await topazFactory.waitForDeployment();

    const ProductionRouter = await ethers.getContractFactory("MockTopazProductionRouter");
    const missingFactory = await ProductionRouter.deploy(ethers.ZeroAddress, await topazFactory.getAddress());
    await missingFactory.waitForDeployment();
    await expect(Adapter.deploy(await missingFactory.getAddress())).to.be.revertedWithCustomError(
      Adapter,
      "InvalidTopazFactory"
    );

    const missingWrapped = await ProductionRouter.deploy(await topazFactory.getAddress(), ethers.ZeroAddress);
    await missingWrapped.waitForDeployment();
    await expect(Adapter.deploy(await missingWrapped.getAddress())).to.be.revertedWithCustomError(
      Adapter,
      "InvalidWrappedNative"
    );

    const valid = await deployAdapterStack();
    expect(await valid.adapter.poolFactory()).to.equal(await valid.topazFactory.getAddress());
    expect(await valid.adapter.WETH()).to.equal(await valid.wrappedNative.getAddress());
    expect(await valid.adapter.topazRouter()).to.equal(await valid.productionRouter.getAddress());
  });

  it("graduates through the production ABI, mints LP to the locker, and leaves no assets in the adapter", async () => {
    const { creator, trader, topazFactory, wrappedNative, productionRouter, adapter, factory } =
      await deployAdapterStack();

    await factory.connect(creator).createCampaign(launchRequest() as any);
    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);
    const locker = await ethers.getContractAt("PermanentLpLocker", await factory.permanentLpLocker());

    expect(await campaign.router()).to.equal(await adapter.getAddress());

    const curveSupply = await campaign.curveSupply();
    const cost = await campaign.quoteBuyExactTokens(curveSupply);

    await expect(campaign.connect(trader).buyExactTokens(curveSupply, cost + 1n, { value: cost + 1n }))
      .to.emit(campaign, "CampaignFinalized");

    const poolAddress = await topazFactory.getPool(
      await token.getAddress(),
      await wrappedNative.getAddress(),
      false
    );
    expect(poolAddress).to.not.equal(ethers.ZeroAddress);

    const pool = await ethers.getContractAt("MockTopazPool", poolAddress);
    const registration = await locker.poolInfo(poolAddress);
    const lockedLp = await locker.lockedBalance(poolAddress);

    expect(await campaign.launched()).to.equal(true);
    expect(await token.tradingEnabled()).to.equal(true);
    expect(registration.registered).to.equal(true);
    expect(registration.campaign).to.equal(await campaign.getAddress());
    expect(registration.creator).to.equal(await creator.getAddress());
    expect(registration.pool).to.equal(poolAddress);
    expect(registration.lockedLpAmount).to.equal(lockedLp);
    expect(lockedLp).to.be.gt(0n);
    expect(await pool.balanceOf(await locker.getAddress())).to.equal(lockedLp);

    expect(await token.balanceOf(await productionRouter.getAddress())).to.be.gt(0n);
    expect(await token.balanceOf(await adapter.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await adapter.getAddress())).to.equal(0n);
    expect(await token.allowance(await adapter.getAddress(), await productionRouter.getAddress())).to.equal(0n);
  });

  it("propagates production-router stable-pool rejection without retaining assets", async () => {
    const { owner, productionRouter, adapter } = await deployAdapterStack();

    const Token = await ethers.getContractFactory("LaunchToken");
    const token = await Token.deploy("Adapter Token", "ATKN", ethers.parseEther("100"), await owner.getAddress());
    await token.waitForDeployment();
    await token.connect(owner).mint(await owner.getAddress(), ethers.parseEther("10"));
    await token.connect(owner).enableTrading();

    const amount = ethers.parseEther("1");
    await token.connect(owner).approve(await adapter.getAddress(), amount);

    await expect(
      adapter.connect(owner).addLiquidityETH(
        await token.getAddress(),
        true,
        amount,
        amount,
        1n,
        await owner.getAddress(),
        (await ethers.provider.getBlock("latest"))!.timestamp + 60,
        { value: ethers.parseEther("1") }
      )
    ).to.be.revertedWithCustomError(productionRouter, "StablePoolUnsupported");

    expect(await token.balanceOf(await adapter.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await adapter.getAddress())).to.equal(0n);
    expect(await token.allowance(await adapter.getAddress(), await productionRouter.getAddress())).to.equal(0n);
  });
});