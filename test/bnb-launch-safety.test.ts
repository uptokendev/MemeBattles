import { expect } from "chai";
import { ethers, network } from "hardhat";
import { deployRoutedLaunchFactory } from "./helpers/deployRouting";

async function increaseTime(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

function campaignRequest(overrides: Record<string, unknown> = {}) {
  return {
    name: "Safety Token",
    symbol: "SAFE",
    logoURI: "ipfs://safety-token-logo",
    xAccount: "@safety",
    website: "https://memewarzone.example/safety",
    extraLink: "https://memewarzone.example/docs",
    basePrice: 0,
    priceSlope: 0,
    graduationTarget: 0,
    lpReceiver: ethers.ZeroAddress,
    ...overrides,
  };
}

async function deploySafetyFixture() {
  const [owner, creator, buyer, routeAuthority, attacker] = await ethers.getSigners();

  const CreatorRegistry = await ethers.getContractFactory("CreatorRegistry");
  const RiskRegistry = await ethers.getContractFactory("RiskRegistry");

  const { factory, treasuryRouter } = await deployRoutedLaunchFactory(owner);
  const creatorRegistry = await CreatorRegistry.deploy();
  const riskRegistry = await RiskRegistry.deploy();

  await creatorRegistry.waitForDeployment();
  await riskRegistry.waitForDeployment();

  await creatorRegistry.setLaunchRecorder(await factory.getAddress(), true);
  await factory.setRegistries(await creatorRegistry.getAddress(), await riskRegistry.getAddress());
  await factory.setRouteAuthority(routeAuthority.address);
  await factory.enableLive();

  return { owner, creator, buyer, routeAuthority, attacker, leagueReceiver: treasuryRouter, factory, creatorRegistry, riskRegistry };
}

async function createCampaign(factory: any, creator: any, overrides: Record<string, unknown> = {}) {
  const tx = await factory.connect(creator).createCampaign(campaignRequest(overrides));
  await tx.wait();
  const info = await factory.getCampaign((await factory.campaignsCount()) - 1n);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const token = await ethers.getContractAt("LaunchToken", info.token);
  return { info, campaign, token };
}

async function signCreateRoute(factory: any, creator: string, signer: any, tradeProfile: number, finalizeProfile: number, deadline: bigint) {
  const { chainId } = await ethers.provider.getNetwork();
  const digest = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint8", "uint64"],
    ["MWZ_CREATE_ROUTE_AUTH", chainId, await factory.getAddress(), creator, tradeProfile, finalizeProfile, deadline]
  );
  return signer.signMessage(ethers.getBytes(digest));
}

