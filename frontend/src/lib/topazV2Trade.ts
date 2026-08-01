import { Contract, ethers } from "ethers";
import { fetchMarketRoute, type MarketRoute } from "@/lib/marketContinuityApi";

const ROUTER_ABI = [
  "function defaultFactory() view returns (address)",
  "function weth() view returns (address)",
  "function getAmountsOut(uint256 amountIn,(address from,address to,bool stable,address factory)[] routes) view returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) returns (uint256[] amounts)",
] as const;

const FACTORY_ABI = [
  "function getPool(address tokenA,address tokenB,bool stable) view returns (address pool)",
] as const;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
] as const;

export type TopazRouteLeg = {
  from: string;
  to: string;
  stable: boolean;
  factory: string;
};

export type TopazResolvedRoute = {
  market: MarketRoute;
  route: TopazRouteLeg[];
  routerAddress: string;
  factoryAddress: string;
  wrappedNativeAddress: string;
  tokenAddress: string;
  pairAddress: string;
  feeBps: number;
};

export type TopazQuote = {
  amountInRaw: bigint;
  amountOutRaw: bigint;
  minimumOutRaw: bigint;
  slippageBps: number;
  feeBps: number;
  route: TopazResolvedRoute;
  quoteBlock: number;
  quotedAt: number;
  deadline: number;
};

const ZERO = ethers.ZeroAddress.toLowerCase();
const MAX_UINT256 = (1n << 256n) - 1n;

function normalizeAddress(value: unknown, field: string): string {
  const raw = String(value ?? "").trim();
  if (!ethers.isAddress(raw)) throw new Error(`Invalid ${field}`);
  return ethers.getAddress(raw);
}

function sameAddress(a: unknown, b: unknown): boolean {
  try {
    return ethers.getAddress(String(a)) === ethers.getAddress(String(b));
  } catch {
    return false;
  }
}

export function validateSlippageBps(value: number): number {
  const bps = Math.trunc(Number(value));
  if (!Number.isFinite(bps) || bps < 10 || bps > 500) {
    throw new Error("Slippage must be between 0.10% and 5.00%.");
  }
  return bps;
}

export function minimumOut(amountOutRaw: bigint, slippageBps: number): bigint {
  const bps = validateSlippageBps(slippageBps);
  if (amountOutRaw <= 0n) return 0n;
  return (amountOutRaw * BigInt(10_000 - bps)) / 10_000n;
}

async function assertContract(provider: ethers.Provider, address: string, label: string) {
  const code = await provider.getCode(address);
  if (!code || code === "0x") throw new Error(`${label} is not a deployed contract.`);
}

const CAMPAIGN_ROUTE_ABI = [
  "function token() view returns (address)",
  "function router() view returns (address)",
  "function launched() view returns (bool)",
  "function getGraduationState() view returns (address dexPair,uint256 finalCurvePrice,uint256 initialDexPrice,uint256 graduatedLiquidityTokens,uint256 graduatedLiquidityBnb,uint256 graduatedLiquidityLp,uint256 burnedUnsoldTokens,uint256 burnedUnusedLpTokens,uint256 postBurnTotalSupply,uint256 graduationBalance,uint256 graduationOvershoot)",
] as const;

const POOL_FEE_ABI = [
  "function fee() view returns (uint256)",
  "function swapFee() view returns (uint256)",
  "function stable() view returns (bool)",
] as const;

const FACTORY_FEE_ABI = [
  "function getFee(address pool,bool stable) view returns (uint256)",
  "function getFee(address pool) view returns (uint256)",
] as const;

async function readPoolFeeBps(
  provider: ethers.Provider,
  factoryAddress: string,
  pairAddress: string,
): Promise<number> {
  const pool = new Contract(pairAddress, POOL_FEE_ABI, provider) as any;
  const factory = new Contract(factoryAddress, FACTORY_FEE_ABI, provider) as any;
  try {
    const fee = Number(await pool.fee());
    if (Number.isInteger(fee) && fee >= 0 && fee <= 1_000) return fee;
  } catch {
    // continue
  }
  try {
    const fee = Number(await pool.swapFee());
    if (Number.isInteger(fee) && fee >= 0 && fee <= 1_000) return fee;
  } catch {
    // continue
  }
  try {
    const fee = Number(await factory.getFee(pairAddress, false));
    if (Number.isInteger(fee) && fee >= 0 && fee <= 1_000) return fee;
  } catch {
    // continue
  }
  try {
    const fee = Number(await factory["getFee(address)"](pairAddress));
    if (Number.isInteger(fee) && fee >= 0 && fee <= 1_000) return fee;
  } catch {
    // continue
  }
  // Official Topaz volatile fee is 100 bps. Use only after pair/router verification.
  return 100;
}

