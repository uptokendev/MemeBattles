import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { deployCoreFixture } from "./fixtures/core";

const baseCampaignRequest = (overrides: Record<string, unknown> = {}) => ({
  name: "CloseoutToken",
  symbol: "CLOSE",
  logoURI: "ipfs://closeout-logo",
  xAccount: "",
  website: "",
  extraLink: "",
  basePrice: 0n,
  priceSlope: 0n,
  graduationTarget: 0n,
  lpReceiver: ethers.ZeroAddress,
  ...overrides,
});

async function createCampaignFixture() {
  const fx = await deployCoreFixture();
  await fx.factory.connect(fx.creator).createCampaign(baseCampaignRequest() as any);
  const info = await fx.factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const token = await ethers.getContractAt("LaunchToken", info.token);
  return { ...fx, info, campaign, token };
}

async function createHighTargetCampaignFixture() {
  const fx = await deployCoreFixture();
  await fx.factory.connect(fx.creator).createCampaign(
    baseCampaignRequest({ graduationTarget: ethers.parseEther("100000") }) as any
  );
  const info = await fx.factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const token = await ethers.getContractAt("LaunchToken", info.token);
  return { ...fx, info, campaign, token };
}

async function createLowTargetCampaignFixture() {
  const fx = await deployCoreFixture();
  await fx.factory.connect(fx.creator).createCampaign(baseCampaignRequest({ graduationTarget: 1n }) as any);
  const info = await fx.factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const token = await ethers.getContractAt("LaunchToken", info.token);
  return { ...fx, info, campaign, token };
}