describe("BNB launch safety simulations", function () {
  it("blocks creation until live and while create pause is enabled", async function () {
    const [owner, creator] = await ethers.getSigners();
    const { factory } = await deployRoutedLaunchFactory(owner);

    await expect(factory.connect(creator).createCampaign(campaignRequest())).to.be.revertedWithCustomError(factory, "NotLive");

    await factory.enableLive();
    await factory.setCreatePaused(true);

    await expect(factory.connect(creator).createCampaign(campaignRequest())).to.be.revertedWithCustomError(factory, "CreatePaused");
  });

  it("enforces creator manual review, cooldown, live count, and cluster launch limits", async function () {
    const { owner, creator, attacker, factory, creatorRegistry, riskRegistry } = await deploySafetyFixture();

    await creatorRegistry.setManualReviewRequired(creator.address, true);
    await expect(factory.connect(creator).createCampaign(campaignRequest())).to.be.revertedWithCustomError(factory, "CreatorNotEligible");

    await creatorRegistry.setManualReviewRequired(creator.address, false);
    await createCampaign(factory, creator);
    await expect(factory.connect(creator).createCampaign(campaignRequest({ symbol: "COOL" }))).to.be.revertedWithCustomError(
      factory,
      "CreatorNotEligible"
    );

    await creatorRegistry.setLaunchRecorder(owner.address, true);
    for (let i = 0; i < 3; i += 1) {
      await creatorRegistry.recordLaunch(attacker.address);
      if (i < 2) await increaseTime(24 * 60 * 60 + 1);
    }
    await expect(factory.connect(attacker).createCampaign(campaignRequest({ symbol: "LIVE" }))).to.be.revertedWithCustomError(
      factory,
      "CreatorNotEligible"
    );

    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("cluster-above-new-creator-limit"));
    await riskRegistry.setWalletCluster(creator.address, clusterId);
    await riskRegistry.setClusterRisk(clusterId, 4, 2, false);
    await increaseTime(24 * 60 * 60 + 1);

    await expect(factory.connect(creator).createCampaign(campaignRequest({ symbol: "CLUS" }))).to.be.revertedWithCustomError(
      factory,
      "RiskNotEligible"
    );
  });

  it("blocks direct trading when route authorization is required", async function () {
    const { creator, buyer, factory } = await deploySafetyFixture();
    await factory.setRequireAuthorizedTrading(true);

    const { campaign } = await createCampaign(factory, creator);
    const amountOut = ethers.parseEther("1");
    const maxCost = await campaign.quoteBuyExactTokens(amountOut);

    await expect(campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost })).to.be.revertedWith(
      "authorized trading required"
    );
  });

  it("blocks restricted wallets, buy/sell pauses, and creator buy lock/cap paths", async function () {
    const { creator, buyer, factory, riskRegistry } = await deploySafetyFixture();
    const { campaign, token } = await createCampaign(factory, creator);

    const amountOut = ethers.parseEther("1");
    const maxCost = await campaign.quoteBuyExactTokens(amountOut);

    await riskRegistry.setWalletRisk(buyer.address, 3, true);
    await expect(campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost })).to.be.revertedWithCustomError(
      riskRegistry,
      "WalletRestricted"
    );

    await riskRegistry.setWalletRisk(buyer.address, 0, false);
    await factory.setCampaignPauses(await campaign.getAddress(), false, true, false, false);
    await expect(campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost })).to.be.revertedWith("buys paused");

    await factory.setCampaignPauses(await campaign.getAddress(), false, false, false, false);
    await campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost });
    await token.connect(buyer).approve(await campaign.getAddress(), amountOut);
    await factory.setCampaignPauses(await campaign.getAddress(), false, false, true, false);
    await expect(campaign.connect(buyer).sellExactTokens(amountOut, 0)).to.be.revertedWith("sells paused");

    await factory.setCampaignPauses(await campaign.getAddress(), false, false, false, false);
    const creatorLockedCost = await campaign.quoteBuyExactTokens(amountOut);
    await expect(campaign.connect(creator).buyExactTokens(amountOut, creatorLockedCost, { value: creatorLockedCost })).to.be.revertedWith(
      "creator buy locked"
    );

    await increaseTime(24 * 60 * 60 + 1);
    const capBreakerAmount = ethers.parseEther("5000");
    const capBreakerCost = await campaign.quoteBuyExactTokens(capBreakerAmount);
    await expect(
      campaign.connect(creator).buyExactTokens(capBreakerAmount, capBreakerCost, { value: capBreakerCost })
    ).to.be.revertedWith("creator buy cap");
  });

  it("accepts only the configured route authority for create route authorization", async function () {
    const { creator, routeAuthority, attacker, factory } = await deploySafetyFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? 0) + 3600);
    const tradeProfile = 2;
    const finalizeProfile = 2;

    const badSignature = await signCreateRoute(factory, creator.address, attacker, tradeProfile, finalizeProfile, deadline);
    await expect(
      factory.connect(creator).createCampaignAuthorized(campaignRequest({ symbol: "BADA" }), {
        tradeRouteProfile: tradeProfile,
        finalizeRouteProfile: finalizeProfile,
        deadline,
        signature: badSignature,
      })
    ).to.be.revertedWithCustomError(factory, "InvalidRouteAuthorization");

    const validSignature = await signCreateRoute(factory, creator.address, routeAuthority, tradeProfile, finalizeProfile, deadline);
    await expect(
      factory.connect(creator).createCampaignAuthorized(campaignRequest({ symbol: "AUTH" }), {
        tradeRouteProfile: tradeProfile,
        finalizeRouteProfile: finalizeProfile,
        deadline,
        signature: validSignature,
      })
    ).to.emit(factory, "CampaignCreated");
  });
});
