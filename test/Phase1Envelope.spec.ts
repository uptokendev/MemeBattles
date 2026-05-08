import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { getBalance } from "./helpers/balances";
import { quoteBuyExactTokens } from "./helpers/math";

const ROUTE_KIND_TRADE = 0;
const ROUTE_KIND_FINALIZE = 1;
const ROUTE_PROFILE_STANDARD_UNLINKED = 1;

type RoutedSystem = Awaited<ReturnType<typeof deployRoutedSystem>>;
type LegacySystem = Awaited<ReturnType<typeof deployLegacySystem>>;

async function deployCommonDex() {
  const [owner, creator, alice] = await ethers.getSigners();

  const V2Factory = await ethers.getContractFactory("MockV2Factory");
  const v2factory = await V2Factory.deploy();
  await v2factory.waitForDeployment();

  const DexRouter = await ethers.getContractFactory("MockRouter");
  const dexRouter = await DexRouter.deploy(await v2factory.getAddress(), await owner.getAddress());
  await dexRouter.waitForDeployment();

  return { owner, creator, alice, dexRouter };
}

async function deployRoutedSystem() {
  const { owner, creator, alice, dexRouter } = await deployCommonDex();

  const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
  const leagueVault = await AcceptingReceiver.deploy();
  const recruiterVault = await AcceptingReceiver.deploy();
  const protocolVault = await AcceptingReceiver.deploy();
  await Promise.all([
    leagueVault.waitForDeployment(),
    recruiterVault.waitForDeployment(),
    protocolVault.waitForDeployment(),
  ]);

  const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
  const treasuryRouter = await TreasuryRouter.deploy(await owner.getAddress(), await leagueVault.getAddress(), 3600);
  await treasuryRouter.waitForDeployment();

  const CommunityRewardsVault = await ethers.getContractFactory("CommunityRewardsVault");
  const communityVault = await CommunityRewardsVault.deploy(await owner.getAddress(), ethers.ZeroAddress);
  await communityVault.waitForDeployment();

  await communityVault.connect(owner).setRouter(await treasuryRouter.getAddress());
  await treasuryRouter.connect(owner).setRecruiterRewardsVault(await recruiterVault.getAddress());
  await treasuryRouter.connect(owner).setCommunityRewardsVault(await communityVault.getAddress());
  await treasuryRouter.connect(owner).setProtocolRevenueVault(await protocolVault.getAddress());

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(await dexRouter.getAddress(), await treasuryRouter.getAddress());
  await factory.waitForDeployment();

  await factory.connect(owner).setFeeRecipient(await treasuryRouter.getAddress());
  await factory.connect(owner).setConfig({
    totalSupply: ethers.parseEther("1000"),
    curveBps: 5000,
    liquidityTokenBps: 4000,
    basePrice: 10n ** 12n,
    priceSlope: 10n ** 9n,
    graduationTarget: ethers.parseEther("2"),
    liquidityBps: 8000,
  });
  await factory.connect(owner).enableLive();

  return {
    owner,
    creator,
    alice,
    dexRouter,
    treasuryRouter,
    leagueVault,
    recruiterVault,
    communityVault,
    protocolVault,
    factory,
  };
}

async function deployLegacySystem() {
  const { owner, creator, alice, dexRouter } = await deployCommonDex();

  const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
  const leagueVault = await AcceptingReceiver.deploy();
  await leagueVault.waitForDeployment();

  const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
  const leagueRouter = await TreasuryRouter.deploy(await owner.getAddress(), await leagueVault.getAddress(), 3600);
  await leagueRouter.waitForDeployment();

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(await dexRouter.getAddress(), await leagueRouter.getAddress());
  await factory.waitForDeployment();

  await factory.connect(owner).setFeeRecipient(await owner.getAddress());
  await factory.connect(owner).setConfig({
    totalSupply: ethers.parseEther("1000"),
    curveBps: 5000,
    liquidityTokenBps: 4000,
    basePrice: 10n ** 12n,
    priceSlope: 10n ** 9n,
    graduationTarget: ethers.parseEther("2"),
    liquidityBps: 8000,
  });
  await factory.connect(owner).enableLive();

  return {
    owner,
    creator,
    alice,
    dexRouter,
    leagueRouter,
    leagueVault,
    factory,
  };
}

