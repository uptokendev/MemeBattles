import { expect } from "chai";
import { ethers } from "hardhat";
import type { LaunchFactory, LaunchCampaign, LaunchToken, MockRouter } from "../typechain-types";
import { deployRoutedLaunchFactory } from "./helpers/deployRouting";

const DEAD = "0x000000000000000000000000000000000000dEaD";

const request = (overrides: Record<string, unknown> = {}) => ({
  name: "Test Token",
  symbol: "TEST",
  logoURI: "ipfs://logo-hash",
  xAccount: "",
  website: "",
  extraLink: "",
  basePrice: 0n,
  priceSlope: 0n,
  graduationTarget: 0n,
  lpReceiver: ethers.ZeroAddress,
  ...overrides,
});

describe("Launchpad end-to-end", function () {
  async function deployFactoryAndRouter() {
    const [deployer, creator, trader, other] = await ethers.getSigners();
    const { dexRouter, factory } = await deployRoutedLaunchFactory(deployer);
    await factory.connect(deployer).enableLive();

    return {
      deployer,
      creator,
      trader,
      other,
      router: dexRouter as unknown as MockRouter,
      factory: factory as unknown as LaunchFactory,
    };
  }

  async function createCampaign(factory: LaunchFactory, creator: any, overrides: Record<string, unknown> = {}) {
    await factory.connect(creator).createCampaign(request(overrides) as any);
    const info = await factory.getCampaign((await factory.campaignsCount()) - 1n);
    const campaign = (await ethers.getContractAt("LaunchCampaign", info.campaign)) as unknown as LaunchCampaign;
    const token = (await ethers.getContractAt("LaunchToken", info.token)) as unknown as LaunchToken;
    return { info, campaign, token };
  }

  it("deploys factory with default config and creates a campaign with correct params", async () => {
    const { creator, router, factory } = await deployFactoryAndRouter();

    const cfg = await factory.config();
    expect(cfg.totalSupply).to.equal(ethers.parseUnits("1000000000", 18));
    expect(cfg.curveBps).to.equal(8800n);
    expect(cfg.liquidityTokenBps).to.equal(1000n);
    expect(cfg.basePrice).to.equal(50_000_000_000_000n);
    expect(cfg.priceSlope).to.equal(1_000_000_000n);
    expect(cfg.graduationTarget).to.equal(ethers.parseEther("50"));
    expect(cfg.liquidityBps).to.equal(8000n);

    const custom = request({
      name: "Test Token",
      symbol: "TEST",
      logoURI: "ipfs://logo-hash",
      xAccount: "https://x.com/test",
      website: "https://example.com",
      extraLink: "https://t.me/test",
      basePrice: ethers.parseEther("0.0000005"),
      priceSlope: ethers.parseEther("0.0000000001"),
      graduationTarget: ethers.parseEther("100"),
      lpReceiver: creator.address,
    });

    await factory.connect(creator).createCampaign(custom as any);
    expect(await factory.campaignsCount()).to.equal(1n);

    const info = await factory.getCampaign(0);
    const campaign = (await ethers.getContractAt("LaunchCampaign", info.campaign)) as unknown as LaunchCampaign;
    const token = (await ethers.getContractAt("LaunchToken", info.token)) as unknown as LaunchToken;

    expect(info.creator).to.equal(creator.address);
    expect(info.name).to.equal(custom.name);
    expect(info.symbol).to.equal(custom.symbol);
    expect(info.logoURI).to.equal(custom.logoURI);
    expect(info.website).to.equal(custom.website);
    expect(info.xAccount).to.equal(custom.xAccount);
    expect(info.extraLink).to.equal(custom.extraLink);

    expect(await campaign.basePrice()).to.equal(custom.basePrice);
    expect(await campaign.priceSlope()).to.equal(custom.priceSlope);
    expect(await campaign.graduationTarget()).to.equal(custom.graduationTarget);
    expect(await campaign.liquidityBps()).to.equal(cfg.liquidityBps);
    expect(await campaign.protocolFeeBps()).to.equal(await factory.protocolFeeBps());
    expect(await campaign.router()).to.equal(await router.getAddress());
    expect(await campaign.lpReceiver()).to.equal(DEAD);
    expect(await campaign.sold()).to.equal(0n);

    const totalSupply = await campaign.totalSupply();
    const curveSupply = await campaign.curveSupply();
    const liquiditySupply = await campaign.liquiditySupply();
    const creatorReserve = await campaign.creatorReserve();

    expect(totalSupply).to.equal(cfg.totalSupply);
    expect(curveSupply).to.equal((cfg.totalSupply * cfg.curveBps) / 10_000n);
    expect(liquiditySupply).to.equal((cfg.totalSupply * cfg.liquidityTokenBps) / 10_000n);
    expect(creatorReserve).to.equal(totalSupply - curveSupply - liquiditySupply);
    expect(await token.totalSupply()).to.equal(totalSupply);
    expect(await token.balanceOf(await campaign.getAddress())).to.equal(totalSupply);
  });

  it("computes quotes, allows buys/sells, and updates price and sold correctly", async () => {
    const { creator, trader, factory } = await deployFactoryAndRouter();

    await factory.setConfig({
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,
      liquidityTokenBps: 1000n,
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("10"),
      liquidityBps: 8000n,
    });

    const { campaign, token } = await createCampaign(factory, creator, { name: "Quote Token", symbol: "QUO" });

    const initialPrice = await campaign.currentPrice();
    expect(initialPrice).to.equal(await campaign.basePrice());
    await expect(campaign.quoteBuyExactTokens(0)).to.be.revertedWith("zero amount");

    const buyAmount = ethers.parseUnits("10", 18);
    const cost = await campaign.quoteBuyExactTokens(buyAmount);
    await expect(campaign.connect(trader).buyExactTokens(buyAmount, cost + 1n, { value: cost + 1n }))
      .to.emit(campaign, "TokensPurchased")
      .withArgs(trader.address, buyAmount, cost);

    expect(await token.balanceOf(trader.address)).to.equal(buyAmount);
    expect(await campaign.sold()).to.equal(buyAmount);
    expect(await campaign.currentPrice()).to.be.gt(initialPrice);

    await expect(campaign.quoteSellExactTokens(0)).to.be.revertedWith("zero amount");
    await expect(campaign.quoteSellExactTokens(buyAmount + 1n)).to.be.revertedWith("exceeds sold");

    const sellAmount = ethers.parseUnits("4", 18);
    const payout = await campaign.quoteSellExactTokens(sellAmount);
    await token.connect(trader).approve(await campaign.getAddress(), sellAmount);
    await expect(campaign.connect(trader).sellExactTokens(sellAmount, 0))
      .to.emit(campaign, "TokensSold")
      .withArgs(trader.address, sellAmount, payout);

    expect(await campaign.sold()).to.equal(buyAmount - sellAmount);
  });

  it("enforces pre-launch lock: no user transfers or manual LP before finalize", async () => {
    const { creator, trader, other, router, factory } = await deployFactoryAndRouter();
    const { campaign, token } = await createCampaign(factory, creator, {
      name: "Locked Token",
      symbol: "LOCK",
      basePrice: ethers.parseEther("0.0000005"),
      priceSlope: ethers.parseEther("0.0000000001"),
      graduationTarget: ethers.parseEther("100"),
      lpReceiver: creator.address,
    });

    expect(await token.tradingEnabled()).to.equal(false);

    const buyAmount = ethers.parseUnits("1000", 18);
    const cost = await campaign.quoteBuyExactTokens(buyAmount);
    await campaign.connect(trader).buyExactTokens(buyAmount, cost + 1n, { value: cost + 1n });

    await expect(token.connect(trader).transfer(other.address, buyAmount / 10n)).to.be.revertedWithCustomError(token, "TradingNotEnabled");

    const lpAmount = await token.balanceOf(trader.address);
    await token.connect(trader).approve(await router.getAddress(), lpAmount);
    await expect(
      router
        .connect(trader)
        .addLiquidityETH(await token.getAddress(), lpAmount, 0n, 0n, trader.address, Math.floor(Date.now() / 1000) + 3600, {
          value: ethers.parseEther("0.1"),
        })
    ).to.be.revertedWithCustomError(token, "TradingNotEnabled");
  });

  it("auto-finalizes, distributes liquidity/reserve, opens trading, and blocks further curve trades", async () => {
    const { creator, trader, other, router, factory } = await deployFactoryAndRouter();

    await factory.setConfig({
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,
      liquidityTokenBps: 1000n,
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("10"),
      liquidityBps: 8000n,
    });

    const { campaign, token } = await createCampaign(factory, creator, { name: "Distrib Token", symbol: "DST" });

    const totalSupply = await campaign.totalSupply();
    const curveSupply = await campaign.curveSupply();
    const liquiditySupply = await campaign.liquiditySupply();
    const creatorReserve = await campaign.creatorReserve();

    const cost = await campaign.quoteBuyExactTokens(curveSupply);
    await expect(campaign.connect(trader).buyExactTokens(curveSupply, cost + 1n, { value: cost + 1n }))
      .to.emit(campaign, "CampaignFinalized")
      .and.to.emit(router, "LiquidityAdded");

    expect(await campaign.launched()).to.equal(true);
    expect(await token.tradingEnabled()).to.equal(true);
    expect(await token.balanceOf(await campaign.getAddress())).to.equal(0n);
    expect(await token.balanceOf(await router.getAddress())).to.equal(liquiditySupply);
    expect(await token.balanceOf(creator.address)).to.equal(creatorReserve);

    const sold = await campaign.sold();
    expect(await token.totalSupply()).to.equal(totalSupply - (curveSupply - sold));

    const transferAmount = (await token.balanceOf(trader.address)) / 2n;
    await token.connect(trader).transfer(other.address, transferAmount);
    expect(await token.balanceOf(other.address)).to.equal(transferAmount);

    await expect(campaign.connect(trader).buyExactTokens(ethers.parseUnits("1", 18), ethers.parseEther("1"), { value: ethers.parseEther("1") })).to.be.revertedWith(
      "campaign launched"
    );

    await token.connect(trader).approve(await campaign.getAddress(), ethers.parseUnits("1", 18));
    await expect(campaign.connect(trader).sellExactTokens(ethers.parseUnits("1", 18), 0)).to.be.revertedWith("campaign launched");
  });

  it("full workflow: campaign creation, multi-user buys/sells, finalize and LP", async () => {
    const { deployer, router, factory } = await deployFactoryAndRouter();
    const [, creator, alice, bob, carol] = await ethers.getSigners();

    await factory.setConfig({
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,
      liquidityTokenBps: 1000n,
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("10"),
      liquidityBps: 8000n,
    });

    const { campaign, token } = await createCampaign(factory, creator, { name: "Scenario Token", symbol: "SCN" });
    const totalSupply = await campaign.totalSupply();
    const curveSupply = await campaign.curveSupply();
    const liquiditySupply = await campaign.liquiditySupply();
    const creatorReserve = await campaign.creatorReserve();

    const buyTokens = async (user: any, rawAmount: number) => {
      const amount = ethers.parseUnits(rawAmount.toString(), 18);
      const cost = await campaign.quoteBuyExactTokens(amount);
      await campaign.connect(user).buyExactTokens(amount, cost + 1n, { value: cost + 1n });
      return amount;
    };

    const sellTokens = async (user: any, rawAmount: number) => {
      const amount = ethers.parseUnits(rawAmount.toString(), 18);
      const payout = await campaign.quoteSellExactTokens(amount);
      await token.connect(user).approve(await campaign.getAddress(), amount);
      await expect(campaign.connect(user).sellExactTokens(amount, 0)).to.emit(campaign, "TokensSold").withArgs(user.address, amount, payout);
    };

    await buyTokens(alice, 10);
    await buyTokens(bob, 20);
    await buyTokens(carol, 5);
    await sellTokens(alice, 3);
    await sellTokens(bob, 5);

    const sumBal = (await token.balanceOf(alice.address)) + (await token.balanceOf(bob.address)) + (await token.balanceOf(carol.address));
    expect(await campaign.sold()).to.equal(sumBal);
    expect((await token.balanceOf(await campaign.getAddress())) + sumBal).to.equal(totalSupply);
    expect(await campaign.sold()).to.be.lte(curveSupply);

    const target = await campaign.graduationTarget();
    const campaignAddr = await campaign.getAddress();
    const campaignEthBal = await ethers.provider.getBalance(campaignAddr);
    if (campaignEthBal < target) await deployer.sendTransaction({ to: campaignAddr, value: target - campaignEthBal });

    await expect(campaign.connect(alice).finalize(0, 0)).to.be.reverted;

    const triggerBuy = ethers.parseUnits("1", 18);
    const triggerCost = await campaign.quoteBuyExactTokens(triggerBuy);
    await expect(campaign.connect(alice).buyExactTokens(triggerBuy, triggerCost + 1n, { value: triggerCost + 1n }))
      .to.emit(campaign, "CampaignFinalized")
      .and.to.emit(router, "LiquidityAdded");

    expect(await campaign.launched()).to.equal(true);
    expect(await token.tradingEnabled()).to.equal(true);
    expect(await token.balanceOf(campaignAddr)).to.equal(0n);
    expect(await token.balanceOf(await router.getAddress())).to.equal(liquiditySupply);
    expect(await token.balanceOf(creator.address)).to.equal(creatorReserve);

    const soldFinal = await campaign.sold();
    expect(await token.totalSupply()).to.equal(totalSupply - (curveSupply - soldFinal));

    await token.connect(alice).transfer(bob.address, ethers.parseUnits("2", 18));
    expect(
      (await token.balanceOf(alice.address)) +
        (await token.balanceOf(bob.address)) +
        (await token.balanceOf(carol.address)) +
        creatorReserve +
        liquiditySupply
    ).to.equal(await token.totalSupply());
  });
});