describe("LaunchCampaign closeout integration", function () {
  it("quoteBuyExactBnb returns zeros for zero input", async () => {
    const { campaign } = await loadFixture(createCampaignFixture);

    const quote = await campaign.quoteBuyExactBnb(0n);
    expect(quote.tokensOut).to.eq(0n);
    expect(quote.totalCostWei).to.eq(0n);
    expect(quote.feeWei).to.eq(0n);
  });

  it("buyExactBnb spends the quoted amount, refunds dust, and updates buyer counters", async () => {
    const { campaign, token, alice } = await loadFixture(createHighTargetCampaignFixture);
    const value = ethers.parseEther("0.01");
    const quote = await campaign.quoteBuyExactBnb(value);

    expect(quote.tokensOut).to.be.gt(0n);
    expect(quote.totalCostWei).to.be.gt(0n);
    expect(quote.totalCostWei).to.be.lte(value);

    await expect(campaign.connect(alice).buyExactBnb(quote.tokensOut, { value }))
      .to.emit(campaign, "TokensPurchased")
      .withArgs(await alice.getAddress(), quote.tokensOut, quote.totalCostWei);

    expect(await token.balanceOf(await alice.getAddress())).to.eq(quote.tokensOut);
    expect(await campaign.sold()).to.eq(quote.tokensOut);
    expect(await campaign.totalBuyVolumeWei()).to.eq(quote.totalCostWei - quote.feeWei);
    expect(await campaign.buyersCount()).to.eq(1n);
    expect(await campaign.hasBought(await alice.getAddress())).to.eq(true);
    expect(await campaign.launched()).to.eq(false);
  });

  it("buyExactBnb enforces minimum token output and non-zero executable buys", async () => {
    const { campaign, alice } = await loadFixture(createHighTargetCampaignFixture);
    const value = ethers.parseEther("0.005");
    const quote = await campaign.quoteBuyExactBnb(value);

    await expect(campaign.connect(alice).buyExactBnb(quote.tokensOut + 1n, { value })).to.be.revertedWith("slippage");
    await expect(campaign.connect(alice).buyExactBnb(0n, { value: 0n })).to.be.revertedWith("zero amount");
  });

  it("factory pause controls are owner-only and campaign pause blocks buys", async () => {
    const { factory, campaign, owner, alice } = await loadFixture(createHighTargetCampaignFixture);
    const amountOut = ethers.parseEther("1");
    const total = await campaign.quoteBuyExactTokens(amountOut);

    await expect(campaign.connect(owner).setPauseState(true, false, false, false)).to.be.revertedWithCustomError(
      campaign,
      "OnlyFactory"
    );
    await expect(factory.connect(alice).setCampaignPauses(await campaign.getAddress(), true, false, false, false)).to.be.revertedWithCustomError(
      factory,
      "OwnableUnauthorizedAccount"
    );

    await expect(factory.connect(owner).setCampaignPauses(await campaign.getAddress(), true, false, false, false))
      .to.emit(factory, "CampaignPauseUpdated")
      .withArgs(await campaign.getAddress(), true, false, false, false);

    await expect(campaign.connect(alice).buyExactTokens(amountOut, total, { value: total })).to.be.revertedWithCustomError(
      campaign,
      "CampaignPaused"
    );
  });

  it("buy and sell pause controls gate only their respective trade directions", async () => {
    const { factory, campaign, token, owner, alice } = await loadFixture(createHighTargetCampaignFixture);
    const amountOut = ethers.parseEther("2");
    const total = await campaign.quoteBuyExactTokens(amountOut);

    await factory.connect(owner).setCampaignPauses(await campaign.getAddress(), false, true, false, false);
    await expect(campaign.connect(alice).buyExactTokens(amountOut, total, { value: total })).to.be.revertedWithCustomError(
      campaign,
      "BuysPaused"
    );

    await factory.connect(owner).setCampaignPauses(await campaign.getAddress(), false, false, false, false);
    await campaign.connect(alice).buyExactTokens(amountOut, total, { value: total });
    await token.connect(alice).approve(await campaign.getAddress(), amountOut);

    await factory.connect(owner).setCampaignPauses(await campaign.getAddress(), false, false, true, false);
    await expect(campaign.connect(alice).sellExactTokens(ethers.parseEther("1"), 0n)).to.be.revertedWithCustomError(
      campaign,
      "SellsPaused"
    );
  });

  it("graduation pause blocks eligible permissionless finalization", async () => {
    const { factory, campaign, owner, alice } = await loadFixture(createCampaignFixture);
    const target = await campaign.graduationNativeTarget();

    await owner.sendTransaction({ to: await campaign.getAddress(), value: target });
    await factory.connect(owner).setCampaignPauses(await campaign.getAddress(), false, false, false, true);

    await expect(campaign.connect(alice).graduateIfEligible(0, 0)).to.be.revertedWithCustomError(
      campaign,
      "GraduationPaused"
    );
  });

  it("authorized-trading toggle blocks direct buys and sells until disabled", async () => {
    const { factory, campaign, token, owner, alice } = await loadFixture(createHighTargetCampaignFixture);
    const amountOut = ethers.parseEther("2");
    const total = await campaign.quoteBuyExactTokens(amountOut);

    await expect(factory.connect(owner).setCampaignRequireAuthorizedTrading(await campaign.getAddress(), true))
      .to.emit(campaign, "RequireAuthorizedTradingUpdated")
      .withArgs(true);

    await expect(campaign.connect(alice).buyExactTokens(amountOut, total, { value: total })).to.be.revertedWithCustomError(
      campaign,
      "AuthorizedTradingRequired"
    );

    await factory.connect(owner).setCampaignRequireAuthorizedTrading(await campaign.getAddress(), false);
    await campaign.connect(alice).buyExactTokens(amountOut, total, { value: total });
    await token.connect(alice).approve(await campaign.getAddress(), amountOut);

    await factory.connect(owner).setCampaignRequireAuthorizedTrading(await campaign.getAddress(), true);
    await expect(campaign.connect(alice).sellExactTokens(ethers.parseEther("1"), 0n)).to.be.revertedWithCustomError(
      campaign,
      "AuthorizedTradingRequired"
    );
  });

  it("reports empty graduation state before finalization", async () => {
    const { campaign } = await loadFixture(createCampaignFixture);
    const state = await campaign.getGraduationState();

    expect(state.dexPair).to.eq(ethers.ZeroAddress);
    expect(state.finalCurvePrice).to.eq(0n);
    expect(state.initialDexPrice).to.eq(0n);
    expect(state.graduatedLiquidityTokens).to.eq(0n);
    expect(state.graduatedLiquidityBnb).to.eq(0n);
    expect(state.graduatedLiquidityLp).to.eq(0n);
    expect(state.burnedUnsoldTokens).to.eq(0n);
    expect(state.burnedUnusedLpTokens).to.eq(0n);
    expect(state.postBurnTotalSupply).to.eq(0n);
    expect(state.graduationBalance).to.eq(0n);
    expect(state.graduationOvershoot).to.eq(0n);
  });

  it("finalization records state, registers LP with the permanent locker, and is idempotent", async () => {
    const { campaign, token, alice, permanentLpLocker } = await loadFixture(createLowTargetCampaignFixture);
    const curveSupply = await campaign.curveSupply();
    const totalBuy = await campaign.quoteBuyExactTokens(curveSupply);

    await expect(campaign.connect(alice).buyExactTokens(curveSupply, totalBuy, { value: totalBuy })).to.emit(
      campaign,
      "CampaignFinalized"
    );

    const state = await campaign.getGraduationState();
    expect(await campaign.launched()).to.eq(true);
    expect(await campaign.finalizedAt()).to.be.gt(0n);
    expect(state.dexPair).to.not.eq(ethers.ZeroAddress);
    expect(state.graduatedLiquidityTokens).to.be.gt(0n);
    expect(state.graduatedLiquidityBnb).to.be.gt(0n);
    expect(state.graduatedLiquidityLp).to.be.gt(0n);
    expect(state.postBurnTotalSupply).to.eq(await token.totalSupply());
    expect(await permanentLpLocker.registeredLpToken(state.dexPair)).to.eq(true);

    await expect(campaign.connect(alice).graduateIfEligible(0, 0)).to.be.revertedWithCustomError(campaign, "Finalized");
  });

  it("quoteBuyExactBnb returns zeros after finalization", async () => {
    const { campaign, alice } = await loadFixture(createLowTargetCampaignFixture);
    const curveSupply = await campaign.curveSupply();
    const totalBuy = await campaign.quoteBuyExactTokens(curveSupply);

    await campaign.connect(alice).buyExactTokens(curveSupply, totalBuy, { value: totalBuy });

    const quote = await campaign.quoteBuyExactBnb(ethers.parseEther("1"));
    expect(quote.tokensOut).to.eq(0n);
    expect(quote.totalCostWei).to.eq(0n);
    expect(quote.feeWei).to.eq(0n);
  });
});
