import path from "path";
import { pathToFileURL } from "url";
import { ethers, network } from "hardhat";
import { deployProtocol } from "./lib/deployProtocol";
import { buildMonitoringSnapshot } from "./monitoring-snapshot";
import { verifyDeployment } from "./verify-deployment";

const MAX_BPS = 10_000n;
const TRADE_AUTH_BUY_EXACT_TOKENS = 0;

type RouteAuthorizationSigner = {
  signCreateAuthorization(options: {
    signer: { signMessage(message: Uint8Array): Promise<string> };
    chainId: bigint | number | string;
    factoryAddress: string;
    creator: string;
    request: CampaignRequest;
    tradeRouteProfileId: number;
    finalizeRouteProfileId: number;
    deadline: bigint | number | string;
  }): Promise<string>;
  signTradeAuthorization(options: {
    signer: { signMessage(message: Uint8Array): Promise<string> };
    chainId: bigint | number | string;
    campaignAddress: string;
    actor: string;
    routeProfileId: number;
    action: number;
    amount: bigint | number | string;
    limit: bigint | number | string;
    deadline: bigint | number | string;
  }): Promise<string>;
};

type CampaignRequest = {
  name: string;
  symbol: string;
  logoURI: string;
  xAccount: string;
  website: string;
  extraLink: string;
  graduationTarget: bigint;
};

type CreateRouteAuthorization = {
  tradeRouteProfile: number;
  finalizeRouteProfile: number;
  deadline: bigint;
  signature: string;
};

const routeAuthorizationSignerUrl = pathToFileURL(
  path.join(__dirname, "..", "frontend", "api", "dev-fix", "routeAuthorizationSigner.js"),
).href;

const routeAuthorizationSignerPromise: Promise<RouteAuthorizationSigner> = Function(
  "specifier",
  "return import(specifier)",
)(routeAuthorizationSignerUrl);

function logStep(label: string, value?: unknown) {
  if (value === undefined) console.log(`[rehearsal] ${label}`);
  else console.log(`[rehearsal] ${label}:`, value);
}

