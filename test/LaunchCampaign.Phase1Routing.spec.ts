import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { quoteBuyExactTokens, quoteSellExactTokens } from "./helpers/math";
import { getBalance } from "./helpers/balances";

async function deployPhase1RoutingFixture() {
  const [owner, creator, alice, bob] = await ethers.getSigners();

  const V2Factory = await ethers.getContractFactory("MockV2Factory");
  const v2factory = await V2Factory.deploy();

  const DexRouter = await ethers.getContractFactory("MockRouter");
  const dexRouter = await DexRouter.deploy(await v2factory.getAddress(), await owner.getAddress());

  const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
  const leagueVault = await AcceptingReceiver.deploy();
  const recruiterVault = await AcceptingReceiver.deploy();
  const protocolVault = await AcceptingReceiver.deploy();

  const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
  const treasuryRouter = await TreasuryRouter.deploy(await owner.getAddress(), await leagueVault.getAddress(), 3600);

  const CommunityRewardsVault = await ethers.getContractFactory("CommunityRewardsVault");
  const communityVault = await CommunityRewardsVault.deploy(await owner.getAddress(), ethers.ZeroAddress);
  await communityVault.connect(owner).setRouter(await treasuryRouter.getAddress());

  await treasuryRouter.connect(owner).setRecruiterRewardsVault(await recruiterVault.getAddress());
  await treasuryRouter.connect(owner).setCommunityRewardsVault(await communityVault.getAddress());
  await treasuryRouter.connect(owner).setProtocolRevenueVault(await protocolVault.getAddress());

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(await dexRouter.getAddress(), await treasuryRouter.getAddress());
  await factory.connect(owner).setFeeRecipient(await treasuryRouter.getAddress());
  await factory.connect(owner).setRouteAuthority(await owner.getAddress());
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
    bob,
    dexRouter,
    leagueVault,
    recruiterVault,
    protocolVault,
    treasuryRouter,
    communityVault,
    factory,
  };
}

async function signTradeRouteAuthorization(params: {
  signer: any;
  campaignAddress: string;
  actor: string;
  routeProfile: number;
  deadline: bigint;
  chainId: bigint;
}) {
  const digest = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint64"],
    [
      "MWZ_ROUTE_TRADE_AUTH",
      params.chainId,
      params.campaignAddress,
      params.actor,
      params.routeProfile,
      params.deadline,
    ]
  );
  return params.signer.signMessage(ethers.getBytes(digest));
}

async function createCampaignViaPhase1RouterFixture(tradeRouteProfile = 1, finalizeRouteProfile = 1) {
  const fx = await deployPhase1RoutingFixture();
  await fx.factory.connect(fx.owner).setRouteProfiles(tradeRouteProfile, finalizeRouteProfile);
  const req = {
    name: "Phase1Token",
    symbol: "P1T",
    logoURI: "ipfs://phase1",
    xAccount: "phase1",
    website: "https://memewar.zone",
    extraLink: "https://docs.memewar.zone",
    basePrice: 0n,
    priceSlope: 0n,
    graduationTarget: 0n,
    lpReceiver: ethers.ZeroAddress,
    initialBuyBnbWei: 0n,
  };

  await fx.factory.connect(fx.creator).createCampaign(req as any);
  const info = await fx.factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const token = await ethers.getContractAt("LaunchToken", await campaign.token());

  return { ...fx, req, info, campaign, token, tradeRouteProfile, finalizeRouteProfile };
}

async function createLinkedCampaignViaPhase1RouterFixture() {
  return createCampaignViaPhase1RouterFixture(0, 0);
}

async function createOgCampaignViaPhase1RouterFixture() {
  return createCampaignViaPhase1RouterFixture(2, 2);
}

