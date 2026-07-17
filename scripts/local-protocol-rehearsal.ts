import { ethers, network } from "hardhat";
import { deployProtocol } from "./lib/deployProtocol";
import { buildMonitoringSnapshot } from "./monitoring-snapshot";
import { verifyDeployment } from "./verify-deployment";

const MAX_BPS = 10_000n;
const ROUTE_PROFILE_STANDARD_UNLINKED = 1;
const TRADE_AUTH_BUY_EXACT_TOKENS = 0;

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

async function signTradeRoute(params: {
  campaign: any;
  actor: string;
  signer: any;
  routeProfile: number;
  action: number;
  amount: bigint;
  limit: bigint;
  deadline: bigint;
}) {
  const { chainId } = await ethers.provider.getNetwork();
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "address", "address", "uint8", "uint8", "uint256", "uint256", "uint64"],
      [
        "MWZ_ROUTE_TRADE_AUTH",
        chainId,
        await params.campaign.getAddress(),
        params.actor,
        params.routeProfile,
        params.action,
        params.amount,
        params.limit,
        params.deadline,
      ]
    )
  );
  return params.signer.signMessage(ethers.getBytes(digest));
}

async function expectRevert(promise: Promise<unknown>, expected: string) {
  try {
    await promise;
  } catch (error: any) {
    if (!String(error.message).includes(expected)) throw error;
    return;
  }
  throw new Error(`Expected revert including ${expected}`);
}

async function authorizedBuyExactTokens(params: {
  campaign: any;
  buyer: any;
  routeAuthority: any;
  amountOut: bigint;
  maxCost: bigint;
}) {
  const deadline = (await latestTimestamp()) + 3600n;
  const signature = await signTradeRoute({
    campaign: params.campaign,
    actor: await params.buyer.getAddress(),
    signer: params.routeAuthority,
    routeProfile: ROUTE_PROFILE_STANDARD_UNLINKED,
    action: TRADE_AUTH_BUY_EXACT_TOKENS,
    amount: params.amountOut,
    limit: params.maxCost,
    deadline,
  });

  await (
    await params.campaign
      .connect(params.buyer)
      .buyExactTokensAuthorized(params.amountOut, params.maxCost, ROUTE_PROFILE_STANDARD_UNLINKED, deadline, signature, {
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

  if (!(await factory.live())) {
    logStep("enabling live mode");
    await (await factory.enableLive()).wait();
  }

  const request = {
    name: "Rehearsal Token",
    symbol: "RHRSL",
    logoURI: "ipfs://local-protocol-rehearsal",
    xAccount: "",
    website: "",
    extraLink: "",
    basePrice: 0n,
    priceSlope: 0n,
    graduationTarget: 0n,
    lpReceiver: ethers.ZeroAddress,
  };

  logStep("creating campaign");
  await (await factory.connect(creator).createCampaign(request)).wait();
  const campaignInfo = await factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", campaignInfo.campaign);
  const token = await ethers.getContractAt("LaunchToken", campaignInfo.token);

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
