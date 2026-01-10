// src/hooks/useCurveTrades.ts
import { useEffect, useState } from "react";
import { Contract, ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import { useWallet } from "@/hooks/useWallet";

export type CurveTradeSide = "buy" | "sell";

export type CurveTradePoint = {
  timestamp: number;          // unix seconds
  side: CurveTradeSide;       // "buy" | "sell"
  tokensWei: bigint;          // amount of tokens in wei
  nativeWei: bigint;          // amount of BNB in wei
  pricePerToken: number;      // in native token (BNB) per token
  cumulativeTokensWei: bigint;
  txHash: string;
  trader?: string;
};

type UseCurveTradesState = {
  points: CurveTradePoint[];
  loading: boolean;
  error?: string;
};

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;

// Many public RPCs (including some BSC endpoints) enforce a max block range for eth_getLogs.
// We therefore:
//  1) Avoid querying from genesis by default (too expensive)
//  2) Chunk log queries into small block ranges to stay under provider limits.
//
// NOTE: Timeframe analytics only needs recent history; a longer lookback can be implemented
// via an indexer/subgraph later.
const DEFAULT_LOOKBACK_BLOCKS = 50_000; // ~1–2 days on BSC (approx), safe for charts + 24h analytics
const LOG_CHUNK_SIZE = 900; // keep comfortably under common 1000-block eth_getLogs limits

async function queryFilterChunked(
  contract: Contract,
  filter: any,
  fromBlock: number,
  toBlock: number
) {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(toBlock, start + LOG_CHUNK_SIZE - 1);
    // ethers v6: queryFilter(filter, fromBlock, toBlock)
    const chunk = await contract.queryFilter(filter, start, end);
    logs.push(...chunk);
  }
  return logs;
}

/**
 * Reads buy/sell events from the bonding-curve campaign contract
 * and converts them into chart points.
 *
 * IMPORTANT:
 *   - Replace "TokensPurchased" / "TokensSold" and argument names
 *     with your actual event names & positions from LaunchCampaign.sol.
 */
export function useCurveTrades(
  campaignAddress?: string
): UseCurveTradesState {
  const { provider } = useWallet();
  const [points, setPoints] = useState<CurveTradePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!provider || !campaignAddress) {
      setPoints([]);
      return;
    }

    const contract = new Contract(
      campaignAddress,
      CAMPAIGN_ABI,
      provider
    );

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(undefined);

        // 1) Query past events (bounded + chunked)
        // Public RPCs may reject large eth_getLogs ranges; we avoid querying from genesis.
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - DEFAULT_LOOKBACK_BLOCKS);

        const buyFilter = contract.filters.TokensPurchased?.();
        const sellFilter = contract.filters.TokensSold?.();

        const [buyLogs, sellLogs] = await Promise.all([
          buyFilter
            ? queryFilterChunked(contract, buyFilter, fromBlock, latestBlock)
            : [],
          sellFilter
            ? queryFilterChunked(contract, sellFilter, fromBlock, latestBlock)
            : [],
        ]);

        const allLogs = [
          ...buyLogs.map((log) => ({ side: "buy" as const, log })),
          ...sellLogs.map((log) => ({ side: "sell" as const, log })),
        ].sort((a, b) => {
          if (a.log.blockNumber === b.log.blockNumber) {
            return a.log.transactionIndex - b.log.transactionIndex;
          }
          return a.log.blockNumber - b.log.blockNumber;
        });

        const newPoints: CurveTradePoint[] = [];
        let cumulativeTokensWei = 0n;

        // Cache timestamps per block to reduce RPC calls.
        const blockTs = new Map<number, number>();

        for (const { side, log } of allLogs) {
          // Get block timestamp
          let ts = blockTs.get(log.blockNumber);
          if (!ts) {
            const block = await provider.getBlock(log.blockNumber);
            ts = block?.timestamp ?? Math.floor(Date.now() / 1000);
            blockTs.set(log.blockNumber, ts);
          }

          // LaunchCampaign.sol events:
          //   TokensPurchased(address buyer, uint256 amountOut, uint256 cost)
          //   TokensSold(address seller, uint256 amountIn, uint256 payout)
          const tokenAmountWei: bigint =
            side === "buy"
              ? (log.args?.amountOut ?? log.args?.[1] ?? 0n)
              : (log.args?.amountIn ?? log.args?.[1] ?? 0n);

          const nativeAmountWei: bigint =
            side === "buy"
              ? (log.args?.cost ?? log.args?.[2] ?? 0n)
              : (log.args?.payout ?? log.args?.[2] ?? 0n);

          const trader: string | undefined =
            side === "buy"
              ? (log.args?.buyer ?? log.args?.[0])
              : (log.args?.seller ?? log.args?.[0]);

          if (tokenAmountWei === 0n) continue;

          cumulativeTokensWei += tokenAmountWei;
          const pricePerToken = Number(nativeAmountWei) / Number(tokenAmountWei);

          newPoints.push({
            timestamp: ts,
            side,
            tokensWei: tokenAmountWei,
            nativeWei: nativeAmountWei,
            pricePerToken,
            cumulativeTokensWei,
            txHash: log.transactionHash,
            trader,
          });
        }

        if (!cancelled) {
          setPoints(newPoints);
        }
      } catch (e: any) {
        console.error("Failed to load curve trades", e);
        if (!cancelled) {
          setError(e?.message || "Failed to load curve trades");
          setPoints([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // 2) Subscribe to live events
    // TODO: adjust event names & arg mapping
    const handleBuy = async (
      buyer: string,
      amountOut: bigint,
      cost: bigint
    ) => {
      try {
        const latestBlock = await provider.getBlock("latest");
        const ts = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
        const pricePerToken = Number(cost) / Number(amountOut || 1n);

        setPoints((prev) => {
          const cumulativeTokensWei =
            (prev[prev.length - 1]?.cumulativeTokensWei ?? 0n) +
            amountOut;

          return [
            ...prev,
            {
              timestamp: ts,
              side: "buy",
              tokensWei: amountOut,
              nativeWei: cost,
              pricePerToken,
              cumulativeTokensWei,
              txHash: "", // you can fill via log.transactionHash if you wire listener differently
              trader: buyer,
            },
          ];
        });
      } catch {
        // ignore live update failures
      }
    };

    const handleSell = async (
      seller: string,
      amountIn: bigint,
      payout: bigint
    ) => {
      try {
        const latestBlock = await provider.getBlock("latest");
        const ts = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
        const pricePerToken = Number(payout) / Number(amountIn || 1n);

        setPoints((prev) => {
          const cumulativeTokensWei =
            (prev[prev.length - 1]?.cumulativeTokensWei ?? 0n) +
            amountIn;

          return [
            ...prev,
            {
              timestamp: ts,
              side: "sell",
              tokensWei: amountIn,
              nativeWei: payout,
              pricePerToken,
              cumulativeTokensWei,
              txHash: "",
              trader: seller,
            },
          ];
        });
      } catch {
        // ignore live update failures
      }
    };

    // Wire up listeners (adjust names to your events)
    if (contract.on && contract.off) {
      // ts-expect-error – adjust to your exact event signature
      contract.on("TokensPurchased", handleBuy);
      // ts-expect-error – adjust to your exact event signature
      contract.on("TokensSold", handleSell);
    }

    return () => {
      cancelled = true;
      if (contract.off) {
        // ts-expect-error – same as above
        contract.off("TokensPurchased", handleBuy);
        // ts-expect-error – same as above
        contract.off("TokensSold", handleSell);
      }
    };
  }, [provider, campaignAddress]);

  return { points, loading, error };
}