describe("LaunchCampaign Phase 1 router integration", function () {
  it("routes buy fees through TreasuryRouter using StandardUnlinked trade splits", async () => {
    const { campaign, token, alice, treasuryRouter, leagueVault, recruiterVault, protocolVault, communityVault } =
      await loadFixture(createCampaignViaPhase1RouterFixture);

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

    const expected = await treasuryRouter.previewRoute(fee, 0, 1);
    const leagueBefore = await getBalance(await leagueVault.getAddress());
    const recruiterBefore = await getBalance(await recruiterVault.getAddress());
    const protocolBefore = await getBalance(await protocolVault.getAddress());
    const airdropBefore = await communityVault.warzoneAirdropBalance();
    const squadBefore = await communityVault.squadPoolBalance();
    const campaignBefore = await getBalance(await campaign.getAddress());

    await campaign.connect(alice).buyExactTokens(amountOut, total, { value: total });

    expect(await token.balanceOf(await alice.getAddress())).to.equal(amountOut);
    expect((await getBalance(await leagueVault.getAddress())) - leagueBefore).to.equal(expected.league);
    expect((await getBalance(await recruiterVault.getAddress())) - recruiterBefore).to.equal(expected.recruiter);
    expect((await getBalance(await protocolVault.getAddress())) - protocolBefore).to.equal(expected.protocol);
    expect((await communityVault.warzoneAirdropBalance()) - airdropBefore).to.equal(expected.airdrop);
    expect((await communityVault.squadPoolBalance()) - squadBefore).to.equal(expected.squad);
    expect((await getBalance(await campaign.getAddress())) - campaignBefore).to.equal(costNoFee);
  });

  it("routes sell fees through TreasuryRouter using StandardUnlinked trade splits", async () => {
    const { campaign, token, alice, treasuryRouter, leagueVault, recruiterVault, protocolVault, communityVault } =
      await loadFixture(createCampaignViaPhase1RouterFixture);

    const amountOut = ethers.parseEther("10");
    const buyTotal = await campaign.quoteBuyExactTokens(amountOut);
    await campaign.connect(alice).buyExactTokens(amountOut, buyTotal, { value: buyTotal });

    const amountIn = ethers.parseEther("4");
    await token.connect(alice).approve(await campaign.getAddress(), amountIn);

    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();
    const feeBps = await campaign.protocolFeeBps();
    const soldBefore = await campaign.sold();
    const { gross, fee, payout } = quoteSellExactTokens(
      BigInt(soldBefore),
      BigInt(amountIn),
      BigInt(base),
      BigInt(slope),
      BigInt(feeBps)
    );

    const expected = await treasuryRouter.previewRoute(fee, 0, 1);
    const leagueBefore = await getBalance(await leagueVault.getAddress());
    const recruiterBefore = await getBalance(await recruiterVault.getAddress());
    const protocolBefore = await getBalance(await protocolVault.getAddress());
    const airdropBefore = await communityVault.warzoneAirdropBalance();
    const squadBefore = await communityVault.squadPoolBalance();
    const campaignBefore = await getBalance(await campaign.getAddress());

    await campaign.connect(alice).sellExactTokens(amountIn, payout);

    expect((await getBalance(await leagueVault.getAddress())) - leagueBefore).to.equal(expected.league);
    expect((await getBalance(await recruiterVault.getAddress())) - recruiterBefore).to.equal(expected.recruiter);
    expect((await getBalance(await protocolVault.getAddress())) - protocolBefore).to.equal(expected.protocol);
    expect((await communityVault.warzoneAirdropBalance()) - airdropBefore).to.equal(expected.airdrop);
    expect((await communityVault.squadPoolBalance()) - squadBefore).to.equal(expected.squad);
    expect(campaignBefore - (await getBalance(await campaign.getAddress()))).to.equal(gross);
  });

  it("routes finalize fees through TreasuryRouter using StandardUnlinked finalize splits without breaking launch", async () => {
    const { campaign, creator, alice, treasuryRouter, leagueVault, recruiterVault, protocolVault, communityVault } =
      await loadFixture(createCampaignViaPhase1RouterFixture);

    const oneToken = ethers.parseUnits("1", 18);
    const quote = await campaign.quoteBuyExactTokens(oneToken);
    await campaign.connect(alice).buyExactTokens(oneToken, quote, { value: quote });

    const target = await campaign.graduationTarget();
    const balanceBeforeTopup = await ethers.provider.getBalance(await campaign.getAddress());
    const topup = target - balanceBeforeTopup;
    await alice.sendTransaction({ to: await campaign.getAddress(), value: topup });

    const balanceBeforeFinalize = await ethers.provider.getBalance(await campaign.getAddress());
    const protocolFeeBps = await campaign.protocolFeeBps();
    const protocolFee = (balanceBeforeFinalize * protocolFeeBps) / 10_000n;
    const expected = await treasuryRouter.previewRoute(protocolFee, 1, 1);

    const leagueBefore = await getBalance(await leagueVault.getAddress());
    const recruiterBefore = await getBalance(await recruiterVault.getAddress());
    const protocolBefore = await getBalance(await protocolVault.getAddress());
    const airdropBefore = await communityVault.warzoneAirdropBalance();
    const squadBefore = await communityVault.squadPoolBalance();

    const tx = await campaign.connect(creator).finalize(0, 0);
    const rc = await tx.wait();

    expect(await campaign.launched()).to.equal(true);
    expect((await getBalance(await leagueVault.getAddress())) - leagueBefore).to.equal(expected.league);
    expect((await getBalance(await recruiterVault.getAddress())) - recruiterBefore).to.equal(expected.recruiter);
    expect((await getBalance(await protocolVault.getAddress())) - protocolBefore).to.equal(expected.protocol);
    expect((await communityVault.warzoneAirdropBalance()) - airdropBefore).to.equal(expected.airdrop);
    expect((await communityVault.squadPoolBalance()) - squadBefore).to.equal(expected.squad);

    const event = rc!.logs
      .map((log: any) => {
        try {
          return campaign.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "CampaignFinalized");

    expect(event).to.not.equal(undefined);
    expect(event!.args[3]).to.equal(protocolFee);
  });

  it("routes linked trade + finalize profiles end to end when factory is configured for StandardLinked", async () => {
    const { campaign, creator, alice, treasuryRouter, recruiterVault, protocolVault, communityVault } =
      await loadFixture(createLinkedCampaignViaPhase1RouterFixture);

    const amountOut = ethers.parseEther("10");
    const buyTotal = await campaign.quoteBuyExactTokens(amountOut);
    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();
    const feeBps = await campaign.protocolFeeBps();
    const sold0 = await campaign.sold();
    const { fee } = quoteBuyExactTokens(
      BigInt(sold0),
      BigInt(amountOut),
      BigInt(base),
      BigInt(slope),
      BigInt(feeBps)
    );
    const expectedTrade = await treasuryRouter.previewRoute(fee, 0, 0);

    const recruiterBeforeTrade = await getBalance(await recruiterVault.getAddress());
    const protocolBeforeTrade = await getBalance(await protocolVault.getAddress());
    const squadBeforeTrade = await communityVault.squadPoolBalance();

    await campaign.connect(alice).buyExactTokens(amountOut, buyTotal, { value: buyTotal });

    expect((await getBalance(await recruiterVault.getAddress())) - recruiterBeforeTrade).to.equal(expectedTrade.recruiter);
    expect((await getBalance(await protocolVault.getAddress())) - protocolBeforeTrade).to.equal(expectedTrade.protocol);
    expect((await communityVault.squadPoolBalance()) - squadBeforeTrade).to.equal(expectedTrade.squad);

    const target = await campaign.graduationTarget();
    const balanceBeforeTopup = await ethers.provider.getBalance(await campaign.getAddress());
    await alice.sendTransaction({ to: await campaign.getAddress(), value: target - balanceBeforeTopup });

    const balanceBeforeFinalize = await ethers.provider.getBalance(await campaign.getAddress());
    const protocolFee = (balanceBeforeFinalize * feeBps) / 10_000n;
    const expectedFinalize = await treasuryRouter.previewRoute(protocolFee, 1, 0);

    const recruiterBeforeFinalize = await getBalance(await recruiterVault.getAddress());
    const protocolBeforeFinalize = await getBalance(await protocolVault.getAddress());
    const squadBeforeFinalize = await communityVault.squadPoolBalance();

    await campaign.connect(creator).finalize(0, 0);

    expect((await getBalance(await recruiterVault.getAddress())) - recruiterBeforeFinalize).to.equal(expectedFinalize.recruiter);
    expect((await getBalance(await protocolVault.getAddress())) - protocolBeforeFinalize).to.equal(expectedFinalize.protocol);
    expect((await communityVault.squadPoolBalance()) - squadBeforeFinalize).to.equal(expectedFinalize.squad);
  });

  it("routes OG-linked trade + finalize profiles end to end when factory is configured for OgLinked", async () => {
    const { campaign, creator, alice, treasuryRouter, recruiterVault, protocolVault, communityVault } =
      await loadFixture(createOgCampaignViaPhase1RouterFixture);

    const amountOut = ethers.parseEther("10");
    const buyTotal = await campaign.quoteBuyExactTokens(amountOut);
    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();
    const feeBps = await campaign.protocolFeeBps();
    const sold0 = await campaign.sold();
    const { fee } = quoteBuyExactTokens(
      BigInt(sold0),
      BigInt(amountOut),
      BigInt(base),
      BigInt(slope),
      BigInt(feeBps)
    );
    const expectedTrade = await treasuryRouter.previewRoute(fee, 0, 2);

    const recruiterBeforeTrade = await getBalance(await recruiterVault.getAddress());
    const protocolBeforeTrade = await getBalance(await protocolVault.getAddress());
    const squadBeforeTrade = await communityVault.squadPoolBalance();

    await campaign.connect(alice).buyExactTokens(amountOut, buyTotal, { value: buyTotal });

    expect((await getBalance(await recruiterVault.getAddress())) - recruiterBeforeTrade).to.equal(expectedTrade.recruiter);
    expect((await getBalance(await protocolVault.getAddress())) - protocolBeforeTrade).to.equal(expectedTrade.protocol);
    expect((await communityVault.squadPoolBalance()) - squadBeforeTrade).to.equal(expectedTrade.squad);

    const target = await campaign.graduationTarget();
    const balanceBeforeTopup = await ethers.provider.getBalance(await campaign.getAddress());
    await alice.sendTransaction({ to: await campaign.getAddress(), value: target - balanceBeforeTopup });

    const balanceBeforeFinalize = await ethers.provider.getBalance(await campaign.getAddress());
    const protocolFee = (balanceBeforeFinalize * feeBps) / 10_000n;
    const expectedFinalize = await treasuryRouter.previewRoute(protocolFee, 1, 2);

    const recruiterBeforeFinalize = await getBalance(await recruiterVault.getAddress());
    const protocolBeforeFinalize = await getBalance(await protocolVault.getAddress());
    const squadBeforeFinalize = await communityVault.squadPoolBalance();

    await campaign.connect(creator).finalize(0, 0);

    expect((await getBalance(await recruiterVault.getAddress())) - recruiterBeforeFinalize).to.equal(expectedFinalize.recruiter);
    expect((await getBalance(await protocolVault.getAddress())) - protocolBeforeFinalize).to.equal(expectedFinalize.protocol);
    expect((await communityVault.squadPoolBalance()) - squadBeforeFinalize).to.equal(expectedFinalize.squad);
  });

  it("routes authorized trade fees per wallet without changing the campaign default profile", async () => {
    const { campaign, alice, owner, treasuryRouter, recruiterVault, protocolVault, communityVault } =
      await loadFixture(createCampaignViaPhase1RouterFixture);

    const amountOut = ethers.parseEther("10");
    const buyTotal = await campaign.quoteBuyExactTokens(amountOut);
    const base = await campaign.basePrice();
    const slope = await campaign.priceSlope();
    const feeBps = await campaign.protocolFeeBps();
    const sold0 = await campaign.sold();
    const { fee } = quoteBuyExactTokens(
      BigInt(sold0),
      BigInt(amountOut),
      BigInt(base),
      BigInt(slope),
      BigInt(feeBps)
    );

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 600);
    const signature = await signTradeRouteAuthorization({
      signer: owner,
      campaignAddress: await campaign.getAddress(),
      actor: await alice.getAddress(),
      routeProfile: 0,
      deadline,
      chainId,
    });
    const expectedTrade = await treasuryRouter.previewRoute(fee, 0, 0);

    const recruiterBeforeTrade = await getBalance(await recruiterVault.getAddress());
    const protocolBeforeTrade = await getBalance(await protocolVault.getAddress());
    const squadBeforeTrade = await communityVault.squadPoolBalance();

    await campaign.connect(alice).buyExactTokensAuthorized(amountOut, buyTotal, 0, deadline, signature, { value: buyTotal });

    expect((await getBalance(await recruiterVault.getAddress())) - recruiterBeforeTrade).to.equal(expectedTrade.recruiter);
    expect((await getBalance(await protocolVault.getAddress())) - protocolBeforeTrade).to.equal(expectedTrade.protocol);
    expect((await communityVault.squadPoolBalance()) - squadBeforeTrade).to.equal(expectedTrade.squad);
    expect(await campaign.tradeRouteProfile()).to.equal(1n);
  });

});
