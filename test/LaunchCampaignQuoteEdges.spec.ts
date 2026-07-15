import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { deployCoreFixture } from "./fixtures/core";

const baseCampaignRequest = (overrides: Record<string, unknown> = {}) => ({
  name: "QuoteToken",
  symbol: "QUOTE",
  logoURI: "ipfs://quote-logo",
  xAccount: "",
  website: "",
  extraLink: "",
  basePrice: 0n,
  priceSlope: 0n,
  graduationTarget: ethers.parseEther("100000"),
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

describe("LaunchCampaign quote edge behavior", function () {
  it("quoteBuyExactBnb returns zero when input is below the first executable token wei", async () => {
    const { campaign } = await loadFixture(createCampaignFixture);
    const firstTokenCost = await campaign.quoteBuyExactTokens(1n);
    const quote = await campaign.quoteBuyExactBnb(firstTokenCost - 1n);

    expect(quote.tokensOut).to.eq(0n);
    expect(quote.totalCostWei).to.eq(0n);
    expect(quote.feeWei).to.eq(0n);
  });

  it("quoteBuyExactBnb exactly matches quoteBuyExactTokens for one token wei", async () => {
    const { campaign } = await loadFixture(createCampaignFixture);
    const exactCost = await campaign.quoteBuyExactTokens(1n);
    const quote = await campaign.quoteBuyExactBnb(exactCost);

    expect(quote.tokensOut).to.eq(1n);
    expect(quote.totalCostWei).to.eq(exactCost);
    expect(quote.feeWei).to.be.lte(quote.totalCostWei);
  });

  it("quoteBuyExactBnb is read-only and does not mutate buyer counters or sold supply", async () => {
    const { campaign, alice } = await loadFixture(createCampaignFixture);
    const value = ethers.parseEther("0.01");

    const beforeSold = await campaign.sold();
    const beforeBuyers = await campaign.buyersCount();
    const beforeHasBought = await campaign.hasBought(await alice.getAddress());

    const quote = await campaign.quoteBuyExactBnb(value);
    expect(quote.tokensOut).to.be.gt(0n);

    expect(await campaign.sold()).to.eq(beforeSold);
    expect(await campaign.buyersCount()).to.eq(beforeBuyers);
    expect(await campaign.hasBought(await alice.getAddress())).to.eq(beforeHasBought);
  });

  it("quoteBuyExactBnb decreases remaining output after a buy advances sold supply", async () => {
    const { campaign, alice } = await loadFixture(createCampaignFixture);
    const value = ethers.parseEther("0.02");
    const before = await campaign.quoteBuyExactBnb(value);

    await campaign.connect(alice).buyExactBnb(1n, { value });
    const after = await campaign.quoteBuyExactBnb(value);

    expect(before.tokensOut).to.be.gt(0n);
    expect(after.tokensOut).to.be.gt(0n);
    expect(after.tokensOut).to.be.lt(before.tokensOut);
  });

  it("quoteBuyExactBnb caps output at remaining curve supply", async () => {
    const { campaign } = await loadFixture(createCampaignFixture);
    const curveSupply = await campaign.curveSupply();
    const fullCurveCost = await campaign.quoteBuyExactTokens(curveSupply);
    const quote = await campaign.quoteBuyExactBnb(fullCurveCost + ethers.parseEther("100"));

    expect(quote.tokensOut).to.eq(curveSupply);
    expect(quote.totalCostWei).to.eq(fullCurveCost);
  });

  it("quoteBuyExactBnb returns zero after all curve tokens are sold and finalized", async () => {
    const fx = await deployCoreFixture();
    await fx.factory.connect(fx.creator).createCampaign(baseCampaignRequest({ graduationTarget: 1n }) as any);
    const info = await fx.factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const curveSupply = await campaign.curveSupply();
    const fullCurveCost = await campaign.quoteBuyExactTokens(curveSupply);

    await campaign.connect(fx.alice).buyExactTokens(curveSupply, fullCurveCost, { value: fullCurveCost });
    expect(await campaign.launched()).to.eq(true);

    const quote = await campaign.quoteBuyExactBnb(ethers.parseEther("1"));
    expect(quote.tokensOut).to.eq(0n);
    expect(quote.totalCostWei).to.eq(0n);
    expect(quote.feeWei).to.eq(0n);
  });
});
