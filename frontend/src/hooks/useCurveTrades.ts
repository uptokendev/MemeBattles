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

        // 1) Query past events
        // TODO: adjust event names and args to your ABI
        const buyFilter = contract.filters.TokensPurchased?.();
        const sellFilter = contract.filters.TokensSold?.();

        const [buyLogs, sellLogs] = await Promise.all([
          buyFilter ? contract.queryFilter(buyFilter, 0) : [],
          sellFilter ? contract.queryFilter(sellFilter, 0) : [],
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

        for (const { side, log } of allLogs) {
          // Get block timestamp
          const block = await provider.getBlock(log.blockNumber);
          const ts = block?.timestamp ?? Math.floor(Date.now() / 1000);

          // IMPORTANT: adjust arg names/indices:
          // Example assumes event TokensPurchased(address buyer, uint256 tokenAmount, uint256 bnbAmount);
          // and TokensSold(address seller, uint256 tokenAmount, uint256 bnbAmount);
          const tokenAmountWei: bigint = log.args?.tokenAmount ?? 0n;
          const nativeAmountWei: bigint = log.args?.bnbAmount ?? 0n;
          const trader: string | undefined =
            log.args?.buyer ??
            log.args?.seller ??
            log.args?.trader ??
            log.args?.[0];

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
      // buyer: string,
      tokenAmount: bigint,
      nativeAmount: bigint,
      // ...rest
    ) => {
      try {
        const latestBlock = await provider.getBlock("latest");
        const ts = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
        const pricePerToken =
          Number(nativeAmount) / Number(tokenAmount || 1n);

        setPoints((prev) => {
          const cumulativeTokensWei =
            (prev[prev.length - 1]?.cumulativeTokensWei ?? 0n) +
            tokenAmount;

          return [
            ...prev,
            {
              timestamp: ts,
              side: "buy",
              tokensWei: tokenAmount,
              nativeWei: nativeAmount,
              pricePerToken,
              cumulativeTokensWei,
              txHash: "", // you can fill via log.transactionHash if you wire listener differently
            },
          ];
        });
      } catch {
        // ignore live update failures
      }
    };

    const handleSell = async (
      // seller: string,
      tokenAmount: bigint,
      nativeAmount: bigint,
      // ...rest
    ) => {
      try {
        const latestBlock = await provider.getBlock("latest");
        const ts = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
        const pricePerToken =
          Number(nativeAmount) / Number(tokenAmount || 1n);

        setPoints((prev) => {
          const cumulativeTokensWei =
            (prev[prev.length - 1]?.cumulativeTokensWei ?? 0n) +
            tokenAmount;

          return [
            ...prev,
            {
              timestamp: ts,
              side: "sell",
              tokensWei: tokenAmount,
              nativeWei: nativeAmount,
              pricePerToken,
              cumulativeTokensWei,
              txHash: "",
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
