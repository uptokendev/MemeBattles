import { expect } from "chai";
import { ethers } from "hardhat";

const STANDARD_LINKED = 0;
const STANDARD_UNLINKED = 1;
const OG_LINKED = 2;

async function signCreateRouteAuth({
  signer,
  chainId,
  factory,
  creator,
  tradeRouteProfile,
  finalizeRouteProfile,
  deadline,
}: {
  signer: any;
  chainId: bigint;
  factory: string;
  creator: string;
  tradeRouteProfile: number;
  finalizeRouteProfile: number;
  deadline: bigint;
}) {
  const digest = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint8", "uint64"],
    [
      "MWZ_CREATE_ROUTE_AUTH",
      chainId,
      factory,
      creator,
      tradeRouteProfile,
      finalizeRouteProfile,
      deadline,
    ],
  );
  return signer.signMessage(ethers.getBytes(digest));
}

async function signTradeRouteAuth({
  signer,
  chainId,
  campaign,
  actor,
  routeProfile,
  deadline,
}: {
  signer: any;
  chainId: bigint;
  campaign: string;
  actor: string;
  routeProfile: number;
  deadline: bigint;
}) {
  const digest = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint64"],
    ["MWZ_ROUTE_TRADE_AUTH", chainId, campaign, actor, routeProfile, deadline],
  );
  return signer.signMessage(ethers.getBytes(digest));
}

async function currentDeadline(offset = 3600) {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("missing latest block");
  return BigInt(block.timestamp + offset);
}

async function deployFixture() {
  const [admin, routeAuthority, creator, trader, leagueVault, recruiterVault, communityVault, protocolVault, pancakeRouter] =
    await ethers.getSigners();

  const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
  const treasury = await TreasuryRouter.deploy(admin.address, leagueVault.address, 3600);
  await treasury.waitForDeployment();
  await treasury.connect(admin).setRecruiterRewardsVault(recruiterVault.address);
  await treasury.connect(admin).setCommunityRewardsVault(communityVault.address);
  await treasury.connect(admin).setProtocolRevenueVault(protocolVault.address);

  const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
  const factory = await LaunchFactory.deploy(pancakeRouter.address, await treasury.getAddress());
  await factory.waitForDeployment();
  await factory.connect(admin).setFeeRecipient(await treasury.getAddress());
  await factory.connect(admin).setRouteAuthority(routeAuthority.address);
  await factory.connect(admin).enableLive();

  const chainId = BigInt((await ethers.provider.getNetwork()).chainId);

  const request = {
    name: "MemeWarzone Test",
    symbol: "MWZT",
    logoURI: "ipfs://logo",
    xAccount: "",
    website: "",
    extraLink: "",
    basePrice: 0,
    priceSlope: 0,
    graduationTarget: 0,
    lpReceiver: ethers.ZeroAddress,
    initialBuyBnbWei: 0,
  };

  return {
    admin,
    routeAuthority,
    creator,
    trader,
    factory,
    treasury,
    chainId,
    request,
  };
}

async function createAuthorizedCampaign(fixture: Awaited<ReturnType<typeof deployFixture>>, tradeProfile: number, finalizeProfile: number) {
  const { creator, routeAuthority, factory, chainId, request } = fixture;
  const deadline = await currentDeadline();
  const signature = await signCreateRouteAuth({
    signer: routeAuthority,
    chainId,
    factory: await factory.getAddress(),
    creator: creator.address,
    tradeRouteProfile: tradeProfile,
    finalizeRouteProfile: finalizeProfile,
    deadline,
  });

  const tx = await factory.connect(creator).createCampaignAuthorized(request, {
    tradeRouteProfile: tradeProfile,
    finalizeRouteProfile: finalizeProfile,
    deadline,
    signature,
  });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("missing receipt");

  const event = receipt.logs
    .map((log: any) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed: any) => parsed?.name === "CampaignCreated");
  if (!event) throw new Error("CampaignCreated not found");

  expect(event.args.logoURI).to.equal(request.logoURI);
  expect(event.args.metadataURI).to.equal("");

  const campaignAddress = event.args.campaign;
  const campaign = await ethers.getContractAt("LaunchCampaign", campaignAddress);
  return { campaign, campaignAddress };
}