async function finalizeResolvedRoute(input: {
  provider: ethers.Provider;
  campaignAddress: string;
  tokenAddress: string;
  pairAddress: string;
  routerAddress: string;
  factoryAddress: string;
  wrappedNativeAddress: string;
  feeBps?: number | null;
  expectedTokenAddress?: string;
  market: MarketRoute;
}): Promise<TopazResolvedRoute> {
  const campaignAddress = normalizeAddress(input.campaignAddress, "campaign address");
  const tokenAddress = normalizeAddress(input.tokenAddress, "market token");
  const pairAddress = normalizeAddress(input.pairAddress, "Topaz pair");
  const routerAddress = normalizeAddress(input.routerAddress, "Topaz router");
  const factoryAddress = normalizeAddress(input.factoryAddress, "Topaz factory");
  const wrappedNativeAddress = normalizeAddress(input.wrappedNativeAddress, "wrapped native token");

  if (input.expectedTokenAddress && !sameAddress(tokenAddress, input.expectedTokenAddress)) {
    throw new Error("Market route token mismatch.");
  }
  if ([pairAddress, routerAddress, factoryAddress, wrappedNativeAddress].some((value) => value.toLowerCase() === ZERO)) {
    throw new Error("Topaz route contains a zero address.");
  }

  await Promise.all([
    assertContract(input.provider, tokenAddress, "Token"),
    assertContract(input.provider, pairAddress, "Topaz pair"),
    assertContract(input.provider, routerAddress, "Topaz router"),
    assertContract(input.provider, factoryAddress, "Topaz factory"),
    assertContract(input.provider, wrappedNativeAddress, "Wrapped native token"),
  ]);

  const router = new Contract(routerAddress, ROUTER_ABI, input.provider) as any;
  const factory = new Contract(factoryAddress, FACTORY_ABI, input.provider) as any;
  const pool = new Contract(pairAddress, POOL_FEE_ABI, input.provider) as any;
  const [routerFactory, routerWrappedNative, factoryPair] = await Promise.all([
    router.defaultFactory(),
    router.weth(),
    factory.getPool(tokenAddress, wrappedNativeAddress, false),
  ]);

  if (!sameAddress(routerFactory, factoryAddress)) throw new Error("Topaz router factory mismatch.");
  if (!sameAddress(routerWrappedNative, wrappedNativeAddress)) throw new Error("Topaz router WBNB mismatch.");
  if (!sameAddress(factoryPair, pairAddress)) throw new Error("Topaz factory pair mismatch.");

  try {
    const stable = Boolean(await pool.stable());
    if (stable) throw new Error("MemeWarzone graduation requires a volatile Topaz pool.");
  } catch (error: any) {
    if (String(error?.message || "").includes("volatile")) throw error;
    // Some mock/rehearsal pools may omit stable(); factory pair match still gates the route.
  }

  let feeBps = Number(input.feeBps);
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1_000) {
    feeBps = await readPoolFeeBps(input.provider, factoryAddress, pairAddress);
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1_000) {
    throw new Error("Topaz pool fee is not verified.");
  }

  return {
    market: {
      ...input.market,
      chainId: input.market.chainId,
      marketStage: "TOPAZ_ACTIVE",
      campaignAddress,
      token: tokenAddress,
      pair: pairAddress,
      router: routerAddress,
      factory: factoryAddress,
      wrappedNative: wrappedNativeAddress,
      stable: false,
      feeBps,
      verified: true,
      tradingEnabled: true,
    },
    routerAddress,
    factoryAddress,
    wrappedNativeAddress,
    tokenAddress,
    pairAddress,
    feeBps,
    route: [
      {
        from: wrappedNativeAddress,
        to: tokenAddress,
        stable: false,
        factory: factoryAddress,
      },
    ],
  };
}

async function resolveTopazRouteOnChain(input: {
  provider: ethers.Provider;
  campaignAddress: string;
  chainId: number;
  expectedTokenAddress?: string;
}): Promise<TopazResolvedRoute> {
  const campaignAddress = normalizeAddress(input.campaignAddress, "campaign address");
  const campaign = new Contract(campaignAddress, CAMPAIGN_ROUTE_ABI, input.provider) as any;
  const [tokenRaw, routerRaw, launched, graduation] = await Promise.all([
    campaign.token(),
    campaign.router(),
    campaign.launched(),
    campaign.getGraduationState(),
  ]);
  if (!launched) throw new Error("Campaign has not graduated yet.");

  const tokenAddress = normalizeAddress(tokenRaw, "campaign token");
  const routerAddress = normalizeAddress(routerRaw, "campaign Topaz router");
  const pairAddress = normalizeAddress(graduation?.[0] ?? graduation?.dexPair, "graduation Topaz pair");
  if (pairAddress.toLowerCase() === ZERO) throw new Error("Graduation pair is not available yet.");

  const router = new Contract(routerAddress, ROUTER_ABI, input.provider) as any;
  const [factoryRaw, wrappedNativeRaw] = await Promise.all([router.defaultFactory(), router.weth()]);
  const factoryAddress = normalizeAddress(factoryRaw, "Topaz factory");
  const wrappedNativeAddress = normalizeAddress(wrappedNativeRaw, "wrapped native token");

  return finalizeResolvedRoute({
    provider: input.provider,
    campaignAddress,
    tokenAddress,
    pairAddress,
    routerAddress,
    factoryAddress,
    wrappedNativeAddress,
    expectedTokenAddress: input.expectedTokenAddress,
    market: {
      chainId: input.chainId,
      marketStage: "TOPAZ_ACTIVE",
      campaignAddress,
      token: tokenAddress,
      pair: pairAddress,
      router: routerAddress,
      factory: factoryAddress,
      wrappedNative: wrappedNativeAddress,
      stable: false,
      feeBps: null,
      verified: true,
      tradingEnabled: true,
      verifiedAt: null,
      lastError: null,
    },
  });
}

