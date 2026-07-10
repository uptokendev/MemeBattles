import { expect } from "chai";
import { ethers } from "hardhat";
import type { LaunchCampaign, LaunchToken } from "../typechain-types";
import { deployCoreFixture } from "./fixtures/core";

const DEAD = "0x000000000000000000000000000000000000dEaD";

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Token",
    symbol: "TEST",
    logoURI: "ipfs://logo-hash",
    xAccount: "",
    website: "",
    extraLink: "",
    basePrice: 0n,
    priceSlope: 0n,
    graduationTarget: ethers.parseEther("100"),
    lpReceiver: ethers.ZeroAddress,
    initialBuyBnbWei: 0n,
    ...overrides,
  };
}

async function createCampaign(factory: any, creator: any, overrides: Record<string, unknown> = {}) {
  await factory.connect(creator).createCampaign(baseRequest(overrides) as any);
  const info = await factory.getCampaign(0);
  const campaign = (await ethers.getContractAt("LaunchCampaign", info.campaign)) as unknown as LaunchCampaign;
  const token = (await ethers.getContractAt("LaunchToken", info.token)) as unknown as LaunchToken;
  return { info, campaign, token };
}

describe("Launchpad end-to-end", function () {
  it("creates a clone campaign with correct params and locked LP receiver", async () => {
    const { creator, router, factory, treasuryRouter, campaignImplementation } = await deployCoreFixture();
    const cfg = await factory.config();

    const requestOverrides = {
      name: "Custom Token",
      symbol: "CUS",
      logoURI: "ipfs://custom-logo",
      xAccount: "https://x.com/test",
      website: "https://example.com",
      extraLink: "https://t.me/test",
      basePrice: ethers.parseEther("0.0000005"),
      priceSlope: ethers.parseEther("0.0000000001"),
      graduationTarget: ethers.parseEther("100"),
    };

    const { info, campaign, token } = await createCampaign(factory, creator, requestOverrides);

    expect(await factory.campaignsCount()).to.equal(1n);
    expect(await factory.campaignImplementation()).to.equal(await campaignImplementation.getAddress());
    expect(await factory.feeRecipient()).to.equal(await treasuryRouter.getAddress());
    expect(await factory.leagueReceiver()).to.equal(await treasuryRouter.getAddress());

    expect(info.creator).to.equal(creator.address);
    expect(info.name).to.equal(requestOverrides.name);
    expect(info.symbol).to.equal(requestOverrides.symbol);
    expect(info.logoURI).to.equal(requestOverrides.logoURI);
    expect(info.website).to.equal(requestOverrides.website);
    expect(info.xAccount).to.equal(requestOverrides.xAccount);
    expect(info.extraLink).to.equal(requestOverrides.extraLink);

    expect(await campaign.owner()).to.equal(creator.address);
    expect(await campaign.factory()).to.equal(await factory.getAddress());
    expect(await campaign.basePrice()).to.equal(requestOverrides.basePrice);
    expect(await campaign.priceSlope()).to.equal(requestOverrides.priceSlope);
    expect(await campaign.graduationTarget()).to.equal(requestOverrides.graduationTarget);
    expect(await campaign.liquidityBps()).to.equal(cfg.liquidityBps);
    expect(await campaign.protocolFeeBps()).to.equal(await factory.protocolFeeBps());
    expect(await campaign.router()).to.equal(await router.getAddress());
    expect(await campaign.lpReceiver()).to.equal(DEAD);

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
    const { creator, alice: trader, factory } = await deployCoreFixture();
    const { campaign, token } = await createCampaign(factory, creator);

    const initialPrice = await campaign.currentPrice();
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
    const { creator, alice: trader, bob: other, router, factory } = await deployCoreFixture();
    const { campaign, token } = await createCampaign(factory, creator);

    expect(await token.tradingEnabled()).to.equal(false);

    const buyAmount = ethers.parseUnits("100", 18);
    const cost = await campaign.quoteBuyExactTokens(buyAmount);
    await campaign.connect(trader).buyExactTokens(buyAmount, cost + 1n, { value: cost + 1n });

    await expect(token.connect(trader).transfer(other.address, buyAmount / 10n)).to.be.revertedWithCustomError(
      token,
      "TradingNotEnabled"
    );

    const lpAmount = await token.balanceOf(trader.address);
    await token.connect(trader).approve(await router.getAddress(), lpAmount);

    await expect(
      router
        .connect(trader)
        .addLiquidityETH(
          await token.getAddress(),
          lpAmount,
          0n,
          0n,
          trader.address,
          Math.floor(Date.now() / 1000) + 3600,
          { value: ethers.parseEther("0.1") }
        )
    ).to.be.revertedWithCustomError(token, "TradingNotEnabled");
  });

  it("auto-finalizes when the curve sells out", async () => {
    const { creator, alice: trader, router, factory } = await deployCoreFixture();
    const { campaign, token } = await createCampaign(factory, creator, { graduationTarget: ethers.parseEther("1000") });

    const curveSupply = await campaign.curveSupply();
    const cost = await campaign.quoteBuyExactTokens(curveSupply);

    await expect(campaign.connect(trader).buyExactTokens(curveSupply, cost + 1n, { value: cost + 1n }))
      .to.emit(campaign, "CampaignFinalized")
      .and.to.emit(router, "LiquidityAdded");

    expect(await campaign.launched()).to.equal(true);
    expect(await token.tradingEnabled()).to.equal(true);
    await expect(campaign.connect(creator).finalize(0, 0)).to.be.revertedWith("finalized");
  });

  it("after finalize, tokens and LP are distributed correctly and trading is open", async () => {
    const { creator, alice: trader, bob: other, router, factory } = await deployCoreFixture();
    const { campaign, token } = await createCampaign(factory, creator, { graduationTarget: ethers.parseEther("1000") });

    const totalSupply = await campaign.totalSupply();
    const curveSupply = await campaign.curveSupply();
    const liquiditySupply = await campaign.liquiditySupply();
    const creatorReserve = await campaign.creatorReserve();

    const cost = await campaign.quoteBuyExactTokens(curveSupply);
    await campaign.connect(trader).buyExactTokens(curveSupply, cost + 1n, { value: cost + 1n });

    expect(await token.tradingEnabled()).to.equal(true);
    expect(await token.balanceOf(await campaign.getAddress())).to.equal(0n);
    expect(await token.balanceOf(await router.getAddress())).to.equal(liquiditySupply);
    expect(await token.balanceOf(creator.address)).to.equal(creatorReserve);

    const sold = await campaign.sold();
    const expectedTotalSupply = totalSupply - (curveSupply - sold);
    expect(await token.totalSupply()).to.equal(expectedTotalSupply);

    const transferAmount = (await token.balanceOf(trader.address)) / 2n;
    await token.connect(trader).transfer(other.address, transferAmount);
    expect(await token.balanceOf(other.address)).to.equal(transferAmount);

    await expect(
      campaign.connect(trader).buyExactTokens(ethers.parseUnits("1", 18), ethers.parseEther("1"), {
        value: ethers.parseEther("1"),
      })
    ).to.be.revertedWith("campaign launched");

    await token.connect(trader).approve(await campaign.getAddress(), ethers.parseUnits("1", 18));
    await expect(campaign.connect(trader).sellExactTokens(ethers.parseUnits("1", 18), 0)).to.be.revertedWith(
      "campaign launched"
    );
  });
});
