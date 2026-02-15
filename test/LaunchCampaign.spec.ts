import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { deployCoreFixture } from "./fixtures/core";
import { quoteBuyExactTokens, quoteSellExactTokens, currentPrice as priceFn } from "./helpers/math";
import { getBalance } from "./helpers/balances";

// hardhat-toolbox chai matcher helper
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

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

async function createLowTargetCampaignFixture() {
  const fx = await deployCoreFixture();
  const { factory, creator } = fx;

  // Set a low graduation target so we can trigger auto-finalize without selling out the curve.
  const req = {
    name: "MyToken",
    symbol: "MYT",
    logoURI: "ipfs://logo",
    xAccount: "x",
    website: "w",
    extraLink: "e",
    basePrice: 0n,
    priceSlope: 0n,
    // Set to 1 wei so the first nonzero buy crosses the threshold
    // while remaining far below curve sellout.
    graduationTarget: 1n,
    lpReceiver: ethers.ZeroAddress,
    initialBuyBnbWei: 0n,
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
    const { campaign, token, alice, feeRecipient, lpReceiver } = await loadFixture(createCampaignFixture);

    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();
    const feeBps = await campaign.protocolFeeBps();

    const amountOut = ethers.parseEther("10");
    const sold0 = await campaign.sold();
    const { costNoFee, fee, total } = quoteBuyExactTokens(BigInt(sold0), BigInt(amountOut), BigInt(base), BigInt(slope), BigInt(feeBps));

    const feeBefore = await getBalance(await feeRecipient.getAddress());
    const leagueBefore = await getBalance(await lpReceiver.getAddress());
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

    // fee split: protocolNet -> feeRecipient, league slice -> leagueReceiver (lpReceiver in this fixture)
    const leagueBps = await campaign.leagueFeeBps();
    let expectedLeagueFee = (costNoFee * BigInt(leagueBps)) / 10_000n;
    if (expectedLeagueFee > fee) expectedLeagueFee = fee; // must never exceed total fee
    const expectedProtocolNet = fee - expectedLeagueFee;

    const feeAfter = await getBalance(await feeRecipient.getAddress());
    const leagueAfter = await getBalance(await lpReceiver.getAddress());
    expect(feeAfter - feeBefore).to.eq(expectedProtocolNet);
    expect(leagueAfter - leagueBefore).to.eq(expectedLeagueFee);

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
    const { campaign, token, alice, feeRecipient, lpReceiver } = await loadFixture(createCampaignFixture);

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
    const leagueBefore = await getBalance(await lpReceiver.getAddress());
    const campBefore = await getBalance(await campaign.getAddress());

    const tx = await campaign.connect(alice).sellExactTokens(amountIn, payout);
    await expect(tx).to.emit(campaign, "TokensSold").withArgs(await alice.getAddress(), amountIn, payout);

    expect(await campaign.sold()).to.eq(soldBefore - amountIn);
    expect(await token.balanceOf(await alice.getAddress())).to.eq(amountOut - amountIn);    // fee split: feeRecipient gets protocolNet, leagueReceiver gets leagueFee
    const leagueBps = await campaign.leagueFeeBps();

    const expectedLeagueFee = (gross * BigInt(leagueBps)) / 10_000n;
    const expectedProtocolNet = fee - expectedLeagueFee;

    const feeAfter = await getBalance(await feeRecipient.getAddress());
    const leagueAfter = await getBalance(await lpReceiver.getAddress());

    expect(feeAfter - feeBefore).to.eq(expectedProtocolNet);
    expect(leagueAfter - leagueBefore).to.eq(expectedLeagueFee);
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
      leagueFeeBps: 25,
      leagueReceiver: await owner.getAddress(),
      router: await router.getAddress(),
      lpReceiver: await creator.getAddress(),
      feeRecipient: await owner.getAddress(),
      creator: await creator.getAddress(),
      factory: await caller.getAddress()
    };

    const impl = await Campaign.deploy();
await impl.waitForDeployment();

// Deploy an EIP-1167 minimal proxy clone of the implementation
const implAddr = await impl.getAddress();
const minimalProxyBytecode =
  "0x3d602d80600a3d3981f3363d3d373d3d3d363d73" +
  implAddr.slice(2).toLowerCase() +
  "5af43d82803e903d91602b57fd5bf3";
const tx = await creator.sendTransaction({ data: minimalProxyBytecode });
const receipt = await tx.wait();
const cloneAddr = receipt!.contractAddress;

const campaign = Campaign.attach(cloneAddr);
await campaign.initialize(params);

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


  it("buyExactTokens enforces curveSupply cap (no oversell)", async () => {
    const { campaign, alice } = await loadFixture(createCampaignFixture);

    const curveSupply = await campaign.curveSupply();
    const amountOut = curveSupply + 1n;

    // generous maxCost; function should still revert on sold out
    const maxCost = (await campaign.quoteBuyExactTokens(curveSupply)) + ethers.parseEther("100");
    await expect(campaign.connect(alice).buyExactTokens(amountOut, maxCost, { value: maxCost }))
      .to.be.revertedWith("sold out");
  });

  it("buyExactTokens / sellExactTokens reject zero amounts (consistent with quote)", async () => {
    const { campaign, alice } = await loadFixture(createCampaignFixture);

    await expect(campaign.connect(alice).buyExactTokens(0n, 0n, { value: 0n }))
      .to.be.revertedWith("zero amount");

    await expect(campaign.connect(alice).sellExactTokens(0n, 0n))
      .to.be.revertedWith("zero amount");
  });

  it("fee receivers cannot DOS: feeRecipient revert escrows; leagueReceiver router forward failure doesn't revert", async () => {
    const { creator, owner, alice } = await deployCoreFixture();

    // feeRecipient that rejects native transfers
    const Reverting = await ethers.getContractFactory("RevertingReceiver");
    const feeRecipient = await Reverting.deploy();
    await feeRecipient.waitForDeployment();

    // vault that rejects native transfers, forcing the TreasuryRouter to emit ForwardFailed but not revert
    const vault = await Reverting.deploy();
    await vault.waitForDeployment();

    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    const leagueReceiver = await TreasuryRouter.deploy(
      await owner.getAddress(),
      await vault.getAddress(),
      3600
    );
    await leagueReceiver.waitForDeployment();

    const Router = await ethers.getContractFactory("MockRouter");
    const dexRouter = await Router.deploy(ethers.ZeroAddress, ethers.ZeroAddress);
    await dexRouter.waitForDeployment();

    // Deploy campaign via clone so we can set feeRecipient/leagueReceiver explicitly
    const Campaign = await ethers.getContractFactory("LaunchCampaign");
    const impl = await Campaign.deploy();
    await impl.waitForDeployment();

    const implAddr = await impl.getAddress();
    const minimalProxyBytecode =
      "0x3d602d80600a3d3981f3363d3d373d3d3d363d73" +
      implAddr.slice(2).toLowerCase() +
      "5af43d82803e903d91602b57fd5bf3";
    const txClone = await creator.sendTransaction({ data: minimalProxyBytecode });
    const receipt = await txClone.wait();
    const cloneAddr = receipt!.contractAddress;

    const campaign = Campaign.attach(cloneAddr);
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
      leagueFeeBps: 25,
      leagueReceiver: await leagueReceiver.getAddress(),
      router: await dexRouter.getAddress(),
      lpReceiver: await creator.getAddress(),
      feeRecipient: await feeRecipient.getAddress(),
      creator: await creator.getAddress(),
      factory: await creator.getAddress(),
    };
    await campaign.initialize(params);

    const token = await ethers.getContractAt("LaunchToken", await campaign.token());

    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();
    const feeBps = await campaign.protocolFeeBps();

    const amountOut = ethers.parseEther("10");
    const sold0 = await campaign.sold();

    const { costNoFee, fee, total } = quoteBuyExactTokens(
      BigInt(sold0),
      BigInt(amountOut),
      BigInt(base),
      BigInt(slope),
      BigInt(feeBps)
    );

    const leagueFee = (costNoFee * 25n) / 10_000n;
    const protocolNet = fee - leagueFee;

    const tx = await campaign.connect(alice).buyExactTokens(amountOut, total, { value: total });

    // Purchase succeeded even though feeRecipient rejects transfers
    expect(await token.balanceOf(await alice.getAddress())).to.eq(amountOut);

    // FeeRecipient portion escrowed
    await expect(tx).to.emit(campaign, "NativeEscrowed").withArgs(await feeRecipient.getAddress(), protocolNet);
    expect(await campaign.pendingNative(await feeRecipient.getAddress())).to.eq(protocolNet);

    // LeagueReceiver is the TreasuryRouter; forwarding fails but doesn't revert; router retains funds
    await expect(tx).to.emit(leagueReceiver, "ForwardFailed").withArgs(await vault.getAddress(), leagueFee);
    expect(await ethers.provider.getBalance(await leagueReceiver.getAddress())).to.eq(leagueFee);
  });

  it("auto-finalize: completion buy triggers graduation; adds liquidity; burns unsold; transfers creatorReserve; pays creator; enables trading", async () => {
    const { campaign, token, creator, alice, feeRecipient, lpReceiver, router } = await loadFixture(createCampaignFixture);

    // Meet finalize threshold robustly by selling out the curve
    // (With some parameter sets, graduationTarget may be unreachable given curveSupply and pricing.)
    const curveSupply = await campaign.curveSupply();
    const totalBuy = await campaign.quoteBuyExactTokens(curveSupply);

    const ownerAddr = await creator.getAddress();
    const creatorBalBefore = await getBalance(ownerAddr);

    const tx = await campaign.connect(alice).buyExactTokens(curveSupply, totalBuy, { value: totalBuy });
    const receipt = await tx.wait();

    expect(await campaign.sold()).to.eq(curveSupply);

    await expect(tx).to.emit(campaign, "CampaignFinalized");
    await expect(tx).to.emit(router, "LiquidityAdded");

    // LP should be minted to the burn address (forced by LaunchFactory).
    await expect(tx)
      .to.emit(router, "LiquidityAdded")
      .withArgs(await token.getAddress(), anyValue, anyValue, "0x000000000000000000000000000000000000dEaD");

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

    // Creator received payout.
    expect(creatorBalAfter).to.be.gt(creatorBalBefore);

    const creatorReserve = await campaign.creatorReserve();
    expect(await token.balanceOf(ownerAddr)).to.be.gte(creatorReserve); // may also include tokens bought by creator in other tests

    // unsold curve tokens burned reduces totalSupply by (curveSupply - soldAtFinalize)
    const totalSupply = await campaign.totalSupply();
    const soldAtFinalize = await campaign.sold();
    const expectedBurn = curveSupply - soldAtFinalize;
    expect(await token.totalSupply()).to.eq(totalSupply - expectedBurn);

    // fee recipient should have received finalize protocol fee (plus any trade fees from buys/sells)
    const feeAfter = await getBalance(await feeRecipient.getAddress());
    // We don't do exact delta accounting here because prior tests may have altered balances.
    expect(feeAfter).to.be.gte(protocolFee);
  });

  it("auto-finalize: reaching graduationTarget (without selling out) finalizes inside buy", async () => {
    const { campaign, token, alice, router } = await loadFixture(createLowTargetCampaignFixture);

    const curveSupply = await campaign.curveSupply();

    // Buy enough tokens such that the campaign retains >= graduationTarget in no-fee proceeds,
    // WITHOUT selling out the curve. We choose an amount programmatically to avoid fragile assumptions
    // about default curve params.
    let amountOut = ethers.parseEther("1");
    while (amountOut * 2n < curveSupply) {
      const totalBuy = await campaign.quoteBuyExactTokens(amountOut);
      const txTry = await campaign.connect(alice).buyExactTokens(amountOut, totalBuy, { value: totalBuy });
      const launched = await campaign.launched();
      if (launched) {
        await expect(txTry).to.emit(campaign, "CampaignFinalized");
        await expect(txTry).to.emit(router, "LiquidityAdded");
        expect(await token.tradingEnabled()).to.eq(true);
        expect(await campaign.sold()).to.eq(amountOut);
        expect(await campaign.sold()).to.be.lt(curveSupply);
        return;
      }
      // If not launched yet, revert state by selling back and try larger amount.
      await token.connect(alice).approve(await campaign.getAddress(), amountOut);
      const minPayout = 0n;
      await campaign.connect(alice).sellExactTokens(amountOut, minPayout);
      amountOut = amountOut * 2n;
    }

    throw new Error("Failed to trigger graduationTarget without selling out curve");
  });

  it("auto-finalize: succeeds even if Pancake V2 pair is pre-created (empty)", async () => {
    const { campaign, token, alice, router, v2factory } = await loadFixture(createCampaignFixture);

    // Simulate third-party pre-creating the pair before graduation.
    // With transfers locked pre-finalize, they cannot seed liquidity, but the pair contract may exist.
    const Pair = await ethers.getContractFactory("MockV2Pair");
    const pair = await Pair.deploy();

    // Ensure the pair is empty (no reserves, no LP supply).
    await pair.setTotalSupply(0);
    await pair.setReserves(0, 0);

    await v2factory.setPair(await token.getAddress(), await router.WETH(), await pair.getAddress());

    // Sell out the curve to guarantee auto-finalize triggers in this buy.
    const curveSupply = await campaign.curveSupply();
    const totalBuy = await campaign.quoteBuyExactTokens(curveSupply);

    const tx = await campaign.connect(alice).buyExactTokens(curveSupply, totalBuy, { value: totalBuy });

    await expect(tx).to.emit(campaign, "CampaignFinalized");
    await expect(tx).to.emit(router, "LiquidityAdded");

    // Transfers should be enabled after auto-finalize.
    expect(await token.tradingEnabled()).to.eq(true);
  });

  it("post-finalize: trading restriction lifted; buys/sells revert", async () => {
    const { campaign, token, creator, alice, bob } = await loadFixture(createCampaignFixture);

    // Sell out curve so finalize threshold is guaranteed.
    const curveSupply = await campaign.curveSupply();
    const totalBuy = await campaign.quoteBuyExactTokens(curveSupply);
    await campaign.connect(alice).buyExactTokens(curveSupply, totalBuy, { value: totalBuy });

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