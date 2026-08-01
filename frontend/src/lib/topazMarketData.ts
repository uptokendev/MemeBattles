import { Contract, ethers } from "ethers";
import type { CurveTradePoint } from "@/hooks/useCurveTrades";
import { resolveVerifiedTopazRoute, type TopazResolvedRoute } from "@/lib/topazV2Trade";

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
  "function stable() view returns (bool)",
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
] as const;

const CAMPAIGN_ABI = [
  "function getGraduationState() view returns (address dexPair,uint256 finalCurvePrice,uint256 initialDexPrice,uint256 graduatedLiquidityTokens,uint256 graduatedLiquidityBnb,uint256 graduatedLiquidityLp,uint256 burnedUnsoldTokens,uint256 burnedUnusedLpTokens,uint256 postBurnTotalSupply,uint256 graduationBalance,uint256 graduationOvershoot)",
  "function token() view returns (address)",
] as const;

const DEFAULT_LOOKBACK_BLOCKS = 4_000;
const LOG_CHUNK_SIZE = 400;

export type TopazMarketSnapshot = {
  resolved: TopazResolvedRoute;
  token0: string;
  token1: string;
  tokenIsToken0: boolean;
  reserveTokenRaw: bigint;
  reserveNativeRaw: bigint;
  priceBnb: number;
  liquidityBnb: number;
  postBurnSupplyRaw: bigint;
  marketCapBnb: number;
  feeBps: number;
  trades: CurveTradePoint[];
  updatedAt: number;
};

function sameAddress(a: unknown, b: unknown): boolean {
  try {
    return ethers.getAddress(String(a)) === ethers.getAddress(String(b));
  } catch {
    return false;
  }
}

