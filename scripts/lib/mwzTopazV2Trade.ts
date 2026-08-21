/**
 * MemeWarzone Topaz execution path used by Token Details / War Room
 * (`frontend/src/lib/topazV2Trade.ts`). Kept as a Node-callable twin so the
 * remaining-path driver can prove post-grad BUY/SELL through the same unwrap
 * + production-router swap, not a raw adapter call.
 */
import { Contract, ethers } from "ethers";
import {
  assertAddr,
  CERT_TOPAZ_FACTORY,
  CERT_TOPAZ_ROUTER,
  CERT_VOLATILE_FEE_BPS,
  CERT_WBNB,
  fail,
  sameAddr,
} from "./bscCertificationPins";

const EXECUTION_ROUTER_ABI = [
  "function defaultFactory() view returns (address)",
  "function weth() view returns (address)",
  "function getAmountsOut(uint256 amountIn,(address from,address to,bool stable,address factory)[] routes) view returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) returns (uint256[] amounts)",
];

const ADAPTER_ABI = [
  "function topazRouter() view returns (address)",
  "function poolFactory() view returns (address)",
  "function WETH() view returns (address)",
];

const FACTORY_ABI = ["function getPool(address tokenA,address tokenB,bool stable) view returns (address pool)"];
const POOL_ABI = ["function stable() view returns (bool)"];
const ERC20_ABI = [
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

export type MwzTopazRoute = {
  executionRouter: string;
  adapterRouter: string;
  factory: string;
  wbnb: string;
  token: string;
  pair: string;
  legs: { from: string; to: string; stable: boolean; factory: string }[];
};

export async function resolveMwzTopazRoute(input: {
  provider: ethers.Provider;
  campaignRouter: string;
  token: string;
  pair: string;
}): Promise<MwzTopazRoute> {
  const adapter = new Contract(input.campaignRouter, ADAPTER_ABI, input.provider);
  const [productionRaw, factoryRaw, wrappedRaw] = await Promise.all([
    adapter.topazRouter(),
    adapter.poolFactory(),
    adapter.WETH(),
  ]);
  const executionRouter = ethers.getAddress(productionRaw);
  const factory = ethers.getAddress(factoryRaw);
  const wbnb = ethers.getAddress(wrappedRaw);
  assertAddr("topazV2Trade.executionRouter", executionRouter, CERT_TOPAZ_ROUTER);
  assertAddr("topazV2Trade.factory", factory, CERT_TOPAZ_FACTORY);
  assertAddr("topazV2Trade.wbnb", wbnb, CERT_WBNB);
  if (sameAddr(executionRouter, input.campaignRouter)) {
    fail("campaign router is the production Topaz router; expected adapter unwrap to 0xe559");
  }

  const production = new Contract(executionRouter, EXECUTION_ROUTER_ABI, input.provider);
  assertAddr("production.defaultFactory", await production.defaultFactory(), CERT_TOPAZ_FACTORY);
  assertAddr("production.weth", await production.weth(), CERT_WBNB);

  const poolFactory = new Contract(factory, FACTORY_ABI, input.provider);
  const factoryPair = await poolFactory.getPool(input.token, wbnb, false);
  if (!sameAddr(factoryPair, input.pair)) {
    fail(`Topaz factory pair mismatch: getPool=${factoryPair} graduation=${input.pair}`);
  }
  const pool = new Contract(input.pair, POOL_ABI, input.provider);
  if (Boolean(await pool.stable())) fail("graduation pool is stable; MemeWarzone requires volatile");

  return {
    executionRouter,
    adapterRouter: ethers.getAddress(input.campaignRouter),
    factory,
    wbnb,
    token: ethers.getAddress(input.token),
    pair: ethers.getAddress(input.pair),
    legs: [{ from: wbnb, to: ethers.getAddress(input.token), stable: false, factory }],
  };
}

function minimumOut(amountOut: bigint, slippageBps: number) {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

async function amountsOut(
  provider: ethers.Provider,
  route: MwzTopazRoute,
  amountIn: bigint,
  reverse: boolean,
) {
  const router = new Contract(route.executionRouter, EXECUTION_ROUTER_ABI, provider);
  const legs = reverse ? route.legs.map((leg) => ({ ...leg, from: leg.to, to: leg.from })) : route.legs;
  const amounts = await router.getAmountsOut(amountIn, legs);
  const out = BigInt(amounts[amounts.length - 1]);
  if (out <= 0n) fail("Topaz returned an empty quote");
  return out;
}

export async function executeMwzTopazBuy(input: {
  signer: ethers.Signer;
  route: MwzTopazRoute;
  nativeIn: bigint;
  slippageBps?: number;
}) {
  if (sameAddr(input.route.executionRouter, input.route.adapterRouter)) {
    fail("refusing swap on adapter; topazV2Trade must hit production router 0xe559");
  }
  const slippage = input.slippageBps ?? 100;
  const amountOut = await amountsOut(input.signer.provider!, input.route, input.nativeIn, false);
  const recipient = await input.signer.getAddress();
  const router = new Contract(input.route.executionRouter, EXECUTION_ROUTER_ABI, input.signer);
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const tx = await router.swapExactETHForTokens(
    minimumOut(amountOut, slippage),
    input.route.legs,
    recipient,
    deadline,
    { value: input.nativeIn },
  );
  if (!sameAddr(tx.to || "", CERT_TOPAZ_ROUTER)) {
    fail(`topazV2Trade buy targeted ${tx.to}, expected ${CERT_TOPAZ_ROUTER}`);
  }
  const receipt = await tx.wait();
  return { hash: receipt!.hash, to: tx.to as string, amountOut };
}

export async function executeMwzTopazSell(input: {
  signer: ethers.Signer;
  route: MwzTopazRoute;
  tokenIn: bigint;
  slippageBps?: number;
}) {
  const slippage = input.slippageBps ?? 100;
  const amountOut = await amountsOut(input.signer.provider!, input.route, input.tokenIn, true);
  const recipient = await input.signer.getAddress();
  const token = new Contract(input.route.token, ERC20_ABI, input.signer);
  const allowance = BigInt(await token.allowance(recipient, input.route.executionRouter));
  if (allowance < input.tokenIn) {
    const approveTx = await token.approve(input.route.executionRouter, ethers.MaxUint256);
    await approveTx.wait();
  }
  const reverse = input.route.legs.map((leg) => ({ ...leg, from: leg.to, to: leg.from }));
  const router = new Contract(input.route.executionRouter, EXECUTION_ROUTER_ABI, input.signer);
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const tx = await router.swapExactTokensForETH(
    input.tokenIn,
    minimumOut(amountOut, slippage),
    reverse,
    recipient,
    deadline,
  );
  if (!sameAddr(tx.to || "", CERT_TOPAZ_ROUTER)) {
    fail(`topazV2Trade sell targeted ${tx.to}, expected ${CERT_TOPAZ_ROUTER}`);
  }
  const receipt = await tx.wait();
  return { hash: receipt!.hash, to: tx.to as string, amountOut };
}

export { CERT_VOLATILE_FEE_BPS };