async function createCampaign(factory: any, creator: any, suffix: string) {
  await factory.connect(creator).createCampaign({
    name: `Phase1 ${suffix}`,
    symbol: `P1${suffix}`,
    logoURI: `ipfs://${suffix}`,
    xAccount: `x-${suffix}`,
    website: "https://memewar.zone",
    extraLink: "https://docs.memewar.zone",
    basePrice: 0n,
    priceSlope: 0n,
    graduationTarget: 0n,
    lpReceiver: ethers.ZeroAddress,
    initialBuyBnbWei: 0n,
  });

  const info = await factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const token = await ethers.getContractAt("LaunchToken", await campaign.token());
  return { info, campaign, token };
}

async function parseFinalizedEvent(campaign: any, tx: any) {
  const receipt = await tx.wait();
  const parsed = receipt.logs
    .map((log: any) => {
      try {
        return campaign.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((entry: any) => entry?.name === "CampaignFinalized");

  expect(parsed, "CampaignFinalized not found").to.not.equal(undefined);
  return parsed!.args;
}

describe("Phase 1 fee envelope and economics invariants", function () {
  it("previewRoute matches the published Phase 1 splits exactly on a divisible input", async () => {
    const { treasuryRouter } = await loadFixture(deployRoutedSystem);
    const amount = ethers.parseEther("2");

    const tradeLinked = await treasuryRouter.previewRoute(amount, ROUTE_KIND_TRADE, 0);
    expect(tradeLinked.league).to.equal(ethers.parseEther("0.75"));
    expect(tradeLinked.recruiter).to.equal(ethers.parseEther("0.25"));
    expect(tradeLinked.airdrop).to.equal(0n);
    expect(tradeLinked.squad).to.equal(ethers.parseEther("0.05"));
    expect(tradeLinked.protocol).to.equal(ethers.parseEther("0.95"));

    const tradeUnlinked = await treasuryRouter.previewRoute(amount, ROUTE_KIND_TRADE, ROUTE_PROFILE_STANDARD_UNLINKED);
    expect(tradeUnlinked.league).to.equal(ethers.parseEther("0.75"));
    expect(tradeUnlinked.recruiter).to.equal(0n);
    expect(tradeUnlinked.airdrop).to.equal(ethers.parseEther("0.30"));
    expect(tradeUnlinked.squad).to.equal(0n);
    expect(tradeUnlinked.protocol).to.equal(ethers.parseEther("0.95"));

    const finalizeLinked = await treasuryRouter.previewRoute(amount, ROUTE_KIND_FINALIZE, 0);
    expect(finalizeLinked.league).to.equal(0n);
    expect(finalizeLinked.recruiter).to.equal(ethers.parseEther("0.30"));
    expect(finalizeLinked.airdrop).to.equal(0n);
    expect(finalizeLinked.squad).to.equal(ethers.parseEther("0.05"));
    expect(finalizeLinked.protocol).to.equal(ethers.parseEther("1.65"));

    const finalizeUnlinked = await treasuryRouter.previewRoute(amount, ROUTE_KIND_FINALIZE, ROUTE_PROFILE_STANDARD_UNLINKED);
    expect(finalizeUnlinked.league).to.equal(0n);
    expect(finalizeUnlinked.recruiter).to.equal(0n);
    expect(finalizeUnlinked.airdrop).to.equal(ethers.parseEther("0.35"));
    expect(finalizeUnlinked.squad).to.equal(0n);
    expect(finalizeUnlinked.protocol).to.equal(ethers.parseEther("1.65"));

    const ogTrade = await treasuryRouter.previewRoute(amount, ROUTE_KIND_TRADE, 2);
    expect(ogTrade.recruiter).to.equal(ethers.parseEther("0.30"));
    expect(ogTrade.squad).to.equal(ethers.parseEther("0.05"));
    expect(ogTrade.protocol).to.equal(ethers.parseEther("0.90"));

    const ogFinalize = await treasuryRouter.previewRoute(amount, ROUTE_KIND_FINALIZE, 2);
    expect(ogFinalize.recruiter).to.equal(ethers.parseEther("0.35"));
    expect(ogFinalize.squad).to.equal(ethers.parseEther("0.05"));
    expect(ogFinalize.protocol).to.equal(ethers.parseEther("1.60"));
  });

  it("previewRoute preserves the exact fee envelope across representative odd amounts", async () => {
    const { treasuryRouter } = await loadFixture(deployRoutedSystem);
    const samples = [1n, 2n, 3n, 7n, 11n, 101n, 10_001n, 123_456_789n, ethers.parseEther("1.23456789")];

    for (const amount of samples) {
      for (const kind of [0, 1] as const) {
        for (const profile of [0, 1, 2] as const) {
          const preview = await treasuryRouter.previewRoute(amount, kind, profile);
          const total = preview.league + preview.recruiter + preview.airdrop + preview.squad + preview.protocol;
          expect(total, `net mismatch for amount=${amount} kind=${kind} profile=${profile}`).to.equal(amount);
        }
      }
    }
  });

  it("unified router mode keeps buy and sell quotes identical to legacy mode", async () => {
    const routed = await loadFixture(deployRoutedSystem);
    const legacy = await loadFixture(deployLegacySystem);

    const { campaign: routedCampaign } = await createCampaign(routed.factory, routed.creator, "R");
    const { campaign: legacyCampaign } = await createCampaign(legacy.factory, legacy.creator, "L");

    const amountOut = ethers.parseEther("10");
    expect(await routedCampaign.quoteBuyExactTokens(amountOut)).to.equal(await legacyCampaign.quoteBuyExactTokens(amountOut));

    const buyQuote = await routedCampaign.quoteBuyExactTokens(amountOut);
    await routedCampaign.connect(routed.alice).buyExactTokens(amountOut, buyQuote, { value: buyQuote });
    await legacyCampaign.connect(legacy.alice).buyExactTokens(amountOut, buyQuote, { value: buyQuote });

    const amountIn = ethers.parseEther("4");
    expect(await routedCampaign.quoteSellExactTokens(amountIn)).to.equal(await legacyCampaign.quoteSellExactTokens(amountIn));
  });

  it("legacy routing keeps finalize fee 100% to feeRecipient while trade fees still split league/protocol", async () => {
    const { owner, alice, leagueRouter, leagueVault, factory, creator } = await loadFixture(deployLegacySystem);
    const { campaign, token } = await createCampaign(factory, creator, "Legacy");

    const ownerBeforeBuy = await getBalance(await owner.getAddress());
    const leagueBeforeBuy = await getBalance(await leagueVault.getAddress());

    const amountOut = ethers.parseEther("10");
    const total = await campaign.quoteBuyExactTokens(amountOut);
    const buyMath = quoteBuyExactTokens(
      0n,
      amountOut,
      BigInt(await campaign.basePrice()),
      BigInt(await campaign.priceSlope()),
      BigInt(await campaign.protocolFeeBps())
    );
    await campaign.connect(alice).buyExactTokens(amountOut, total, { value: total });

    const ownerAfterBuy = await getBalance(await owner.getAddress());
    const leagueAfterBuy = await getBalance(await leagueVault.getAddress());
    const leagueExpected = (buyMath.costNoFee * BigInt(await campaign.leagueFeeBps())) / 10_000n;
    expect(leagueAfterBuy - leagueBeforeBuy).to.equal(leagueExpected);
    expect(ownerAfterBuy - ownerBeforeBuy).to.equal(buyMath.fee - leagueExpected);

    const target = await campaign.graduationTarget();
    const balanceBeforeTopup = await getBalance(await campaign.getAddress());
    await alice.sendTransaction({ to: await campaign.getAddress(), value: target - balanceBeforeTopup });

    const ownerBeforeFinalize = await getBalance(await owner.getAddress());
    const leagueBeforeFinalize = await getBalance(await leagueVault.getAddress());
    const balanceBeforeFinalize = await getBalance(await campaign.getAddress());
    const finalizeFee = (balanceBeforeFinalize * BigInt(await campaign.protocolFeeBps())) / 10_000n;

    await campaign.connect(creator).finalize(0, 0);

    const ownerAfterFinalize = await getBalance(await owner.getAddress());
    const leagueAfterFinalize = await getBalance(await leagueVault.getAddress());
    expect(ownerAfterFinalize - ownerBeforeFinalize).to.equal(finalizeFee);
    expect(leagueAfterFinalize - leagueBeforeFinalize).to.equal(0n);

    expect(await token.tradingEnabled()).to.equal(true);
  });

  it("unified finalize routing preserves LP funding and creator payout versus legacy mode", async () => {
    const routed = await loadFixture(deployRoutedSystem);
    const legacy = await loadFixture(deployLegacySystem);

    const { campaign: routedCampaign } = await createCampaign(routed.factory, routed.creator, "RU");
    const { campaign: legacyCampaign } = await createCampaign(legacy.factory, legacy.creator, "LE");

    const oneToken = ethers.parseUnits("1", 18);
    const routedQuote = await routedCampaign.quoteBuyExactTokens(oneToken);
    const legacyQuote = await legacyCampaign.quoteBuyExactTokens(oneToken);
    expect(routedQuote).to.equal(legacyQuote);

    await routedCampaign.connect(routed.alice).buyExactTokens(oneToken, routedQuote, { value: routedQuote });
    await legacyCampaign.connect(legacy.alice).buyExactTokens(oneToken, legacyQuote, { value: legacyQuote });

    const routedTarget = await routedCampaign.graduationTarget();
    const legacyTarget = await legacyCampaign.graduationTarget();
    expect(routedTarget).to.equal(legacyTarget);

    const routedBalance = await getBalance(await routedCampaign.getAddress());
    const legacyBalance = await getBalance(await legacyCampaign.getAddress());
    await routed.alice.sendTransaction({ to: await routedCampaign.getAddress(), value: routedTarget - routedBalance });
    await legacy.alice.sendTransaction({ to: await legacyCampaign.getAddress(), value: legacyTarget - legacyBalance });

    const routedProtocolBefore = await getBalance(await routed.protocolVault.getAddress());
    const routedAirdropBefore = await routed.communityVault.warzoneAirdropBalance();

    const routedFinalize = await parseFinalizedEvent(routedCampaign, await routedCampaign.connect(routed.creator).finalize(0, 0));
    const legacyFinalize = await parseFinalizedEvent(legacyCampaign, await legacyCampaign.connect(legacy.creator).finalize(0, 0));

    expect(routedFinalize[1]).to.equal(legacyFinalize[1]); // usedTokens
    expect(routedFinalize[2]).to.equal(legacyFinalize[2]); // usedBnb to LP
    expect(routedFinalize[3]).to.equal(legacyFinalize[3]); // total finalize fee envelope
    expect(routedFinalize[4]).to.equal(legacyFinalize[4]); // creator payout

    const expectedFinalizeSplit = await routed.treasuryRouter.previewRoute(routedFinalize[3], ROUTE_KIND_FINALIZE, ROUTE_PROFILE_STANDARD_UNLINKED);
    expect((await getBalance(await routed.protocolVault.getAddress())) - routedProtocolBefore).to.equal(expectedFinalizeSplit.protocol);
    expect((await routed.communityVault.warzoneAirdropBalance()) - routedAirdropBefore).to.equal(expectedFinalizeSplit.airdrop);
  });
});
