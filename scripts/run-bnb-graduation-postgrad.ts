import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";
import {
  assertAddr,
  assertRejectedFactory,
  assertRejectedLocker,
  BPS,
  CERT_ADAPTER,
  CERT_CHAIN_ID,
  CERT_FACTORY,
  CERT_GRADUATION_USD,
  CERT_LOCKER,
  CERT_TOPAZ_FACTORY,
  CERT_TOPAZ_ROUTER,
  CERT_VOLATILE_FEE_BPS,
  CERT_WBNB,
  CERT_WIC_CAMPAIGN,
  CLEAN_SLATE_MANIFEST,
  CREATOR_SHARE_BPS,
  fail,
  FORBIDDEN_DEPLOYMENT_FILE,
  sameAddr,
  TOPAZ_MANIFEST,
} from "./lib/bscCertificationPins";
import { executeMwzTopazBuy, executeMwzTopazSell, resolveMwzTopazRoute } from "./lib/mwzTopazV2Trade";

const TRADE_AUTH_BUY_EXACT_BNB = 1;
const ZERO = ethers.ZeroAddress;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];

const ROUTER_SWAP_ABI = [
  "function swapExactETHForTokens(uint256,tuple(address from,address to,bool stable,address factory)[],address,uint256) payable returns (uint256[])",
  "function swapExactTokensForETH(uint256,uint256,tuple(address from,address to,bool stable,address factory)[],address,uint256) returns (uint256[])",
  "function getAmountsOut(uint256,tuple(address from,address to,bool stable,address factory)[]) view returns (uint256[])",
];

function env(name: string) {
  return String(process.env[name] ?? "").trim();
}

function envFlag(name: string) {
  return ["1", "true", "yes", "on"].includes(env(name).toLowerCase());
}

function assertNotForbiddenDeploymentFile() {
  const file = env("DEPLOYMENT_FILE") || `deployments/${network.name}.json`;
  const normalized = file.replace(/\\/g, "/");
  if (normalized.endsWith(FORBIDDEN_DEPLOYMENT_FILE) || normalized.endsWith("bscTestnet.json")) {
    fail(
      `DEPLOYMENT_FILE=${file} is the obsolete BSC manifest trap. Factory/locker must come from ${CLEAN_SLATE_MANIFEST}.`,
    );
  }
}

async function gasOverrides(extra: Record<string, unknown> = {}) {
  try {
    const gp = await ethers.provider.send("eth_gasPrice", []);
    const gasPrice = gp ? BigInt(gp) : 0n;
    return gasPrice > 0n ? { ...extra, gasPrice, type: 0 } : extra;
  } catch {
    return extra;
  }
}

async function requireCode(label: string, address: string) {
  if (!address || address === ZERO) fail(`${label} is zero`);
  const code = await ethers.provider.getCode(address);
  if (code === "0x") fail(`${label} ${address} has no bytecode`);
}

const CAMPAIGN_FINALIZED_TOPIC = ethers.id(
  "CampaignFinalized(address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
);

function campaignFinalized(receipt: ethers.TransactionReceipt | null) {
  if (!receipt) return false;
  return receipt.logs.some((log) => log.topics[0] === CAMPAIGN_FINALIZED_TOPIC);
}

async function requestTradeAuth(input: {
  wallet: string;
  campaign: string;
  amount: bigint;
  limit: bigint;
}) {
  const apiBase = env("MWZ_API_BASE").replace(/\/+$/, "");
  if (apiBase) {
    const res = await fetch(`${apiBase}/api/routing/trade-authorization`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        walletAddress: input.wallet,
        campaignAddress: input.campaign,
        chainId: CERT_CHAIN_ID,
        action: TRADE_AUTH_BUY_EXACT_BNB,
        amount: input.amount.toString(),
        limit: input.limit.toString(),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      fail(`trade-authorization ${res.status}: ${json?.error || json?.code || JSON.stringify(json)}`);
    }
    const auth = json.authorization;
    if (!auth?.signature) fail("trade-authorization response missing signature");
    return {
      routeProfile: Number(auth.routeProfileId),
      deadline: Math.floor(new Date(auth.validUntil).getTime() / 1000),
      signature: auth.signature as string,
      source: apiBase,
    };
  }

  const pk = env("ROUTE_AUTHORITY_PRIVATE_KEY") || env("MWZ_ROUTE_AUTHORITY_PRIVATE_KEY") || env("ROUTE_AUTH_PRIVATE_KEY");
  if (!pk) {
    fail(
      "BLOCKER: GitHub Environment variable MWZ_API_BASE or secret ROUTE_AUTHORITY_PRIVATE_KEY is not mapped. Do not paste keys in chat.",
    );
  }
  const signer = new ethers.Wallet(pk);
  const deadline = Math.floor(Date.now() / 1000) + 10 * 60;
  const routeProfile = 1;
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "address", "address", "uint8", "uint8", "uint256", "uint256", "uint64"],
      [
        "MWZ_ROUTE_TRADE_AUTH",
        CERT_CHAIN_ID,
        ethers.getAddress(input.campaign),
        ethers.getAddress(input.wallet),
        routeProfile,
        TRADE_AUTH_BUY_EXACT_BNB,
        input.amount,
        input.limit,
        deadline,
      ],
    ),
  );
  const signature = await signer.signMessage(ethers.getBytes(digest));
  return { routeProfile, deadline, signature, source: "local-route-authority" };
}