export async function resolveVerifiedTopazRoute(input: {
  provider: ethers.Provider;
  campaignAddress: string;
  chainId: number;
  expectedTokenAddress?: string;
  signal?: AbortSignal;
}): Promise<TopazResolvedRoute> {
  const network = await input.provider.getNetwork();
  if (Number(network.chainId) !== Number(input.chainId)) {
    throw new Error(`Wrong network. Connect chain ${input.chainId}.`);
  }

  const campaignAddress = normalizeAddress(input.campaignAddress, "campaign address");

  // Prefer the verified market-route API when the continuity backend is live.
  // Fall back to on-chain campaign graduation state so Token Details / War Room
  // can still quote and execute Topaz trades during rollout.
  try {
    const market = await fetchMarketRoute(campaignAddress, input.chainId, input.signal);
    if (market.marketStage === "TOPAZ_ACTIVE" && market.verified && market.tradingEnabled && market.stable === false) {
      return finalizeResolvedRoute({
        provider: input.provider,
        campaignAddress,
        tokenAddress: String(market.token || ""),
        pairAddress: String(market.pair || ""),
        routerAddress: String(market.router || ""),
        factoryAddress: String(market.factory || ""),
        wrappedNativeAddress: String(market.wrappedNative || ""),
        feeBps: market.feeBps,
        expectedTokenAddress: input.expectedTokenAddress,
        market,
      });
    }
  } catch {
    // On-chain fallback below.
  }

  return resolveTopazRouteOnChain({
    provider: input.provider,
    campaignAddress,
    chainId: input.chainId,
    expectedTokenAddress: input.expectedTokenAddress,
  });
}

async function quoteExactInput(
  provider: ethers.Provider,
  resolved: TopazResolvedRoute,
  amountInRaw: bigint,
  reverse: boolean,
): Promise<{ amountOutRaw: bigint; quoteBlock: number }> {
  if (amountInRaw <= 0n) throw new Error("Trade amount must be greater than zero.");
  const router = new Contract(resolved.routerAddress, ROUTER_ABI, provider) as any;
  const route = reverse
    ? resolved.route.map((leg) => ({ ...leg, from: leg.to, to: leg.from }))
    : resolved.route;
  const [amounts, quoteBlock] = await Promise.all([
    router.getAmountsOut(amountInRaw, route),
    provider.getBlockNumber(),
  ]);
  const amountOutRaw = BigInt(amounts?.[amounts.length - 1] ?? 0);
  if (amountOutRaw <= 0n) throw new Error("Topaz returned an empty quote.");
  return { amountOutRaw, quoteBlock };
}

export async function quoteTopazBuy(input: {
  provider: ethers.Provider;
  resolved: TopazResolvedRoute;
  nativeAmountInRaw: bigint;
  slippageBps: number;
  deadlineSeconds?: number;
}): Promise<TopazQuote> {
  const { amountOutRaw, quoteBlock } = await quoteExactInput(
    input.provider,
    input.resolved,
    input.nativeAmountInRaw,
    false,
  );
  const now = Math.floor(Date.now() / 1000);
  return {
    amountInRaw: input.nativeAmountInRaw,
    amountOutRaw,
    minimumOutRaw: minimumOut(amountOutRaw, input.slippageBps),
    slippageBps: validateSlippageBps(input.slippageBps),
    feeBps: input.resolved.feeBps,
    route: input.resolved,
    quoteBlock,
    quotedAt: now,
    deadline: now + Math.max(60, Math.min(input.deadlineSeconds ?? 600, 1_800)),
  };
}

