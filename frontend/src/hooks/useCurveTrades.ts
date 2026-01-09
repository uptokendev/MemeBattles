import { useEffect, useMemo, useRef, useState } from "react";
import { Contract, ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import { USE_MOCK_DATA } from "@/config/mockConfig";
import { getReadProvider } from "@/lib/readProvider";
import { getActiveChainId, type SupportedChainId } from "@/lib/chainConfig";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;

export type CurveTradePoint = {
  timestamp: number; // seconds
  side: "buy" | "sell";
  trader: string;
  tokensWei: bigint;
  nativeWei: bigint; // cost/payout in BNB wei
  pricePerToken: number; // BNB per token
  txHash: string;
  blockNumber: number;
};

type Options = {
  enabled?: boolean;
  chainId?: number;
  lookbackBlocks?: number;
  pollIntervalMs?: number;
};

const isAddress = (a?: string | null) => /^0x[a-fA-F0-9]{40}$/.test(String(a ?? ""));

export function useCurveTrades(campaignAddress?: string, opts?: Options) {
  const enabled = opts?.enabled ?? true;
  const chainId = getActiveChainId(opts?.chainId ?? null) as SupportedChainId;
  const lookbackBlocks = Math.max(1_000, Number(opts?.lookbackBlocks ?? 25_000)); // conservative default
  const pollIntervalMs = Math.max(5_000, Number(opts?.pollIntervalMs ?? 15_000));

  const [points, setPoints] = useState<CurveTradePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addr = useMemo(() => (campaignAddress ?? "").trim(), [campaignAddress]);

  // Keep a tiny in-memory cache of block timestamps to reduce RPC calls.
  const tsCacheRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    if (USE_MOCK_DATA) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!isAddress(addr)) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const provider = getReadProvider(chainId);

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const latest = await provider.getBlockNumber();
        const fromBlock = Math.max(0, latest - lookbackBlocks);

        const c = new Contract(addr, CAMPAIGN_ABI, provider) as any;

        const buyTopic = c.filters.TokensPurchased().topicHash;
        const sellTopic = c.filters.TokensSold().topicHash;

        const fetchLogsChunked = async (topic: string) => {
          const out: any[] = [];
          const step = 2_000; // avoid provider limits
          for (let start = fromBlock; start <= latest; start += step) {
            const end = Math.min(latest, start + step - 1);
            const logs = await provider.getLogs({
              address: addr,
              fromBlock: start,
              toBlock: end,
              topics: [topic],
            });
            out.push(...logs);
          }
          return out;
        };

        const [buyLogs, sellLogs] = await Promise.all([
          fetchLogsChunked(buyTopic),
          fetchLogsChunked(sellTopic),
        ]);

        const all = [...buyLogs, ...sellLogs].sort((a, b) => (a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex));

        // Resolve timestamps with caching
        const uniqueBlocks = Array.from(new Set(all.map((l) => Number(l.blockNumber)))).filter((n) => Number.isFinite(n));
        const missing = uniqueBlocks.filter((bn) => !tsCacheRef.current.has(bn));
        for (const bn of missing) {
          const b = await provider.getBlock(bn);
          const ts = Number(b?.timestamp ?? 0);
          if (ts) tsCacheRef.current.set(bn, ts);
        }

        const next: CurveTradePoint[] = all.map((log) => {
          const parsed = c.interface.parseLog(log);
          const name = parsed?.name;
          const args = parsed?.args as any;

          const bn = Number(log.blockNumber);
          const ts = tsCacheRef.current.get(bn) ?? 0;

          if (name === "TokensPurchased") {
            const buyer = String(args?.buyer ?? "");
            const tokensWei = BigInt(args?.amountOut ?? 0n);
            const costWei = BigInt(args?.cost ?? 0n);
            const pricePerToken = tokensWei > 0n ? Number(ethers.formatEther(costWei)) / Number(ethers.formatUnits(tokensWei, 18)) : 0;

            return {
              timestamp: ts,
              side: "buy",
              trader: buyer,
              tokensWei,
              nativeWei: costWei,
              pricePerToken: Number.isFinite(pricePerToken) ? pricePerToken : 0,
              txHash: String(log.transactionHash),
              blockNumber: bn,
            };
          }

          // TokensSold
          const seller = String(args?.seller ?? "");
          const tokensWei = BigInt(args?.amountIn ?? 0n);
          const payoutWei = BigInt(args?.payout ?? 0n);
          const pricePerToken = tokensWei > 0n ? Number(ethers.formatEther(payoutWei)) / Number(ethers.formatUnits(tokensWei, 18)) : 0;

          return {
            timestamp: ts,
            side: "sell",
            trader: seller,
            tokensWei,
            nativeWei: payoutWei,
            pricePerToken: Number.isFinite(pricePerToken) ? pricePerToken : 0,
            txHash: String(log.transactionHash),
            blockNumber: bn,
          };
        });

        if (!cancelled) setPoints(next);
      } catch (e: any) {
        console.warn("[useCurveTrades] failed", e);
        if (!cancelled) setError(e?.message ?? "Failed to load curve trades");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const t = setInterval(load, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [addr, enabled, chainId, lookbackBlocks, pollIntervalMs]);

  return { points, loading, error };
}
