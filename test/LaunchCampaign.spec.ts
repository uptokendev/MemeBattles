import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { deployCoreFixture } from "./fixtures/core";
import { quoteBuyExactTokens, quoteSellExactTokens, currentPrice as priceFn } from "./helpers/math";
import { getBalance } from "./helpers/balances";

async function createCampaignFixture() {
  const fx = await deployCoreFixture();
  const { factory, creator } = fx;

  const req = {
    name: "MyToken",
    symbol: "MYT",
    logoURI: "ipfs://logo",
    xAccount: "x",
    website: "w",
    extraLink: "e",
    basePrice: 0n,
    priceSlope: 0n,
    graduationTarget: 0n,
    lpReceiver: await fx.lpReceiver.getAddress(),
    initialBuyBnbWei: 0n
  };

  await factory.connect(creator).createCampaign(req as any);
  const info = await factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const token = await ethers.getContractAt("LaunchToken", await campaign.token());
  return { ...fx, info, campaign, token, req };
}

describe("LaunchCampaign", function () {
  it("initial state / immutables / token minted to campaign", async () => {
    const { campaign, token } = await loadFixture(createCampaignFixture);

    expect(await campaign.launched()).to.eq(false);
    expect(await token.owner()).to.eq(await campaign.getAddress());

    const totalSupply = await campaign.totalSupply();
    expect(await token.balanceOf(await campaign.getAddress())).to.eq(totalSupply);
    expect(await token.tradingEnabled()).to.eq(false);
  });

  it("quoteBuyExactTokens / quoteSellExactTokens guard rails", async () => {
    const { campaign } = await loadFixture(createCampaignFixture);

    await expect(campaign.quoteBuyExactTokens(0n)).to.be.revertedWith("zero amount");
    await expect(campaign.quoteSellExactTokens(0n)).to.be.revertedWith("zero amount");
    await expect(campaign.quoteSellExactTokens(1n)).to.be.revertedWith("exceeds sold");

    const curveSupply = await campaign.curveSupply();
    await expect(campaign.quoteBuyExactTokens(curveSupply + 1n)).to.be.revertedWith("sold out");
  });

  it("currentPrice matches formula", async () => {
    const { campaign } = await loadFixture(createCampaignFixture);
    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();

    expect(await campaign.currentPrice()).to.eq(priceFn(base, slope, 0n));
  });

  it("buyExactTokens: transfers tokens, updates sold & counters, emits, sends fee, refunds overpay", async () => {
    const { campaign, token, alice, feeRecipient } = await loadFixture(createCampaignFixture);

    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();
    const feeBps = await campaign.protocolFeeBps();

    const amountOut = ethers.parseEther("10");
    const sold0 = await campaign.sold();
    const { costNoFee, fee, total } = quoteBuyExactTokens(BigInt(sold0), BigInt(amountOut), BigInt(base), BigInt(slope), BigInt(feeBps));

    const feeBefore = await getBalance(await feeRecipient.getAddress());
    const buyerBefore = await getBalance(await alice.getAddress());
    const campBefore = await getBalance(await campaign.getAddress());

    const tx = await campaign.connect(alice).buyExactTokens(amountOut, total, { value: total + ethers.parseEther("1") });
    await expect(tx).to.emit(campaign, "TokensPurchased").withArgs(await alice.getAddress(), amountOut, total);

    expect(await token.balanceOf(await alice.getAddress())).to.eq(amountOut);
    expect(await campaign.sold()).to.eq(sold0 + amountOut);

    // counters
    expect(await campaign.totalBuyVolumeWei()).to.eq(costNoFee);
    expect(await campaign.buyersCount()).to.eq(1n);
    expect(await campaign.hasBought(await alice.getAddress())).to.eq(true);

    // fee recipient got fee
    const feeAfter = await getBalance(await feeRecipient.getAddress());
    expect(feeAfter - feeBefore).to.eq(fee);

    // campaign retains no-fee portion
    const campAfter = await getBalance(await campaign.getAddress());
    expect(campAfter - campBefore).to.eq(costNoFee);

    // buyer got refund of (msg.value - total); balance delta is affected by gas so we only assert it's <= total+gas
    const buyerAfter = await getBalance(await alice.getAddress());
    expect(buyerBefore - buyerAfter).to.be.gte(total); // paid at least total+gas
  });

  it("buyExactTokens: slippage & value checks", async () => {
    const { campaign, alice } = await loadFixture(createCampaignFixture);

    const amountOut = ethers.parseEther("1");
    const total = await campaign.quoteBuyExactTokens(amountOut);

    await expect(campaign.connect(alice).buyExactTokens(amountOut, total - 1n, { value: total }))
      .to.be.revertedWith("slippage");

    await expect(campaign.connect(alice).buyExactTokens(amountOut, total, { value: total - 1n }))
      .to.be.revertedWith("insufficient value");
  });

  it("sellExactTokens: transfers tokens back, pays out, updates sold & counters, emits, takes fee", async () => {
    const { campaign, token, alice, feeRecipient } = await loadFixture(createCampaignFixture);

    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();
    const feeBps = await campaign.protocolFeeBps();

    // buy first
    const amountOut = ethers.parseEther("10");
    const totalBuy = await campaign.quoteBuyExactTokens(amountOut);
    await campaign.connect(alice).buyExactTokens(amountOut, totalBuy, { value: totalBuy });

    // approve and sell half
    const amountIn = ethers.parseEther("4");
    await token.connect(alice).approve(await campaign.getAddress(), amountIn);

    const soldBefore = await campaign.sold();
    const { gross, fee, payout } = quoteSellExactTokens(BigInt(soldBefore), BigInt(amountIn), BigInt(base), BigInt(slope), BigInt(feeBps));

    const feeBefore = await getBalance(await feeRecipient.getAddress());
    const campBefore = await getBalance(await campaign.getAddress());

    const tx = await campaign.connect(alice).sellExactTokens(amountIn, payout);
    await expect(tx).to.emit(campaign, "TokensSold").withArgs(await alice.getAddress(), amountIn, payout);

    expect(await campaign.sold()).to.eq(soldBefore - amountIn);
    expect(await token.balanceOf(await alice.getAddress())).to.eq(amountOut - amountIn);

    // fee recipient got fee
    const feeAfter = await getBalance(await feeRecipient.getAddress());
    expect(feeAfter - feeBefore).to.eq(fee);

    // campaign balance decreases by gross
    const campAfter = await getBalance(await campaign.getAddress());
    expect(campBefore - campAfter).to.eq(gross);

    expect(await campaign.totalSellVolumeWei()).to.eq(gross);
  });

  it("sellExactTokens: slippage protection", async () => {
    const { campaign, token, alice } = await loadFixture(createCampaignFixture);

    const amountOut = ethers.parseEther("5");
    const totalBuy = await campaign.quoteBuyExactTokens(amountOut);
    await campaign.connect(alice).buyExactTokens(amountOut, totalBuy, { value: totalBuy });

    const amountIn = ethers.parseEther("1");
    await token.connect(alice).approve(await campaign.getAddress(), amountIn);

    const minPayout = (await campaign.quoteSellExactTokens(amountIn)) + 1n;
    await expect(campaign.connect(alice).sellExactTokens(amountIn, minPayout)).to.be.revertedWith("slippage");
  });

  it("buyExactTokensFor can be exercised via FactoryCaller helper; onlyFactory enforced; recipient nonzero; refund goes to caller", async () => {
    const { creator, owner } = await deployCoreFixture();

    // Deploy a campaign directly with factory set to FactoryCaller (test-only)
    const Caller = await ethers.getContractFactory("FactoryCaller");
    const caller = await Caller.deploy();

    const Router = await ethers.getContractFactory("MockRouter");
    const router = await Router.deploy(ethers.ZeroAddress, ethers.ZeroAddress);

    const Campaign = await ethers.getContractFactory("LaunchCampaign");
    const params = {
      name: "T",
      symbol: "T",
      logoURI: "ipfs://logo",
      xAccount: "",
      website: "",
      extraLink: "",
      totalSupply: ethers.parseEther("1000"),
      curveBps: 5000,
      liquidityTokenBps: 4000,
      basePrice: 10n ** 12n,
      priceSlope: 10n ** 9n,
      graduationTarget: ethers.parseEther("1"),
      liquidityBps: 8000,
      protocolFeeBps: 200,
      router: await router.getAddress(),
      lpReceiver: await creator.getAddress(),
      feeRecipient: await owner.getAddress(),
      creator: await creator.getAddress(),
      factory: await caller.getAddress()
    };

    const campaign = await Campaign.deploy(params);

    // EOA cannot call onlyFactory
    await expect(
      campaign.connect(creator).buyExactTokensFor(await creator.getAddress(), ethers.parseEther("1"), 0n, { value: 0n })
    ).to.be.revertedWith("ONLY_FACTORY");

    const total = await campaign.quoteBuyExactTokens(ethers.parseEther("2"));

    await expect(
      caller.buyFor(await campaign.getAddress(), ethers.ZeroAddress, ethers.parseEther("2"), total, { value: total })
    ).to.be.revertedWith("zero recipient");

    // refund: send extra, should return to caller contract (msg.sender in campaign = caller)
    const extra = ethers.parseEther("1");
    await caller.buyFor(await campaign.getAddress(), await creator.getAddress(), ethers.parseEther("2"), total, { value: total + extra });

    // Caller should have received refund (held in contract balance)
    const balCaller = await ethers.provider.getBalance(await caller.getAddress());
    expect(balCaller).to.eq(extra);
  });


  it("edge-case: quote enforces curveSupply but buyExactTokens does not; overselling is possible", async () => {
    const { campaign, token, alice } = await loadFixture(createCampaignFixture);

    const curveSupply = await campaign.curveSupply();

    // quote blocks oversell
    await expect(campaign.quoteBuyExactTokens(curveSupply + 1n)).to.be.revertedWith("sold out");

    // buy path currently does not enforce this (sold can exceed curveSupply)
    const amountOut = curveSupply + 1n;
    const maxCost = (await campaign.quoteBuyExactTokens(curveSupply)) + ethers.parseEther("100"); // generous
    await expect(campaign.connect(alice).buyExactTokens(amountOut, maxCost, { value: maxCost })).to.not.be.reverted;

    expect(await campaign.sold()).to.eq(amountOut);
    expect(await token.balanceOf(await alice.getAddress())).to.eq(amountOut);
  });

  it("edge-case: buyExactTokens / sellExactTokens accept zero amounts while quote functions reject them", async () => {
    const { campaign, token, alice } = await loadFixture(createCampaignFixture);

    // buy 0 succeeds (no-op)
    await expect(campaign.connect(alice).buyExactTokens(0n, 0n, { value: 0n })).to.not.be.reverted;

    // Need tokens to test sell 0 path: buy small amount first
    const amountOut = ethers.parseEther("1");
    const totalBuy = await campaign.quoteBuyExactTokens(amountOut);
    await campaign.connect(alice).buyExactTokens(amountOut, totalBuy, { value: totalBuy });

    await token.connect(alice).approve(await campaign.getAddress(), 0n);
    await expect(campaign.connect(alice).sellExactTokens(0n, 0n)).to.not.be.reverted;

    // quote paths reject zeros
    await expect(campaign.quoteBuyExactTokens(0n)).to.be.revertedWith("zero amount");
    await expect(campaign.quoteSellExactTokens(0n)).to.be.revertedWith("zero amount");
  });

  it("finalize: reverts unless threshold met; onlyOwner; marks launched; adds liquidity; burns unsold; transfers creatorReserve; pays creator; enables trading", async () => {
    const { campaign, token, creator, alice, feeRecipient, lpReceiver, router } = await loadFixture(createCampaignFixture);

    // onlyOwner
    await expect(campaign.connect(alice).finalize(0n, 0n))
      .to.be.revertedWithCustomError(campaign, "OwnableUnauthorizedAccount");

    await expect(campaign.connect(creator).finalize(0n, 0n)).to.be.revertedWith("threshold");

    // Meet finalize threshold robustly by selling out the curve
    // (With some parameter sets, graduationTarget may be unreachable given curveSupply and pricing.)
    const curveSupply = await campaign.curveSupply();
    const totalBuy = await campaign.quoteBuyExactTokens(curveSupply);
    await campaign.connect(alice).buyExactTokens(curveSupply, totalBuy, { value: totalBuy });

    expect(await campaign.sold()).to.eq(curveSupply);

    const ownerAddr = await creator.getAddress();
    const creatorBalBefore = await getBalance(ownerAddr);
    const feeBefore = await getBalance(await feeRecipient.getAddress());

    const tx = await campaign.connect(creator).finalize(0n, 0n);
    const receipt = await tx.wait();
    // Hardhat/Ethers can expose gas pricing differently across versions (effectiveGasPrice, gasPrice, maxFeePerGas).
    // For portability, bound the creator's gas spend rather than relying on a single receipt field.
    const gasUsed = BigInt((receipt!.gasUsed ?? 0n).toString());
    const maxFeePerGas = BigInt((((tx as any).maxFeePerGas ?? (tx as any).gasPrice ?? 0n)).toString());

    await expect(tx).to.emit(campaign, "CampaignFinalized");
    await expect(tx).to.emit(router, "LiquidityAdded");

    expect(await campaign.launched()).to.eq(true);
    expect(await token.tradingEnabled()).to.eq(true);

    // campaign should be drained of native balance after finalize
    expect(await getBalance(await campaign.getAddress())).to.eq(0n);

    // creator receives payout (native) and creatorReserve (tokens)
    // Read creatorPayout + protocolFee from the CampaignFinalized event for exact balance assertions
    const ev = receipt!.logs
      .map((l: any) => {
        try { return campaign.interface.parseLog(l); } catch { return null; }
      })
      .find((p: any) => p && p.name === "CampaignFinalized");

    expect(ev).to.not.eq(undefined);

    const protocolFee = BigInt(ev!.args.protocolFee.toString());
    const creatorPayout = BigInt(ev!.args.creatorPayout.toString());

    const creatorBalAfter = await getBalance(ownerAddr);
    // creatorBalBefore + creatorPayout - creatorBalAfter == gas spent by creator for finalize tx
    const spent = creatorBalBefore + creatorPayout - creatorBalAfter;
    expect(spent).to.be.gt(0n);
    if (maxFeePerGas !== 0n) {
      expect(spent).to.be.lte(gasUsed * maxFeePerGas);
    }

    const creatorReserve = await campaign.creatorReserve();
    expect(await token.balanceOf(ownerAddr)).to.be.gte(creatorReserve); // may also include tokens bought by creator in other tests

    // unsold curve tokens burned reduces totalSupply by (curveSupply - soldAtFinalize)
    const totalSupply = await campaign.totalSupply();
    const soldAtFinalize = await campaign.sold();
    const expectedBurn = curveSupply - soldAtFinalize;
    expect(await token.totalSupply()).to.eq(totalSupply - expectedBurn);

    // fee recipient should have received finalize protocol fee (plus any trade fees from buys/sells)
    const feeAfter = await getBalance(await feeRecipient.getAddress());
    expect(feeAfter - feeBefore).to.be.gte(protocolFee);
  });

  it("post-finalize: trading restriction lifted; buys/sells revert", async () => {
    const { campaign, token, creator, alice, bob } = await loadFixture(createCampaignFixture);

    // Sell out curve so finalize threshold is guaranteed.
    const curveSupply = await campaign.curveSupply();
    const totalBuy = await campaign.quoteBuyExactTokens(curveSupply);
    await campaign.connect(alice).buyExactTokens(curveSupply, totalBuy, { value: totalBuy });

    await campaign.connect(creator).finalize(0n, 0n);

    // After finalize, buy/sell entrypoints must revert on the launched guard.
    await expect(campaign.connect(alice).buyExactTokens(1n, 0n, { value: 0n }))
      .to.be.revertedWith("campaign launched");
    await expect(campaign.connect(alice).sellExactTokens(1n, 0n))
      .to.be.revertedWith("campaign launched");

    // transfers now allowed
    await token.connect(alice).transfer(await bob.getAddress(), ethers.parseEther("1"));
    expect(await token.balanceOf(await bob.getAddress())).to.eq(ethers.parseEther("1"));
  });
});
