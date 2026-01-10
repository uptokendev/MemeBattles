import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract, ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import type { Transaction } from "@/types/token";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";

// Public RPCs (and MetaMask) often rate-limit eth_getLogs, especially when requests are batched.
// We:
//  - prefer a configured RPC for reads (VITE_BSC_TESTNET_RPC / VITE_BSC_MAINNET_RPC)
//  - disable ethers batching (batchMaxCount: 1)
//  - scan only a bounded lookback window
//  - chunk getLogs ranges to avoid provider max-range errors

const TARGET_CHAIN_ID = Number(import.meta.env.VITE_TARGET_CHAIN_ID ?? "97");
const RPC_TESTNET = import.meta.env.VITE_BSC_TESTNET_RPC ?? "";
const RPC_MAINNET = import.meta.env.VITE_BSC_MAINNET_RPC ?? "";

function getRpcUrlForChain(chainId?: number): string {
  const cid = chainId ?? TARGET_CHAIN_ID;
  if (cid === 56) return RPC_MAINNET;
  return RPC_TESTNET; // default testnet
}

// Smaller lookback on testnet reduces rate-limit pressure.
// You can raise this once you move to a paid RPC.
function getLookbackBlocks(chainId?: number): number {
  const cid = chainId ?? TARGET_CHAIN_ID;
  if (cid === 56) return 50_000; // mainnet
  return 12_000; // testnet (tighter to avoid throttling)
}

const LOG_CHUNK_SIZE = 500; // keep under common provider thresholds

async function getLogsChunked(
  provider: any,
  params: { address: string; topics?: (string | string[] | null)[] },
  fromBlock: number,
  toBlock: number
) {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(toBlock, start + LOG_CHUNK_SIZE - 1);
    const chunk = await provider.getLogs({ ...params, fromBlock: start, toBlock: end });
    logs.push(...chunk);
  }
  return logs;
}

const toAbi = (x: any) => (x?.abi ?? x) as ethers.InterfaceAbi;
const CAMPAIGN_ABI = toAbi(LaunchCampaignArtifact);

type CurveTrade = Transaction;

/**
 * Fetches curve trades (TokensPurchased / TokensSold) for a campaign and exposes
 * them as normalized Transaction[] for the TokenDetails UI.
 */
export function useCurveTrades(campaignAddress?: string) {
  const { provider, chainId } = useWallet() as any;

  const readProvider = useMemo(() => {
    const url = getRpcUrlForChain(chainId);
    if (url) {
      // Disable batching to avoid "method eth_getLogs in batch triggered rate limit"
      return new ethers.JsonRpcProvider(url, undefined, { batchMaxCount: 1, batchStallTime: 0 });
    }
    return provider ?? null;
  }, [provider, chainId]);

  const [points, setPoints] = useState<CurveTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent redundant refetches when latest block hasn't moved.
  const lastToBlockRef = useRef<number>(-1);
  const inFlightRef = useRef<boolean>(false);

  const fetchTrades = useCallback(async () => {
    if (!campaignAddress) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!readProvider) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const latest = await readProvider.getBlockNumber();

      // Skip if nothing changed.
      if (latest === lastToBlockRef.current) {
        setLoading(false);
        inFlightRef.current = false;
        return;
      }
      lastToBlockRef.current = latest;

      const lookback = getLookbackBlocks(chainId);
      const fromBlock = Math.max(0, latest - lookback);

      const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, readProvider) as any;
      const iface = new ethers.Interface(CAMPAIGN_ABI);

      // Event topics
      const buyTopic = iface.getEvent("TokensPurchased").topicHash;
      const sellTopic = iface.getEvent("TokensSold").topicHash;

      // Fetch logs chunked
      const [buyLogs, sellLogs] = await Promise.all([
        getLogsChunked(readProvider, { address: campaignAddress, topics: [buyTopic] }, fromBlock, latest),
        getLogsChunked(readProvider, { address: campaignAddress, topics: [sellTopic] }, fromBlock, latest),
      ]);

      const parsedBuys: CurveTrade[] = buyLogs
        .map((log) => {
          try {
            const parsed = iface.parseLog(log);
            const buyer = String(parsed.args.buyer).toLowerCase();
            const tokensWei = parsed.args.tokens as bigint;
            const nativeWei = parsed.args.cost as bigint;
            const pricePerToken = Number(ethers.formatEther(nativeWei)) / Math.max(1e-18, Number(ethers.formatUnits(tokensWei, 18)));

            return {
              type: "buy",
              from: buyer,
              to: campaignAddress.toLowerCase(),
              tokensWei,
              nativeWei,
              pricePerToken,
              timestamp: 0, // filled later
              txHash: String(log.transactionHash),
              blockNumber: Number(log.blockNumber),
            } as any;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as CurveTrade[];

      const parsedSells: CurveTrade[] = sellLogs
        .map((log) => {
          try {
            const parsed = iface.parseLog(log);
            const seller = String(parsed.args.seller).toLowerCase();
            const tokensWei = parsed.args.tokens as bigint;
            const nativeWei = parsed.args.payout as bigint;
            const pricePerToken = Number(ethers.formatEther(nativeWei)) / Math.max(1e-18, Number(ethers.formatUnits(tokensWei, 18)));

            return {
              type: "sell",
              from: seller,
              to: campaignAddress.toLowerCase(),
              tokensWei,
              nativeWei,
              pricePerToken,
              timestamp: 0, // filled later
              txHash: String(log.transactionHash),
              blockNumber: Number(log.blockNumber),
            } as any;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as CurveTrade[];

      const combined = [...parsedBuys, ...parsedSells].sort((a: any, b: any) => (a.blockNumber ?? 0) - (b.blockNumber ?? 0));

      // Fill timestamps with minimal RPC load:
      // - fetch timestamps for unique blocks only
      const uniqueBlocks = Array.from(new Set(combined.map((t: any) => t.blockNumber).filter((n) => Number.isFinite(n))));
      const blockTs = new Map<number, number>();

      for (const bn of uniqueBlocks) {
        try {
          const b = await readProvider.getBlock(bn);
          if (b?.timestamp) blockTs.set(bn, Number(b.timestamp));
        } catch {
          // ignore
        }
      }

      const finalPoints = combined.map((t: any) => ({
        ...t,
        timestamp: blockTs.get(t.blockNumber) ?? 0,
      }));

      setPoints(finalPoints);
      setLoading(false);
      setError(null);
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Failed to load curve trades";
      setError(String(msg));
      setLoading(false);
      // Keep previous points so UI doesn't thrash to empty every time a public RPC throttles.
    } finally {
      inFlightRef.current = false;
    }
  }, [campaignAddress, readProvider, chainId]);

  useEffect(() => {
    fetchTrades();

    // Poll slower to avoid hammering eth_getLogs on public RPCs.
    const t = setInterval(fetchTrades, 30_000);
    return () => clearInterval(t);
  }, [fetchTrades]);

  return { points, loading, error };
}