async function sizeCrossingBuy(campaign: ethers.Contract, target: bigint, net: bigint) {
  if (net >= target) return 0n;
  const gap = target - net;
  let value = gap + gap / 50n + 1n;
  for (let i = 0; i < 16; i += 1) {
    const quote = await campaign.quoteBuyExactBnb(value);
    const tokensOut = BigInt(quote.tokensOut ?? quote[0]);
    const totalCost = BigInt(quote.totalCostWei ?? quote[1]);
    const fee = BigInt(quote.feeWei ?? quote[2]);
    const costNoFee = totalCost > fee ? totalCost - fee : 0n;
    if (tokensOut > 0n && costNoFee >= gap && totalCost > 0n) {
      return totalCost > value ? totalCost : value;
    }
    const shortfall = gap > costNoFee ? gap - costNoFee : 1n;
    value += shortfall + fee + 1n;
  }
  fail(`unable to size a crossing buy for live gap ${gap.toString()} wei (do not use a hardcoded gap)`);
}

async function pollIndexer(campaign: string, timeoutMs: number) {
  const base = (env("TOKEN_API_BASE") || "https://memebattles-production-dca0.up.railway.app").replace(/\/+$/, "");
  const started = Date.now();
  let last: any = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const [stateRes, tradesRes, candlesRes] = await Promise.all([
        fetch(`${base}/api/token/${campaign}/market-state?chainId=97`),
        fetch(`${base}/api/token/${campaign}/market-trades?chainId=97&limit=50`),
        fetch(`${base}/api/token/${campaign}/market-candles?chainId=97&resolution=1m&limit=200`),
      ]);
      const state = await stateRes.json();
      const trades = await tradesRes.json();
      const candles = await candlesRes.json();
      last = { state, trades, candles, tokenApi: base };
      const stage = String(state?.marketStage || "");
      const items = Array.isArray(trades?.items) ? trades.items : [];
      const candleItems = Array.isArray(candles?.items) ? candles.items : [];
      const bondingTrades = items.filter((row: any) => /bond/i.test(String(row?.source || row?.venue || row?.kind || "")));
      const topazTrades = items.filter((row: any) => /topaz|dex|swap/i.test(String(row?.source || row?.venue || row?.kind || "")));
      const bondingCandles = candleItems.filter((row: any) => Number(row?.bonding_trade_count || 0) > 0);
      const dexCandles = candleItems.filter((row: any) => Number(row?.dex_trade_count || 0) > 0);
      const pairOk = sameAddr(String(state?.pairAddress || ""), String(state?.pairAddress || ZERO)) && state?.pairAddress && state.pairAddress !== ZERO;
      if (
        (stage === "TOPAZ_ACTIVE" || stage === "TOPAZ_PENDING") &&
        pairOk &&
        (bondingTrades.length > 0 || bondingCandles.length > 0) &&
        (topazTrades.length > 0 || dexCandles.length > 0)
      ) {
        return {
          ...last,
          ok: stage === "TOPAZ_ACTIVE",
          bondingTradeCount: bondingTrades.length || bondingCandles.reduce((n: number, row: any) => n + Number(row.bonding_trade_count || 0), 0),
          topazTradeCount: topazTrades.length || dexCandles.reduce((n: number, row: any) => n + Number(row.dex_trade_count || 0), 0),
        };
      }
    } catch (error: any) {
      last = { error: String(error?.message || error) };
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  return { ...last, ok: false, timedOut: true };
}