export async function quoteTopazSell(input: {
  provider: ethers.Provider;
  resolved: TopazResolvedRoute;
  tokenAmountInRaw: bigint;
  slippageBps: number;
  deadlineSeconds?: number;
}): Promise<TopazQuote> {
  const { amountOutRaw, quoteBlock } = await quoteExactInput(
    input.provider,
    input.resolved,
    input.tokenAmountInRaw,
    true,
  );
  const now = Math.floor(Date.now() / 1000);
  return {
    amountInRaw: input.tokenAmountInRaw,
    amountOutRaw,
    minimumOutRaw: minimumOut(amountOutRaw, input.slippageBps),
    slippageBps: validateSlippageBps(input.slippageBps),
    feeBps: input.resolved.feeBps,
    route: input.resolved,
    quoteBlock,
    quotedAt: now,
    deadline: now + Math.max(60, Math.min(input.deadlineSeconds ?? 600, 1_800)),
  };
}

async function solveInputForTargetOutput(input: {
  provider: ethers.Provider;
  resolved: TopazResolvedRoute;
  targetOutRaw: bigint;
  reverse: boolean;
  initialHighRaw: bigint;
}): Promise<bigint> {
  if (input.targetOutRaw <= 0n) return 0n;
  let low = 0n;
  let high = input.initialHighRaw > 0n ? input.initialHighRaw : 1n;

  for (let expansion = 0; expansion < 16; expansion += 1) {
    const quote = await quoteExactInput(input.provider, input.resolved, high, input.reverse);
    if (quote.amountOutRaw >= input.targetOutRaw) break;
    high *= 2n;
    if (expansion === 15) throw new Error("Unable to solve Topaz quote for the requested output.");
  }

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const mid = (low + high) / 2n;
    if (mid <= low) break;
    const quote = await quoteExactInput(input.provider, input.resolved, mid, input.reverse);
    if (quote.amountOutRaw >= input.targetOutRaw) high = mid;
    else low = mid;
  }
  return high;
}

export function solveNativeForExactTokens(input: {
  provider: ethers.Provider;
  resolved: TopazResolvedRoute;
  targetTokenOutRaw: bigint;
  initialNativeHighRaw: bigint;
}) {
  return solveInputForTargetOutput({
    provider: input.provider,
    resolved: input.resolved,
    targetOutRaw: input.targetTokenOutRaw,
    reverse: false,
    initialHighRaw: input.initialNativeHighRaw,
  });
}

export function solveTokensForExactNative(input: {
  provider: ethers.Provider;
  resolved: TopazResolvedRoute;
  targetNativeOutRaw: bigint;
  initialTokenHighRaw: bigint;
}) {
  return solveInputForTargetOutput({
    provider: input.provider,
    resolved: input.resolved,
    targetOutRaw: input.targetNativeOutRaw,
    reverse: true,
    initialHighRaw: input.initialTokenHighRaw,
  });
}

function assertFreshQuote(quote: TopazQuote, maxAgeSeconds = 30) {
  const now = Math.floor(Date.now() / 1000);
  if (now - quote.quotedAt > maxAgeSeconds) throw new Error("Topaz quote is stale. Requote before signing.");
  if (quote.deadline <= now) throw new Error("Topaz quote deadline expired.");
}

export async function executeTopazBuy(input: {
  signer: ethers.Signer;
  recipient: string;
  quote: TopazQuote;
}) {
  assertFreshQuote(input.quote);
  const recipient = normalizeAddress(input.recipient, "recipient");
  const router = new Contract(input.quote.route.routerAddress, ROUTER_ABI, input.signer) as any;
  return router.swapExactETHForTokens(
    input.quote.minimumOutRaw,
    input.quote.route.route,
    recipient,
    input.quote.deadline,
    { value: input.quote.amountInRaw },
  );
}

export async function ensureTopazSellAllowance(input: {
  signer: ethers.Signer;
  owner: string;
  resolved: TopazResolvedRoute;
  tokenAmountRaw: bigint;
}) {
  const owner = normalizeAddress(input.owner, "wallet");
  const token = new Contract(input.resolved.tokenAddress, ERC20_ABI, input.signer) as any;
  const allowance = BigInt(await token.allowance(owner, input.resolved.routerAddress));
  if (allowance >= input.tokenAmountRaw) return null;
  return token.approve(input.resolved.routerAddress, MAX_UINT256);
}

export async function executeTopazSell(input: {
  signer: ethers.Signer;
  recipient: string;
  quote: TopazQuote;
}) {
  assertFreshQuote(input.quote);
  const recipient = normalizeAddress(input.recipient, "recipient");
  const reverseRoute = input.quote.route.route.map((leg) => ({ ...leg, from: leg.to, to: leg.from }));
  const router = new Contract(input.quote.route.routerAddress, ROUTER_ABI, input.signer) as any;
  return router.swapExactTokensForETH(
    input.quote.amountInRaw,
    input.quote.minimumOutRaw,
    reverseRoute,
    recipient,
    input.quote.deadline,
  );
}