function toNumberFromWei(value: bigint, decimals = 18): number {
  try {
    const n = Number(ethers.formatUnits(value, decimals));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function priceBnbFromReserves(reserveTokenRaw: bigint, reserveNativeRaw: bigint): number {
  if (reserveTokenRaw <= 0n || reserveNativeRaw <= 0n) return 0;
  const token = toNumberFromWei(reserveTokenRaw);
  const native = toNumberFromWei(reserveNativeRaw);
  if (!(token > 0) || !(native > 0)) return 0;
  const price = native / token;
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function priceBnbFromAmounts(tokenAmountRaw: bigint, nativeAmountRaw: bigint): number {
  if (tokenAmountRaw <= 0n || nativeAmountRaw <= 0n) return 0;
  const token = toNumberFromWei(tokenAmountRaw);
  const native = toNumberFromWei(nativeAmountRaw);
  if (!(token > 0) || !(native > 0)) return 0;
  const price = native / token;
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function normalizeTopazSwap(
  tokenIsToken0: boolean,
  amounts: {
    amount0In: bigint;
    amount1In: bigint;
    amount0Out: bigint;
    amount1Out: bigint;
  },
): { side: "buy" | "sell"; tokenAmountRaw: bigint; nativeAmountRaw: bigint } | null {
  const tokenIn = tokenIsToken0 ? amounts.amount0In : amounts.amount1In;
  const tokenOut = tokenIsToken0 ? amounts.amount0Out : amounts.amount1Out;
  const nativeIn = tokenIsToken0 ? amounts.amount1In : amounts.amount0In;
  const nativeOut = tokenIsToken0 ? amounts.amount1Out : amounts.amount0Out;

  if (tokenOut > 0n && nativeIn > 0n && tokenIn === 0n && nativeOut === 0n) {
    return { side: "buy", tokenAmountRaw: tokenOut, nativeAmountRaw: nativeIn };
  }
  if (tokenIn > 0n && nativeOut > 0n && tokenOut === 0n && nativeIn === 0n) {
    return { side: "sell", tokenAmountRaw: tokenIn, nativeAmountRaw: nativeOut };
  }
  return null;
}

async function getLogsChunked(
  provider: ethers.Provider,
  filter: { address: string; topics: string[]; fromBlock: number; toBlock: number },
): Promise<ethers.Log[]> {
  const out: ethers.Log[] = [];
  for (let start = filter.fromBlock; start <= filter.toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(filter.toBlock, start + LOG_CHUNK_SIZE - 1);
    try {
      const logs = await provider.getLogs({
        address: filter.address,
        topics: filter.topics,
        fromBlock: start,
        toBlock: end,
      });
      out.push(...logs);
    } catch {
      // Public RPCs often reject large ranges; keep partial history.
    }
  }
  return out;
}

export async function fetchTopazMarketSnapshot(input: {
  provider: ethers.Provider;
  campaignAddress: string;
  chainId: number;
  expectedTokenAddress?: string;
  lookbackBlocks?: number;
  signal?: AbortSignal;
}): Promise<TopazMarketSnapshot> {
  if (input.signal?.aborted) throw new Error("Aborted");

  const resolved = await resolveVerifiedTopazRoute({
    provider: input.provider,
    campaignAddress: input.campaignAddress,
    chainId: input.chainId,
    expectedTokenAddress: input.expectedTokenAddress,
    signal: input.signal,
  });

  const pool = new Contract(resolved.pairAddress, POOL_ABI, input.provider) as any;
  const campaign = new Contract(input.campaignAddress, CAMPAIGN_ABI, input.provider) as any;

  const [token0Raw, token1Raw, reserves, graduation] = await Promise.all([
    pool.token0(),
    pool.token1(),
    pool.getReserves(),
    campaign.getGraduationState(),
  ]);

  const token0 = ethers.getAddress(String(token0Raw));
  const token1 = ethers.getAddress(String(token1Raw));
  const tokenIsToken0 = sameAddress(token0, resolved.tokenAddress);
  if (!tokenIsToken0 && !sameAddress(token1, resolved.tokenAddress)) {
    throw new Error("Topaz pool tokens do not include the campaign token.");
  }
  if (
    !sameAddress(tokenIsToken0 ? token1 : token0, resolved.wrappedNativeAddress)
  ) {
    throw new Error("Topaz pool is not paired with the campaign wrapped native token.");
  }

  const reserve0 = BigInt(reserves?.[0] ?? 0);
  const reserve1 = BigInt(reserves?.[1] ?? 0);
  const reserveTokenRaw = tokenIsToken0 ? reserve0 : reserve1;
  const reserveNativeRaw = tokenIsToken0 ? reserve1 : reserve0;
  const priceBnb = priceBnbFromReserves(reserveTokenRaw, reserveNativeRaw);
  const liquidityBnb = toNumberFromWei(reserveNativeRaw) * 2;
  const postBurnSupplyRaw = BigInt(graduation?.[8] ?? graduation?.postBurnTotalSupply ?? 0);
  const marketCapBnb =
    postBurnSupplyRaw > 0n && priceBnb > 0
      ? priceBnb * toNumberFromWei(postBurnSupplyRaw)
      : 0;

  const latest = await input.provider.getBlockNumber();
  const lookback = Math.max(500, Math.min(input.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS, 12_000));
  const fromBlock = Math.max(0, latest - lookback);
  const iface = new ethers.Interface(POOL_ABI);
  const swapTopic = iface.getEvent("Swap")!.topicHash;
  const logs = await getLogsChunked(input.provider, {
    address: resolved.pairAddress,
    topics: [swapTopic],
    fromBlock,
    toBlock: latest,
  });

  const blockTimes = new Map<number, number>();
  const uniqueBlocks = Array.from(new Set(logs.map((log) => Number(log.blockNumber || 0)).filter((n) => n > 0)));
  await Promise.all(
    uniqueBlocks.slice(-80).map(async (blockNumber) => {
      try {
        const block = await input.provider.getBlock(blockNumber);
        if (block?.timestamp) blockTimes.set(blockNumber, Number(block.timestamp));
      } catch {
        // ignore
      }
    }),
  );

  const trades: CurveTradePoint[] = [];
  for (const log of logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed || parsed.name !== "Swap") continue;
      const amounts = {
        amount0In: BigInt(parsed.args.amount0In ?? 0),
        amount1In: BigInt(parsed.args.amount1In ?? 0),
        amount0Out: BigInt(parsed.args.amount0Out ?? 0),
        amount1Out: BigInt(parsed.args.amount1Out ?? 0),
      };
      const normalized = normalizeTopazSwap(tokenIsToken0, amounts);
      if (!normalized) continue;
      const blockNumber = Number(log.blockNumber || 0);
      const timestamp = blockTimes.get(blockNumber) || Math.floor(Date.now() / 1000);
      const pricePerToken = priceBnbFromAmounts(normalized.tokenAmountRaw, normalized.nativeAmountRaw);
      trades.push({
        type: normalized.side,
        from: String(parsed.args.sender || "").toLowerCase(),
        to: String(parsed.args.to || "").toLowerCase(),
        tokensWei: normalized.tokenAmountRaw,
        nativeWei: normalized.nativeAmountRaw,
        pricePerToken,
        timestamp,
        txHash: String(log.transactionHash || "").toLowerCase(),
        blockNumber,
        logIndex: Number(log.index ?? 0),
      });
    } catch {
      // skip undecodable logs
    }
  }

  trades.sort(
    (a, b) =>
      a.blockNumber - b.blockNumber ||
      Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0),
  );

  return {
    resolved,
    token0,
    token1,
    tokenIsToken0,
    reserveTokenRaw,
    reserveNativeRaw,
    priceBnb,
    liquidityBnb,
    postBurnSupplyRaw,
    marketCapBnb,
    feeBps: resolved.feeBps,
    trades,
    updatedAt: Date.now(),
  };
}