function requireLocalNetwork() {
  if (network.name !== "hardhat" && network.name !== "localhost") {
    throw new Error(`local protocol rehearsal is only for hardhat/localhost, got ${network.name}`);
  }
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

async function expectRevert(promise: Promise<unknown>, expected?: string) {
  try {
    await promise;
  } catch (error: any) {
    if (expected && !String(error.message).includes(expected)) throw error;
    return;
  }
  throw new Error(`Expected revert${expected ? ` including ${expected}` : ""}`);
}

async function buildCreateAuthorization(params: {
  factory: any;
  creator: any;
  routeAuthority: any;
  request: CampaignRequest;
  deadline: bigint;
  tradeRouteProfile?: number;
  finalizeRouteProfile?: number;
}): Promise<CreateRouteAuthorization> {
  const { signCreateAuthorization } = await routeAuthorizationSignerPromise;
  const { chainId } = await ethers.provider.getNetwork();
  const tradeRouteProfile = params.tradeRouteProfile ?? Number(await params.factory.tradeRouteProfile());
  const finalizeRouteProfile = params.finalizeRouteProfile ?? Number(await params.factory.finalizeRouteProfile());
  const signature = await signCreateAuthorization({
    signer: params.routeAuthority,
    chainId,
    factoryAddress: await params.factory.getAddress(),
    creator: await params.creator.getAddress(),
    request: params.request,
    tradeRouteProfileId: tradeRouteProfile,
    finalizeRouteProfileId: finalizeRouteProfile,
    deadline: params.deadline,
  });

  return { tradeRouteProfile, finalizeRouteProfile, deadline: params.deadline, signature };
}

async function authorizedBuyExactTokens(params: {
  campaign: any;
  buyer: any;
  routeAuthority: any;
  amountOut: bigint;
  maxCost: bigint;
}) {
  const { signTradeAuthorization } = await routeAuthorizationSignerPromise;
  const { chainId } = await ethers.provider.getNetwork();
  const deadline = (await latestTimestamp()) + 3600n;
  const routeProfileId = Number(await params.campaign.tradeRouteProfile());
  const signature = await signTradeAuthorization({
    signer: params.routeAuthority,
    chainId,
    campaignAddress: await params.campaign.getAddress(),
    actor: await params.buyer.getAddress(),
    routeProfileId,
    action: TRADE_AUTH_BUY_EXACT_TOKENS,
    amount: params.amountOut,
    limit: params.maxCost,
    deadline,
  });

  await (
    await params.campaign.connect(params.buyer).buyExactTokensAuthorized(params.amountOut, params.maxCost, routeProfileId, deadline, signature, {
      value: params.maxCost,
    })
  ).wait();
}

async function main() {
  requireLocalNetwork();
  const [deployer, creator, buyer, routeAuthority] = await ethers.getSigners();

  if (!boolEnv("LOCAL_REHEARSAL_PRESERVE_TREASURY_SAFE", false)) {
    process.env.TREASURY_SAFE = await deployer.getAddress();
    logStep("using deployer as local treasury safe", process.env.TREASURY_SAFE);
  }

  logStep("deploying protocol");
  const deployment = await deployProtocol();
  await verifyDeployment(deployment);

  const factory = await ethers.getContractAt("LaunchFactory", deployment.contracts.LaunchFactory);
  const locker = await ethers.getContractAt("PermanentLpLocker", deployment.contracts.PermanentLpLocker);

  const rehearsalConfig = {
    totalSupply: ethers.parseEther("1000"),
    curveBps: 5000n,
    liquidityTokenBps: 4000n,
    basePrice: 10n ** 12n,
    priceSlope: 10n ** 9n,
    graduationTarget: ethers.parseEther("0.1"),
    liquidityBps: 8000n,
  };

  logStep("configuring compact local curve");
  await (await factory.setConfig(rehearsalConfig)).wait();

  if ((await factory.routeAuthority()).toLowerCase() !== (await routeAuthority.getAddress()).toLowerCase()) {
    logStep("setting rehearsal route authority", await routeAuthority.getAddress());
    await (await factory.setRouteAuthority(await routeAuthority.getAddress())).wait();
  }

  if (!(await factory.requireAuthorizedTrading())) {
    logStep("requiring authorized trading for rehearsal campaign");
    await (await factory.setRequireAuthorizedTrading(true)).wait();
  }

  if (!(await factory.requireRouteAuthorization())) {
    logStep("requiring authorized campaign creation for rehearsal campaign");
    await (await factory.setRequireRouteAuthorization(true)).wait();
  }

  if (!(await factory.live())) {
    logStep("enabling live mode");
    await (await factory.enableLive()).wait();
  }

  const request: CampaignRequest = {
    name: "Rehearsal Token",
    symbol: "RHRSL",
    logoURI: "ipfs://local-protocol-rehearsal",
    xAccount: "",
    website: "",
    extraLink: "",
    graduationTarget: 0n,
  };

  const tradeRouteProfile = Number(await factory.tradeRouteProfile());
  const finalizeRouteProfile = Number(await factory.finalizeRouteProfile());
  const validDeadline = (await latestTimestamp()) + 3600n;
  const unsignedAuthorization = { tradeRouteProfile, finalizeRouteProfile, deadline: validDeadline, signature: "0x" };

  await expectRevert(
    factory.connect(creator).createCampaignAuthorized(request, unsignedAuthorization),
  );
  logStep("unsigned campaign creation blocked");

  const invalidSigner = ethers.Wallet.createRandom();
  const invalidAuthorization = await buildCreateAuthorization({
    factory,
    creator,
    routeAuthority: invalidSigner,
    request,
    deadline: validDeadline,
    tradeRouteProfile,
    finalizeRouteProfile,
  });
  await expectRevert(
    factory.connect(creator).createCampaignAuthorized(request, invalidAuthorization),
    "InvalidRouteAuthorization",
  );
  logStep("invalid route-authority signer blocked");

  const expiredAuthorization = await buildCreateAuthorization({
    factory,
    creator,
    routeAuthority,
    request,
    deadline: (await latestTimestamp()) - 1n,
    tradeRouteProfile,
    finalizeRouteProfile,
  });
  await expectRevert(
    factory.connect(creator).createCampaignAuthorized(request, expiredAuthorization),
    "RouteAuthorizationExpired",
  );
  logStep("expired campaign authorization blocked");

  const createAuthorization = await buildCreateAuthorization({
    factory,
    creator,
    routeAuthority,
    request,
    deadline: validDeadline,
    tradeRouteProfile,
    finalizeRouteProfile,
  });

  logStep("creating campaign through signed route", {
    tradeRouteProfile,
    finalizeRouteProfile,
    deadline: validDeadline.toString(),
  });
  await (await factory.connect(creator).createCampaignAuthorized(request, createAuthorization)).wait();
  await expectRevert(
    factory.connect(creator).createCampaignAuthorized(request, createAuthorization),
    "RouteAuthorizationReplayed",
  );
  logStep("replayed campaign authorization blocked");

  const campaignInfo = await factory.getCampaign(0n);
  if (campaignInfo.creator.toLowerCase() !== (await creator.getAddress()).toLowerCase()) throw new Error("campaign creator mismatch");
  if (campaignInfo.campaign === ethers.ZeroAddress) throw new Error("campaign address missing");
  if (campaignInfo.token === ethers.ZeroAddress) throw new Error("campaign token address missing");
  if (campaignInfo.name !== request.name || campaignInfo.symbol !== request.symbol || campaignInfo.logoURI !== request.logoURI) {
    throw new Error("campaign metadata mismatch");
  }

  const campaign = await ethers.getContractAt("LaunchCampaign", campaignInfo.campaign);
  const token = await ethers.getContractAt("LaunchToken", campaignInfo.token);
  if (Number(await campaign.tradeRouteProfile()) !== tradeRouteProfile) throw new Error("campaign trade route profile mismatch");
  if (Number(await campaign.finalizeRouteProfile()) !== finalizeRouteProfile) throw new Error("campaign finalize route profile mismatch");
  logStep("authorized campaign creation verified", {
    campaign: campaignInfo.campaign,
    token: campaignInfo.token,
    creator: campaignInfo.creator,
  });

  const probeAmount = ethers.parseEther("1");
  const probeCost = await campaign.quoteBuyExactTokens(probeAmount);
  await expectRevert(campaign.connect(buyer).buyExactTokens(probeAmount, probeCost, { value: probeCost }), "AuthorizedTradingRequired");
  logStep("direct trade blocked by route authorization");
  await authorizedBuyExactTokens({ campaign, buyer, routeAuthority, amountOut: probeAmount, maxCost: probeCost });
  if (await campaign.launched()) throw new Error("authorized probe buy unexpectedly graduated the campaign");
  logStep("authorized probe buy complete", { amountOut: probeAmount.toString(), cost: probeCost.toString() });

  const curveSupply = await campaign.curveSupply();
  const remainingCurveSupply = curveSupply - (await campaign.sold());
  const crossingBuyCost = await campaign.quoteBuyExactTokens(remainingCurveSupply);
  logStep("buying remaining curve supply through signed route", {
    remainingCurveSupply: remainingCurveSupply.toString(),
    crossingBuyCost: crossingBuyCost.toString(),
  });

  await authorizedBuyExactTokens({
    campaign,
    buyer,
    routeAuthority,
    amountOut: remainingCurveSupply,
    maxCost: crossingBuyCost,
  });

  if (!(await campaign.launched())) throw new Error("campaign did not graduate during crossing buy");
  if ((await campaign.sold()) !== curveSupply) throw new Error("campaign sold supply mismatch after crossing buy");
  if ((await token.balanceOf(await buyer.getAddress())) !== curveSupply) throw new Error("buyer token balance mismatch");

  const state = await campaign.getGraduationState();
  if (state.dexPair === ethers.ZeroAddress) throw new Error("graduation did not record a Topaz pool");
  if (state.graduatedLiquidityTokens === 0n) throw new Error("graduation used zero liquidity tokens");
  if (state.graduatedLiquidityBnb === 0n) throw new Error("graduation used zero native liquidity");
  if (state.graduatedLiquidityLp === 0n) throw new Error("graduation minted zero LP");
  if (!(await locker.registeredLpToken(state.dexPair))) throw new Error("permanent locker did not register graduated LP token");

  const lp = await ethers.getContractAt("MockTopazPool", state.dexPair);
  const lockerLpBalance = await lp.balanceOf(await locker.getAddress());
  if (lockerLpBalance !== state.graduatedLiquidityLp) throw new Error("locker LP balance does not match graduation state");

  const expectedCurveSupply = (rehearsalConfig.totalSupply * rehearsalConfig.curveBps) / MAX_BPS;
  const expectedLiquiditySupply = (rehearsalConfig.totalSupply * rehearsalConfig.liquidityTokenBps) / MAX_BPS;
  if (curveSupply !== expectedCurveSupply) throw new Error("curve supply does not match rehearsal config");
  if ((await campaign.liquiditySupply()) !== expectedLiquiditySupply) throw new Error("liquidity supply does not match rehearsal config");

  const monitoringSnapshot = await buildMonitoringSnapshot({ limit: 10 });
  const monitoredCampaign = monitoringSnapshot.snapshots.find((entry: any) => entry.campaign.toLowerCase() === campaignInfo.campaign.toLowerCase());
  if (!monitoredCampaign) throw new Error("monitoring snapshot did not include rehearsal campaign");
  if (monitoredCampaign.status !== "graduated") throw new Error(`monitoring snapshot status mismatch: ${monitoredCampaign.status}`);
  if (monitoringSnapshot.summary.counts.graduated !== 1) throw new Error("monitoring snapshot graduated count mismatch");
  if (monitoringSnapshot.summary.attentionCount !== 0) throw new Error("monitoring snapshot unexpectedly requires operator attention");
  logStep("monitoring snapshot verified", {
    status: monitoredCampaign.status,
    totalCampaigns: monitoringSnapshot.summary.totalCampaigns,
    attention: monitoringSnapshot.summary.attentionCount,
  });

  logStep("complete", {
    campaign: campaignInfo.campaign,
    token: campaignInfo.token,
    dexPair: state.dexPair,
    lpLocked: lockerLpBalance.toString(),
    finalCurvePrice: state.finalCurvePrice.toString(),
    initialDexPrice: state.initialDexPrice.toString(),
    graduationOvershoot: state.graduationOvershoot.toString(),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