async function main() {
  if (network.name !== "bscTestnet") {
    fail(`unsupported network ${network.name}; remaining-path driver is bscTestnet only`);
  }
  assertNotForbiddenDeploymentFile();
  if (envFlag("CERT_ALLOW_CREATE")) fail("CERT_ALLOW_CREATE is forbidden for this remaining-path run");

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== CERT_CHAIN_ID) fail(`chainId ${chainId} !== ${CERT_CHAIN_ID}`);

  const pk = env("BSC_TESTNET_PRIVATE_KEY") || env("DEPLOYER_PK") || env("PRIVATE_KEY_DEPLOY");
  if (!pk) fail("BLOCKER: GitHub Environment secret BSC_TESTNET_PRIVATE_KEY is not mapped. Dedicated tBNB-only EOA.");

  const [signer] = await ethers.getSigners();
  const actor = await signer.getAddress();
  const actorBal = await ethers.provider.getBalance(actor);
  if (actorBal < ethers.parseEther("0.02")) {
    fail(`cert EOA ${actor} has ${ethers.formatEther(actorBal)} tBNB; need enough for crossing buy + post-grad trades + gas`);
  }

  const cleanSlate = JSON.parse(fs.readFileSync(path.join(__dirname, "..", CLEAN_SLATE_MANIFEST), "utf8"));
  const topazManifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", TOPAZ_MANIFEST), "utf8"));
  const factoryAddr = cleanSlate?.newFactory?.address || cleanSlate?.contracts?.LaunchFactory;
  const lockerAddr = cleanSlate?.newFactory?.locker || cleanSlate?.contracts?.PermanentLpLocker;
  assertAddr("clean-slate factory", factoryAddr, CERT_FACTORY);
  assertAddr("clean-slate locker", lockerAddr, CERT_LOCKER);
  assertRejectedFactory(factoryAddr);
  assertRejectedLocker(lockerAddr);
  assertAddr("topaz manifest router", topazManifest.contracts.Router, CERT_TOPAZ_ROUTER);
  assertAddr("topaz manifest factory", topazManifest.contracts.PoolFactory, CERT_TOPAZ_FACTORY);
  assertAddr("topaz manifest WBNB", topazManifest.contracts.WBNB, CERT_WBNB);
  if (BigInt(topazManifest.configuration.volatileFeeBps) !== CERT_VOLATILE_FEE_BPS) {
    fail(`topaz volatileFeeBps ${topazManifest.configuration.volatileFeeBps} !== 100`);
  }

  const factory = await ethers.getContractAt("LaunchFactory", CERT_FACTORY);
  const locker = await ethers.getContractAt("PermanentLpLocker", CERT_LOCKER);
  assertAddr("on-chain factory.permanentLpLocker", await factory.permanentLpLocker(), CERT_LOCKER);
  assertRejectedFactory(await factory.getAddress());
  if (!(await factory.live())) fail("certification factory is not live");
  const cfg = await factory.config();
  if (BigInt(cfg.graduationTarget) !== CERT_GRADUATION_USD) {
    fail(`factory graduationTarget ${cfg.graduationTarget} !== $6 (${CERT_GRADUATION_USD})`);
  }

  const campaignAddr = ethers.getAddress(env("CERT_CAMPAIGN") || env("BSC_CERT_CAMPAIGN") || CERT_WIC_CAMPAIGN);
  const count = Number(await factory.campaignsCount());
  let found = false;
  for (let id = 0; id < count; id += 1) {
    const info = await factory.getCampaign(BigInt(id));
    if (sameAddr(info.campaign, campaignAddr)) {
      found = true;
      break;
    }
  }
  if (!found) fail(`campaign ${campaignAddr} is not on certification factory ${CERT_FACTORY}`);

  const campaign = await ethers.getContractAt("LaunchCampaign", campaignAddr);
  const tokenAddr = await campaign.token();
  const creator = await campaign.creator();
  const campaignRouter = await campaign.router();
  assertAddr("campaign.router adapter", campaignRouter, CERT_ADAPTER);

  const adapter = new ethers.Contract(
    campaignRouter,
    ["function topazRouter() view returns (address)", "function poolFactory() view returns (address)", "function WETH() view returns (address)"],
    ethers.provider,
  );
  assertAddr("adapter.topazRouter", await adapter.topazRouter(), CERT_TOPAZ_ROUTER);
  assertAddr("adapter.poolFactory", await adapter.poolFactory(), CERT_TOPAZ_FACTORY);
  assertAddr("adapter.WETH", await adapter.WETH(), CERT_WBNB);
  await requireCode("adapter", campaignRouter);
  await requireCode("production Topaz router", CERT_TOPAZ_ROUTER);
  await requireCode("Topaz factory", CERT_TOPAZ_FACTORY);
  await requireCode("WBNB", CERT_WBNB);
  await requireCode("locker", CERT_LOCKER);

  if (await campaign.paused()) fail("WIC is paused");
  if (await campaign.graduationPaused()) fail("WIC graduation is paused");

  const evidence: Record<string, any> = {
    campaign: campaignAddr,
    token: tokenAddr,
    creator,
    launchFactory: CERT_FACTORY,
    permanentLpLocker: CERT_LOCKER,
    topazRouter: CERT_TOPAZ_ROUTER,
    topazPoolFactory: CERT_TOPAZ_FACTORY,
    topazWbnb: CERT_WBNB,
    adapterRouter: campaignRouter,
    executionRouter: CERT_TOPAZ_ROUTER,
    actor,
    createdAt: new Date().toISOString(),
  };

  let launched = await campaign.launched();
  let crossingBuyTx = "";
  let leftoverGraduateTx = "";
  let crossingBuyFinalized = false;

  if (!launched) {
    const lockUntil = BigInt(await campaign.creatorBuyLockUntil());
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    if (sameAddr(actor, creator) && now < lockUntil) {
      fail(`cert EOA is WIC creator and still in creatorBuyLockUntil=${lockUntil}; do not weaken the lock`);
    }

    const target = await campaign.graduationNativeTarget();
    const net = await campaign.netRaisedWei();
    evidence.graduationNativeTarget = target.toString();
    evidence.netRaisedBeforeCrossing = net.toString();
    evidence.liveGapWei = (net >= target ? 0n : target - net).toString();
    console.log(`[bsc-graduation] live gap wei=${evidence.liveGapWei} target=${target} net=${net}`);

    if (net < target) {
      const value = await sizeCrossingBuy(campaign, target, net);
      const quote = await campaign.quoteBuyExactBnb(value);
      const minTokens = (BigInt(quote.tokensOut ?? quote[0]) * 95n) / 100n;
      const auth = await requestTradeAuth({
        wallet: actor,
        campaign: campaignAddr,
        amount: value,
        limit: minTokens,
      });
      evidence.tradeAuthSource = auth.source;
      const tx = await campaign.buyExactBnbAuthorized(
        minTokens,
        auth.routeProfile,
        auth.deadline,
        auth.signature,
        await gasOverrides({ value }),
      );
      const receipt = await tx.wait();
      crossingBuyTx = receipt!.hash;
      crossingBuyFinalized = campaignFinalized(receipt);
      evidence.crossingBuyTx = crossingBuyTx;
      evidence.crossingBuyValueWei = value.toString();
      evidence.crossingBuyFinalized = crossingBuyFinalized;
      console.log(`[bsc-graduation] crossing buy ${crossingBuyTx} finalized=${crossingBuyFinalized}`);
    }

    launched = await campaign.launched();
    if (!launched) {
      const targetAfter = await campaign.graduationNativeTarget();
      const netAfter = await campaign.netRaisedWei();
      if (netAfter < targetAfter) {
        fail(`threshold still not met after crossing buy net=${netAfter} target=${targetAfter}`);
      }
      const tx = await campaign.graduateIfEligible(0, 0, await gasOverrides());
      const receipt = await tx.wait();
      leftoverGraduateTx = receipt!.hash;
      evidence.leftoverGraduateTx = leftoverGraduateTx;
      launched = await campaign.launched();
      if (!launched) fail("graduateIfEligible fallback did not set launched=true");
    }
  } else {
    evidence.notes = ["campaign already launched; recovering graduation tx from CampaignFinalized logs"];
  }

  if (!launched) fail("launched != true after remaining-path graduation");

  const state = await campaign.getGraduationState();
  const poolAddr = state.dexPair ?? state[0];
  if (!poolAddr || poolAddr === ZERO) fail("graduation dexPair is zero");
  evidence.graduatedPool = poolAddr;
  evidence.finalCurvePrice = (state.finalCurvePrice ?? state[1]).toString();
  evidence.initialDexPrice = (state.initialDexPrice ?? state[2]).toString();
  evidence.graduatedLiquidityTokens = (state.graduatedLiquidityTokens ?? state[3]).toString();
  evidence.graduatedLiquidityBnb = (state.graduatedLiquidityBnb ?? state[4]).toString();
  evidence.graduatedLiquidityLp = (state.graduatedLiquidityLp ?? state[5]).toString();
  evidence.graduationBalance = (state.graduationBalance ?? state[9]).toString();

  if (BigInt(evidence.graduatedLiquidityTokens) <= 0n || BigInt(evidence.graduatedLiquidityBnb) <= 0n) {
    fail("graduation liquidity amounts are zero");
  }

  const pool = new ethers.Contract(
    poolAddr,
    [
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function stable() view returns (bool)",
      "function factory() view returns (address)",
      "function balanceOf(address) view returns (uint256)",
      "function claimable0(address) view returns (uint256)",
      "function claimable1(address) view returns (uint256)",
    ],
    ethers.provider,
  );
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const poolFactory = await pool.factory();
  assertAddr("pool.factory", poolFactory, CERT_TOPAZ_FACTORY);
  if (await pool.stable()) fail("pool.stable == true");
  const hasWbnb = sameAddr(token0, CERT_WBNB) || sameAddr(token1, CERT_WBNB);
  const hasToken = sameAddr(token0, tokenAddr) || sameAddr(token1, tokenAddr);
  if (!hasWbnb || !hasToken) fail(`pool pair ${token0}/${token1} is not token+WBNB`);

  const topazFactory = new ethers.Contract(
    CERT_TOPAZ_FACTORY,
    ["function getPool(address,address,bool) view returns (address)", "function getFee(address,bool) view returns (uint256)"],
    ethers.provider,
  );
  assertAddr("Topaz getPool(token,WBNB,false)", await topazFactory.getPool(tokenAddr, CERT_WBNB, false), poolAddr);
  const feeBps = await topazFactory.getFee(poolAddr, false);
  if (feeBps !== CERT_VOLATILE_FEE_BPS) fail(`pool fee ${feeBps} !== 100 bps`);

  const lockerLp = await pool.balanceOf(CERT_LOCKER);
  const lockedBalance = await locker.lockedBalance(poolAddr);
  const info = await locker.poolInfo(poolAddr);
  if (!info.registered) fail("locker poolInfo.registered == false");
  if (lockerLp <= 0n) fail("locker LP balance is 0");
  if (lockedBalance !== lockerLp) fail(`lockedBalance ${lockedBalance} !== locker LP ${lockerLp}`);
  if (lockedBalance !== BigInt(evidence.graduatedLiquidityLp) && lockedBalance < BigInt(evidence.graduatedLiquidityLp) - 1000n) {
    console.warn(`[bsc-graduation] lockedBalance ${lockedBalance} vs graduatedLiquidityLp ${evidence.graduatedLiquidityLp}`);
  }
  evidence.lockerLpBalanceBeforeTrades = lockerLp.toString();
  evidence.lpLockRegistered = true;
  evidence.lockedBalance = lockedBalance.toString();

  if (crossingBuyFinalized) evidence.graduationTx = crossingBuyTx;
  else if (leftoverGraduateTx) evidence.graduationTx = leftoverGraduateTx;
  else {
    const startBlock = Number(cleanSlate?.newFactory?.startBlock || 123128434);
    const finalized = await campaign.queryFilter(campaign.filters.CampaignFinalized(), startBlock);
    if (!finalized.length) fail("no CampaignFinalized log to recover graduationTx");
    evidence.graduationTx = finalized[finalized.length - 1].transactionHash;
  }

  try {
    await campaign.buyExactBnb.staticCall(1n, { value: 1n });
    fail("bonding buy after graduation did not revert");
  } catch (error: any) {
    const text = String(error?.shortMessage || error?.message || error);
    if (!/Finalized/i.test(text)) fail(`bonding buy after graduation reverted with ${text}, expected Finalized`);
    evidence.bondingBuyAfterGraduationReverted = "Finalized";
  }

  const route = await resolveMwzTopazRoute({
    provider: ethers.provider,
    campaignRouter,
    token: tokenAddr,
    pair: poolAddr,
  });
  const buyRoute = route.legs;
  const sellRoute = route.legs.map((leg) => ({ ...leg, from: leg.to, to: leg.from }));
  const production = new ethers.Contract(CERT_TOPAZ_ROUTER, ROUTER_SWAP_ABI, signer);
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);

  const directBuyValue = ethers.parseEther("0.002");
  const directBuyOut = await production.getAmountsOut(directBuyValue, buyRoute);
  const directBuyTx = await production.swapExactETHForTokens(
    (BigInt(directBuyOut[directBuyOut.length - 1]) * 95n) / 100n,
    buyRoute,
    actor,
    Math.floor(Date.now() / 1000) + 600,
    await gasOverrides({ value: directBuyValue }),
  );
  const directBuyReceipt = await directBuyTx.wait();
  if (!sameAddr(directBuyTx.to || "", CERT_TOPAZ_ROUTER)) fail("direct BUY did not target production router");
  evidence.buyTx = directBuyReceipt!.hash;
  evidence.directBuyTx = evidence.buyTx;

  const tokenBal = BigInt(await token.balanceOf(actor));
  const sellAmount = tokenBal / 5n;
  if (sellAmount <= 0n) fail("no token balance to SELL after direct BUY");
  const allowance = BigInt(await token.allowance(actor, CERT_TOPAZ_ROUTER));
  if (allowance < sellAmount) {
    await (await token.approve(CERT_TOPAZ_ROUTER, ethers.MaxUint256, await gasOverrides())).wait();
  }
  const directSellOut = await production.getAmountsOut(sellAmount, sellRoute);
  const directSellTx = await production.swapExactTokensForETH(
    sellAmount,
    (BigInt(directSellOut[directSellOut.length - 1]) * 95n) / 100n,
    sellRoute,
    actor,
    Math.floor(Date.now() / 1000) + 600,
    await gasOverrides(),
  );
  const directSellReceipt = await directSellTx.wait();
  evidence.sellTx = directSellReceipt!.hash;
  evidence.directSellTx = evidence.sellTx;

  const mwzBuy = await executeMwzTopazBuy({ signer, route, nativeIn: ethers.parseEther("0.001") });
  evidence.frontendBuyTx = mwzBuy.hash;
  const mwzTokenBal = BigInt(await token.balanceOf(actor));
  const mwzSellAmount = mwzTokenBal / 10n;
  const mwzSell = await executeMwzTopazSell({ signer, route, tokenIn: mwzSellAmount > 0n ? mwzSellAmount : sellAmount / 10n });
  evidence.frontendSellTx = mwzSell.hash;
  evidence.frontendPath = "scripts/lib/mwzTopazV2Trade.ts mirrors frontend/src/lib/topazV2Trade.ts executeTopazBuy/Sell";

  let claimable0 = await pool.claimable0(CERT_LOCKER);
  let claimable1 = await pool.claimable1(CERT_LOCKER);
  if (claimable0 + claimable1 === 0n) {
    const extra = await executeMwzTopazBuy({ signer, route, nativeIn: ethers.parseEther("0.001") });
    evidence.extraFeeBuyTx = extra.hash;
    claimable0 = await pool.claimable0(CERT_LOCKER);
    claimable1 = await pool.claimable1(CERT_LOCKER);
  }
  if (claimable0 + claimable1 === 0n) fail("claimable LP fees stayed 0 after Topaz BUY/SELL");

  const tokenIs0 = sameAddr(token0, tokenAddr);
  const claimedToken = tokenIs0 ? claimable0 : claimable1;
  const claimedWbnb = tokenIs0 ? claimable1 : claimable0;
  evidence.claimedToken = claimedToken.toString();
  evidence.claimedWbnb = claimedWbnb.toString();
  evidence.expectedCreatorToken = ((claimedToken * CREATOR_SHARE_BPS) / BPS).toString();
  evidence.expectedProtocolToken = (claimedToken - BigInt(evidence.expectedCreatorToken)).toString();
  evidence.expectedCreatorWbnb = ((claimedWbnb * CREATOR_SHARE_BPS) / BPS).toString();
  evidence.expectedProtocolWbnb = (claimedWbnb - BigInt(evidence.expectedCreatorWbnb)).toString();

  const wbnb = new ethers.Contract(CERT_WBNB, ERC20_ABI, ethers.provider);
  const treasuryRouterAddr = await locker.treasuryRouter();
  const treasuryRouter = new ethers.Contract(
    treasuryRouterAddr,
    ["function protocolRevenueVault() view returns (address)"],
    ethers.provider,
  );
  const protocolVault = await treasuryRouter.protocolRevenueVault();
  const creatorTokenBefore = BigInt(await token.balanceOf(creator));
  const creatorWbnbBefore = BigInt(await wbnb.balanceOf(creator));
  const protocolTokenBefore = BigInt(await token.balanceOf(protocolVault));
  const protocolWbnbBefore = BigInt(await wbnb.balanceOf(protocolVault));
  const lpBeforeHarvest = await pool.balanceOf(CERT_LOCKER);

  const harvestTx = await locker.harvest(poolAddr, await gasOverrides());
  const harvestReceipt = await harvestTx.wait();
  evidence.harvestTx = harvestReceipt!.hash;

  const creatorTokenReceived = BigInt(await token.balanceOf(creator)) - creatorTokenBefore;
  const creatorWbnbReceived = BigInt(await wbnb.balanceOf(creator)) - creatorWbnbBefore;
  const protocolTokenReceived = BigInt(await token.balanceOf(protocolVault)) - protocolTokenBefore;
  const protocolWbnbReceived = BigInt(await wbnb.balanceOf(protocolVault)) - protocolWbnbBefore;
  const lpAfterHarvest = await pool.balanceOf(CERT_LOCKER);
  const lockedAfter = await locker.lockedBalance(poolAddr);

  evidence.creatorTokenReceived = creatorTokenReceived.toString();
  evidence.creatorWbnbReceived = creatorWbnbReceived.toString();
  evidence.protocolTokenReceived = protocolTokenReceived.toString();
  evidence.protocolWbnbReceived = protocolWbnbReceived.toString();
  evidence.lockerLpBalanceAfterHarvest = lpAfterHarvest.toString();
  evidence.protocolVault = protocolVault;
  evidence.treasuryRouter = treasuryRouterAddr;

  if (lpAfterHarvest !== lpBeforeHarvest) fail(`LP principal moved during harvest ${lpBeforeHarvest} -> ${lpAfterHarvest}`);
  if (lpAfterHarvest !== lockedAfter) fail("lockedBalance moved during harvest");
  if (creatorTokenReceived !== BigInt(evidence.expectedCreatorToken)) {
    fail(`creator token ${creatorTokenReceived} !== 80% ${evidence.expectedCreatorToken}`);
  }
  if (protocolTokenReceived !== BigInt(evidence.expectedProtocolToken)) {
    fail(`protocol token ${protocolTokenReceived} !== 20% ${evidence.expectedProtocolToken}`);
  }
  if (creatorWbnbReceived !== BigInt(evidence.expectedCreatorWbnb)) {
    fail(`creator WBNB ${creatorWbnbReceived} !== 80% ${evidence.expectedCreatorWbnb}`);
  }
  if (protocolWbnbReceived !== BigInt(evidence.expectedProtocolWbnb)) {
    fail(`protocol WBNB ${protocolWbnbReceived} !== 20% ${evidence.expectedProtocolWbnb}`);
  }

  const indexer = await pollIndexer(campaignAddr, Number(env("INDEXER_TIMEOUT_MS") || 8 * 60 * 1000));
  evidence.indexer = {
    tokenApi: indexer.tokenApi,
    marketStage: indexer.state?.marketStage,
    pairAddress: indexer.state?.pairAddress,
    bondingTradeCount: indexer.bondingTradeCount,
    topazTradeCount: indexer.topazTradeCount,
    poolEnabled: indexer.state?.indexingStatus?.poolEnabled,
    ok: indexer.ok,
    timedOut: indexer.timedOut || false,
  };
  if (!indexer.ok) {
    fail(`indexer continuity failed stage=${indexer.state?.marketStage} bonding=${indexer.bondingTradeCount} topaz=${indexer.topazTradeCount}`);
  }

  evidence.creatorShareBps = 8000;
  evidence.protocolShareBps = 2000;
  evidence.LIVE_BSC_GRADUATION_POSTGRAD_ONCHAIN = true;

  const outDir = path.join(__dirname, "..", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "bnb-lifecycle-certification-testnet.json");
  fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 2)}\n`);
  process.env.TOPAZ_ACCEPTANCE_INPUT = outFile;
  console.log(`[bsc-graduation] evidence ${outFile}`);
  console.log("[bsc-graduation] on-chain remaining path complete; frontend Playwright still required for LIVE_BSC_GRADUATION_POSTGRAD=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
