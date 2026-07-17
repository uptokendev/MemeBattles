import { expect } from "chai";
import { ethers, network } from "hardhat";
import { deployRoutedLaunchFactory } from "./helpers/deployRouting";

async function increaseTime(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

async function minePastBlock(blockNumber: bigint) {
  while (BigInt(await ethers.provider.getBlockNumber()) <= blockNumber) {
    await network.provider.send("evm_mine");
  }
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

function asBigInt(value: unknown) {
  return BigInt(value as string | number | bigint);
}

function hashCreateRouteRequest(req: ReturnType<typeof campaignRequest>) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint256", "uint256", "uint256", "address"],
      [
        ethers.keccak256(ethers.toUtf8Bytes(req.name)),
        ethers.keccak256(ethers.toUtf8Bytes(req.symbol)),
        ethers.keccak256(ethers.toUtf8Bytes(req.logoURI)),
        ethers.keccak256(ethers.toUtf8Bytes(req.xAccount)),
        ethers.keccak256(ethers.toUtf8Bytes(req.website)),
        ethers.keccak256(ethers.toUtf8Bytes(req.extraLink)),
        asBigInt(req.basePrice),
        asBigInt(req.priceSlope),
        asBigInt(req.graduationTarget),
        req.lpReceiver,
      ]
    )
  );
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

async function signCreateRoute(
  factory: any,
  creator: string,
  signer: any,
  req: ReturnType<typeof campaignRequest>,
  tradeProfile: number,
  finalizeProfile: number,
  deadline: bigint
) {
  const { chainId } = await ethers.provider.getNetwork();
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "address", "address", "bytes32", "uint8", "uint8", "uint64"],
      ["MWZ_CREATE_ROUTE_AUTH", chainId, await factory.getAddress(), creator, hashCreateRouteRequest(req), tradeProfile, finalizeProfile, deadline]
    )
  );
  return signer.signMessage(ethers.getBytes(digest));
}

