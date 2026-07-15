import { ethers, network } from "hardhat";
import { deployProtocol } from "./lib/deployProtocol";
import { verifyDeployment } from "./verify-deployment";

const MAX_BPS = 10_000n;

function logStep(label: string, value?: unknown) {
  if (value === undefined) console.log(`[rehearsal] ${label}`);
  else console.log(`[rehearsal] ${label}:`, value);
}

function requireLocalNetwork() {
  if (network.name !== "hardhat" && network.name !== "localhost") {
    throw new Error(`local protocol rehearsal is only for hardhat/localhost, got ${network.name}`);
  }
}

async function main() {
  requireLocalNetwork();
  const [, creator, buyer] = await ethers.getSigners();

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
    graduationTarget: ethers.parseEther("1"),
    liquidityBps: 8000n,
  };

  logStep("configuring compact local curve");
  await (await factory.setConfig(rehearsalConfig)).wait();

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
    graduationTarget: 1n,
    lpReceiver: ethers.ZeroAddress,
  };

  logStep("creating campaign");
  await (await factory.connect(creator).createCampaign(request)).wait();
  const campaignInfo = await factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", campaignInfo.campaign);
  const token = await ethers.getContractAt("LaunchToken", campaignInfo.token);

  const curveSupply = await campaign.curveSupply();
  const fullCurveCost = await campaign.quoteBuyExactTokens(curveSupply);
  logStep("buying full curve supply", {
    curveSupply: curveSupply.toString(),
    fullCurveCost: fullCurveCost.toString(),
  });

  await (await campaign.connect(buyer).buyExactTokens(curveSupply, fullCurveCost, { value: fullCurveCost })).wait();

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