describe("Phase 6 route authorization alignment", function () {
  it("uses the backend route-profile ID order in factory and treasury", async function () {
    const fixture = await deployFixture();
    const { factory, treasury } = fixture;

    expect(await factory.ROUTE_PROFILE_STANDARD_LINKED()).to.equal(STANDARD_LINKED);
    expect(await factory.ROUTE_PROFILE_STANDARD_UNLINKED()).to.equal(STANDARD_UNLINKED);
    expect(await factory.ROUTE_PROFILE_OG_LINKED()).to.equal(OG_LINKED);

    expect(await treasury.previewRoute(10_000n, 0, STANDARD_LINKED)).to.deep.equal([
      3750n,
      1250n,
      0n,
      250n,
      4750n,
    ]);
    expect(await treasury.previewRoute(10_000n, 0, STANDARD_UNLINKED)).to.deep.equal([
      3750n,
      0n,
      1500n,
      0n,
      4750n,
    ]);
    expect(await treasury.previewRoute(10_000n, 0, OG_LINKED)).to.deep.equal([
      3750n,
      1500n,
      0n,
      250n,
      4500n,
    ]);
  });

  for (const [label, tradeProfile, finalizeProfile] of [
    ["StandardLinked", STANDARD_LINKED, STANDARD_LINKED],
    ["StandardUnlinked", STANDARD_UNLINKED, STANDARD_UNLINKED],
    ["OgLinked", OG_LINKED, OG_LINKED],
  ] as const) {
    it(`creates an authorized campaign with ${label} route profiles`, async function () {
      const fixture = await deployFixture();
      const { campaign } = await createAuthorizedCampaign(fixture, tradeProfile, finalizeProfile);

      expect(await campaign.tradeRouteProfile()).to.equal(tradeProfile);
      expect(await campaign.finalizeRouteProfile()).to.equal(finalizeProfile);
    });
  }

  it("rejects create authorization from the wrong signer", async function () {
    const fixture = await deployFixture();
    const { creator, trader, factory, chainId, request } = fixture;
    const deadline = await currentDeadline();
    const signature = await signCreateRouteAuth({
      signer: trader,
      chainId,
      factory: await factory.getAddress(),
      creator: creator.address,
      tradeRouteProfile: OG_LINKED,
      finalizeRouteProfile: OG_LINKED,
      deadline,
    });

    await expect(
      factory.connect(creator).createCampaignAuthorized(request, {
        tradeRouteProfile: OG_LINKED,
        finalizeRouteProfile: OG_LINKED,
        deadline,
        signature,
      }),
    ).to.be.revertedWithCustomError(factory, "InvalidRouteAuthorization");
  });

  it("rejects expired create authorization", async function () {
    const fixture = await deployFixture();
    const { creator, routeAuthority, factory, chainId, request } = fixture;
    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("missing latest block");
    const deadline = BigInt(block.timestamp - 1);
    const signature = await signCreateRouteAuth({
      signer: routeAuthority,
      chainId,
      factory: await factory.getAddress(),
      creator: creator.address,
      tradeRouteProfile: OG_LINKED,
      finalizeRouteProfile: OG_LINKED,
      deadline,
    });

    await expect(
      factory.connect(creator).createCampaignAuthorized(request, {
        tradeRouteProfile: OG_LINKED,
        finalizeRouteProfile: OG_LINKED,
        deadline,
        signature,
      }),
    ).to.be.revertedWithCustomError(factory, "RouteAuthorizationExpired");
  });

  it("routes authorized buy fees with the provided trade route profile", async function () {
    const fixture = await deployFixture();
    const { trader, routeAuthority, treasury, chainId } = fixture;
    const { campaign, campaignAddress } = await createAuthorizedCampaign(fixture, STANDARD_UNLINKED, STANDARD_UNLINKED);

    const amountOut = ethers.parseEther("1000");
    const maxCost = await campaign.quoteBuyExactTokens(amountOut);
    const protocolFeeBps = await campaign.protocolFeeBps();
    const feeAmount = (maxCost * protocolFeeBps) / (10_000n + protocolFeeBps);
    const routeAmounts = await treasury.previewRoute(feeAmount, 0, OG_LINKED);
    const deadline = await currentDeadline();
    const signature = await signTradeRouteAuth({
      signer: routeAuthority,
      chainId,
      campaign: campaignAddress,
      actor: trader.address,
      routeProfile: OG_LINKED,
      deadline,
    });

    await expect(
      campaign.connect(trader).buyExactTokensAuthorized(amountOut, maxCost, OG_LINKED, deadline, signature, { value: maxCost }),
    )
      .to.emit(treasury, "RouteExecuted")
      .withArgs(
        0,
        OG_LINKED,
        feeAmount,
        routeAmounts.league,
        routeAmounts.recruiter,
        routeAmounts.airdrop,
        routeAmounts.squad,
        routeAmounts.protocol,
      );
  });

  it("rejects trade authorization for the wrong actor", async function () {
    const fixture = await deployFixture();
    const { trader, creator, routeAuthority, chainId } = fixture;
    const { campaign, campaignAddress } = await createAuthorizedCampaign(fixture, STANDARD_UNLINKED, STANDARD_UNLINKED);

    const amountOut = ethers.parseEther("1000");
    const maxCost = await campaign.quoteBuyExactTokens(amountOut);
    const deadline = await currentDeadline();
    const signature = await signTradeRouteAuth({
      signer: routeAuthority,
      chainId,
      campaign: campaignAddress,
      actor: creator.address,
      routeProfile: STANDARD_LINKED,
      deadline,
    });

    await expect(
      campaign.connect(trader).buyExactTokensAuthorized(amountOut, maxCost, STANDARD_LINKED, deadline, signature, { value: maxCost }),
    ).to.be.revertedWith("bad route auth");
  });
});