async function signTradeRoute(
  campaign: any,
  actor: string,
  signer: any,
  routeProfile: number,
  action: number,
  amount: bigint,
  limit: bigint,
  deadline: bigint,
  chainIdOverride?: bigint
) {
  const networkInfo = await ethers.provider.getNetwork();
  const chainId = chainIdOverride ?? networkInfo.chainId;
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "address", "address", "uint8", "uint8", "uint256", "uint256", "uint64"],
      ["MWZ_ROUTE_TRADE_AUTH", chainId, await campaign.getAddress(), actor, routeProfile, action, amount, limit, deadline]
    )
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

    await expect(campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost })).to.be.revertedWithCustomError(
      campaign,
      "AuthorizedTradingRequired"
    );
  });

  it("enforces protected launch blocks through authorized routes and early buy caps", async function () {
    const { creator, buyer, routeAuthority, factory } = await deploySafetyFixture();
    const maxBuyWei = ethers.parseEther("0.0001");
    const maxWalletWei = ethers.parseEther("0.0001");
    await factory.setLaunchProtectionConfig(8, maxBuyWei, maxWalletWei);

    const { campaign } = await createCampaign(factory, creator, {
      basePrice: ethers.parseEther("0.00006"),
      priceSlope: 1n,
    });
    expect(await campaign.launchProtectionEndBlock()).to.be.gt(0n);
    expect(await campaign.launchProtectionMaxBuyWei()).to.equal(maxBuyWei);
    expect(await campaign.launchProtectionMaxWalletWei()).to.equal(maxWalletWei);

    const amountOut = ethers.parseEther("1");
    const maxCost = await campaign.quoteBuyExactTokens(amountOut);
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? 0) + 3600);
    const routeProfile = 1;

    await expect(campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost })).to.be.revertedWithCustomError(
      campaign,
      "AuthorizedTradingRequired"
    );

    const firstSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      amountOut,
      maxCost,
      deadline
    );
    await expect(
      campaign.connect(buyer).buyExactTokensAuthorized(amountOut, maxCost, routeProfile, deadline, firstSignature, { value: maxCost })
    ).to.emit(campaign, "TokensPurchased");

    const capBreakerAmount = ethers.parseEther("3");
    const capBreakerCost = await campaign.quoteBuyExactTokens(capBreakerAmount);
    const capBreakerSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      capBreakerAmount,
      capBreakerCost,
      deadline
    );
    await expect(
      campaign
        .connect(buyer)
        .buyExactTokensAuthorized(capBreakerAmount, capBreakerCost, routeProfile, deadline, capBreakerSignature, { value: capBreakerCost })
    ).to.be.revertedWithCustomError(campaign, "LaunchProtectionBuyLimit");

    const secondCost = await campaign.quoteBuyExactTokens(amountOut);
    const secondSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      amountOut,
      secondCost,
      deadline
    );
    await expect(
      campaign.connect(buyer).buyExactTokensAuthorized(amountOut, secondCost, routeProfile, deadline, secondSignature, { value: secondCost })
    ).to.be.revertedWithCustomError(campaign, "LaunchProtectionWalletLimit");
  });

  it("binds protected launch route signatures to replay, campaign, chain, profile, amount, and slippage", async function () {
    const { creator, buyer, routeAuthority, attacker, factory } = await deploySafetyFixture();
    await factory.setLaunchProtectionConfig(50, ethers.parseEther("1"), ethers.parseEther("1"));

    const { campaign } = await createCampaign(factory, creator);
    const { campaign: otherCampaign } = await createCampaign(factory, attacker, { symbol: "OTHR" });
    const amountOut = ethers.parseEther("1");
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? 0) + 3600);
    const routeProfile = 1;
    const alternateRouteProfile = 2;
    const { chainId } = await ethers.provider.getNetwork();

    const firstCost = await campaign.quoteBuyExactTokens(amountOut);
    const firstSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      amountOut,
      firstCost,
      deadline
    );
    await campaign.connect(buyer).buyExactTokensAuthorized(amountOut, firstCost, routeProfile, deadline, firstSignature, { value: firstCost });
    await expect(
      campaign.connect(buyer).buyExactTokensAuthorized(amountOut, firstCost, routeProfile, deadline, firstSignature, { value: firstCost })
    ).to.be.revertedWithCustomError(campaign, "RouteAuthReplayed");

    const wrongProfileCost = await campaign.quoteBuyExactTokens(amountOut);
    const wrongProfileSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      amountOut,
      wrongProfileCost,
      deadline
    );
    await expect(
      campaign
        .connect(buyer)
        .buyExactTokensAuthorized(amountOut, wrongProfileCost, alternateRouteProfile, deadline, wrongProfileSignature, { value: wrongProfileCost })
    ).to.be.revertedWithCustomError(campaign, "BadRouteAuth");

    const wrongAmountCost = await campaign.quoteBuyExactTokens(amountOut);
    const wrongAmountSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      amountOut + 1n,
      wrongAmountCost,
      deadline
    );
    await expect(
      campaign.connect(buyer).buyExactTokensAuthorized(amountOut, wrongAmountCost, routeProfile, deadline, wrongAmountSignature, {
        value: wrongAmountCost,
      })
    ).to.be.revertedWithCustomError(campaign, "BadRouteAuth");

    const wrongSlippageCost = await campaign.quoteBuyExactTokens(amountOut);
    const wrongSlippageSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      amountOut,
      wrongSlippageCost + 1n,
      deadline
    );
    await expect(
      campaign.connect(buyer).buyExactTokensAuthorized(amountOut, wrongSlippageCost, routeProfile, deadline, wrongSlippageSignature, {
        value: wrongSlippageCost,
      })
    ).to.be.revertedWithCustomError(campaign, "BadRouteAuth");

    const otherCost = await otherCampaign.quoteBuyExactTokens(amountOut);
    const wrongCampaignSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      amountOut,
      otherCost,
      deadline
    );
    await expect(
      otherCampaign.connect(buyer).buyExactTokensAuthorized(amountOut, otherCost, routeProfile, deadline, wrongCampaignSignature, {
        value: otherCost,
      })
    ).to.be.revertedWithCustomError(otherCampaign, "BadRouteAuth");

    const wrongChainCost = await campaign.quoteBuyExactTokens(amountOut);
    const wrongChainSignature = await signTradeRoute(
      campaign,
      buyer.address,
      routeAuthority,
      routeProfile,
      0,
      amountOut,
      wrongChainCost,
      deadline,
      chainId + 1n
    );
    await expect(
      campaign.connect(buyer).buyExactTokensAuthorized(amountOut, wrongChainCost, routeProfile, deadline, wrongChainSignature, {
        value: wrongChainCost,
      })
    ).to.be.revertedWithCustomError(campaign, "BadRouteAuth");
  });

  it("locks launch protection configuration once campaign creation starts", async function () {
    const { creator, factory } = await deploySafetyFixture();
    await factory.setLaunchProtectionConfig(4, ethers.parseEther("0.0001"), ethers.parseEther("0.0002"));

    await createCampaign(factory, creator);

    await expect(factory.setLaunchProtectionConfig(8, 0, 0)).to.be.revertedWithCustomError(factory, "FactoryLocked");
  });

  it("expires launch protection at the exact block boundary", async function () {
    const { creator, buyer, factory } = await deploySafetyFixture();
    await factory.setLaunchProtectionConfig(1, ethers.parseEther("0.0001"), ethers.parseEther("0.0001"));

    const { campaign } = await createCampaign(factory, creator);
    const amountOut = ethers.parseEther("1");
    const protectedCost = await campaign.quoteBuyExactTokens(amountOut);

    await expect(campaign.connect(buyer).buyExactTokens(amountOut, protectedCost, { value: protectedCost })).to.be.revertedWithCustomError(
      campaign,
      "AuthorizedTradingRequired"
    );

    await minePastBlock(await campaign.launchProtectionEndBlock());

    const unprotectedCost = await campaign.quoteBuyExactTokens(amountOut);
    await expect(campaign.connect(buyer).buyExactTokens(amountOut, unprotectedCost, { value: unprotectedCost })).to.emit(
      campaign,
      "TokensPurchased"
    );
  });

  it("blocks restricted wallets, buy/sell pauses, and creator buy lock/cap paths", async function () {
    const { creator, buyer, factory, riskRegistry } = await deploySafetyFixture();
    const { campaign, token } = await createCampaign(factory, creator, {
      basePrice: ethers.parseEther("0.0001"),
      priceSlope: 1n,
    });

    const amountOut = ethers.parseEther("1");
    const maxCost = await campaign.quoteBuyExactTokens(amountOut);

    await riskRegistry.setWalletRisk(buyer.address, 3, true);
    await expect(campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost })).to.be.revertedWithCustomError(
      riskRegistry,
      "WalletRestricted"
    );

    await riskRegistry.setWalletRisk(buyer.address, 0, false);
    await factory.setCampaignPauses(await campaign.getAddress(), false, true, false, false);
    await expect(campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost })).to.be.revertedWithCustomError(
      campaign,
      "BuysPaused"
    );

    await factory.setCampaignPauses(await campaign.getAddress(), false, false, false, false);
    await campaign.connect(buyer).buyExactTokens(amountOut, maxCost, { value: maxCost });
    await token.connect(buyer).approve(await campaign.getAddress(), amountOut);
    await factory.setCampaignPauses(await campaign.getAddress(), false, false, true, false);
    await expect(campaign.connect(buyer).sellExactTokens(amountOut, 0)).to.be.revertedWithCustomError(campaign, "SellsPaused");

    await factory.setCampaignPauses(await campaign.getAddress(), false, false, false, false);
    const creatorLockedCost = await campaign.quoteBuyExactTokens(amountOut);
    await expect(campaign.connect(creator).buyExactTokens(amountOut, creatorLockedCost, { value: creatorLockedCost })).to.be.revertedWithCustomError(
      campaign,
      "CreatorBuyLocked"
    );

    await increaseTime(24 * 60 * 60 + 1);
    const capBreakerAmount = ethers.parseEther("5000");
    const capBreakerCost = await campaign.quoteBuyExactTokens(capBreakerAmount);
    await expect(
      campaign.connect(creator).buyExactTokens(capBreakerAmount, capBreakerCost, { value: capBreakerCost })
    ).to.be.revertedWithCustomError(campaign, "CreatorBuyCapExceeded");
  });

  it("accepts only the configured route authority and rejects create route replay", async function () {
    const { creator, routeAuthority, attacker, factory } = await deploySafetyFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? 0) + 3600);
    const tradeProfile = 2;
    const finalizeProfile = 2;
    const authorizedReq = campaignRequest({ symbol: "AUTH" });

    const badSignature = await signCreateRoute(factory, creator.address, attacker, authorizedReq, tradeProfile, finalizeProfile, deadline);
    await expect(
      factory.connect(creator).createCampaignAuthorized(authorizedReq, {
        tradeRouteProfile: tradeProfile,
        finalizeRouteProfile: finalizeProfile,
        deadline,
        signature: badSignature,
      })
    ).to.be.revertedWithCustomError(factory, "InvalidRouteAuthorization");

    const validSignature = await signCreateRoute(factory, creator.address, routeAuthority, authorizedReq, tradeProfile, finalizeProfile, deadline);
    const routeAuth = {
      tradeRouteProfile: tradeProfile,
      finalizeRouteProfile: finalizeProfile,
      deadline,
      signature: validSignature,
    };

    await expect(factory.connect(creator).createCampaignAuthorized(authorizedReq, routeAuth)).to.emit(factory, "CampaignCreated");

    await expect(
      factory.connect(creator).createCampaignAuthorized(campaignRequest({ symbol: "SWAP" }), routeAuth)
    ).to.be.revertedWithCustomError(factory, "InvalidRouteAuthorization");

    await expect(factory.connect(creator).createCampaignAuthorized(authorizedReq, routeAuth)).to.be.revertedWithCustomError(
      factory,
      "RouteAuthorizationReplayed"
    );
  });
});
