import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import { getActiveChainId, isEvmChainId, type SupportedChainId } from "@/lib/chainConfig";
import { getReadProvider } from "@/lib/readProvider";
import { useAblyTokenChannel } from "@/hooks/useAblyTokenChannel";

// Realtime-indexer HTTP base (Railway). Example: https://memebattles-production-dca0.up.railway.app
const API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");
const ENABLE_TOKEN_POLLING = String(import.meta.env.VITE_ENABLE_TOKEN_POLLING || "").trim() === "1";
// Browser eth_getLogs is intentionally opt-in. Historical recovery belongs in
// the server-side indexer, where ranges can be split, retried and persisted.
const ENABLE_ONCHAIN_TRADE_FALLBACK =
  String(import.meta.env.VITE_ENABLE_ONCHAIN_TRADE_FALLBACK || "").trim() === "1" &&
  String(import.meta.env.VITE_DISABLE_ONCHAIN_TRADE_FALLBACK || "").trim() !== "1";
const ONCHAIN_FALLBACK_LOOKBACK_BLOCKS = 5_000;
const ONCHAIN_FALLBACK_CHUNK_SIZE = 250;

type RealtimeChannel = any;

export type CurveTradePoint = {
  type: "buy" | "sell";
  from: string;
  to: string;
  tokensWei: bigint;
  nativeWei: bigint;
  pricePerToken: number; // BNB per token
  timestamp: number; // unix seconds
  txHash: string;
  blockNumber: number;
  logIndex: number;
};

type UseCurveTradesOptions = {
  enabled?: boolean;
  chainId?: number;
  limit?: number;
  /** Safety net: periodically re-fetch snapshot to reconcile any missed messages. Disabled by default. */
  reconcileMs?: number;
};

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;

function isTradeCampaignAddress(campaignAddress: string | undefined, chainId: number) {
  const raw = String(campaignAddress || "").trim();
  return isEvmChainId(chainId) && ethers.isAddress(raw);
}

function isAbortError(error: unknown): boolean {
  const candidate = error as any;
  return candidate?.name === "AbortError" || String(candidate?.message || candidate || "").toLowerCase().includes("aborted");
}

function keyOf(t: Pick<CurveTradePoint, "txHash" | "logIndex">) {
  return `${t.txHash.toLowerCase()}:${Number(t.logIndex ?? 0)}`;
}

function sortAsc(a: CurveTradePoint, b: CurveTradePoint) {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
  return Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
}

function mergeTrades(prev: CurveTradePoint[], next: CurveTradePoint[]) {
  const map = new Map<string, CurveTradePoint>();
  for (const t of prev) map.set(keyOf(t), t);
  for (const t of next) map.set(keyOf(t), t);
  return Array.from(map.values()).sort(sortAsc);
}

function toBigIntWei(amount: unknown, kind: "ether" | "token"): bigint {
  if (typeof amount === "bigint") return amount;
  const s = typeof amount === "string" ? amount : typeof amount === "number" ? String(amount) : "0";
  const trimmed = s.trim();
  if (/^\d+$/.test(trimmed) && trimmed.length > (kind === "ether" ? 12 : 18)) {
    try {
      return BigInt(trimmed);
    } catch {
      return 0n;
    }
  }
  try {
    if (kind === "ether") return ethers.parseEther(trimmed);
    return ethers.parseUnits(trimmed, 18);
  } catch {
    return 0n;
  }
}

function toNumber(amount: unknown): number {
  if (typeof amount === "number") return amount;
  if (typeof amount === "string") {
    const n = Number(amount);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toTimestampSec(v: unknown): number {
  try {
    if (v instanceof Date) return Math.floor(v.getTime() / 1000);
    if (typeof v === "number") return Math.floor(v > 1e12 ? v / 1000 : v);
    if (typeof v === "string") {
      const s = v.trim();
      if (/^\d+(?:\.\d+)?$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? Math.floor(n > 1e12 ? n / 1000 : n) : 0;
      }
      const ms = new Date(s).getTime();
      return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
    }
    const ms = new Date(String(v)).getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  } catch {
    return 0;
  }
}

function numberFromWei(wei: bigint, decimals = 18): number {
  try {
    const n = Number(ethers.formatUnits(wei, decimals));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function fetchJson(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { method: "GET", signal });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.json();
}

async function getLogsAdaptive(
  provider: ethers.Provider,
  params: { address: string; topics?: (string | string[] | null)[] },
  fromBlock: number,
  toBlock: number,
  signal?: AbortSignal,
  depth = 0,
): Promise<ethers.Log[]> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  try {
    return await provider.getLogs({ ...params, fromBlock, toBlock } as any);
  } catch (error) {
    const span = toBlock - fromBlock + 1;
    if (span <= 25 || depth >= 8) throw error;
    const middle = Math.floor((fromBlock + toBlock) / 2);
    const left = await getLogsAdaptive(provider, params, fromBlock, middle, signal, depth + 1);
    const right = await getLogsAdaptive(provider, params, middle + 1, toBlock, signal, depth + 1);
    return left.concat(right);
  }
}

async function getLogsChunked(
  provider: ethers.Provider,
  params: { address: string; topics?: (string | string[] | null)[] },
  fromBlock: number,
  toBlock: number,
  signal?: AbortSignal,
) {
  const logs: ethers.Log[] = [];

  for (let start = fromBlock; start <= toBlock; start += ONCHAIN_FALLBACK_CHUNK_SIZE) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const end = Math.min(toBlock, start + ONCHAIN_FALLBACK_CHUNK_SIZE - 1);
    const chunk = await getLogsAdaptive(provider, params, start, end, signal);
    logs.push(...chunk);
  }

  return logs;
}

async function fetchOnChainTradeSnapshot(
  campaignAddress: string,
  chainId: SupportedChainId,
  limit: number,
  signal?: AbortSignal,
): Promise<CurveTradePoint[]> {
  if (!ethers.isAddress(campaignAddress)) return [];
  const provider = getReadProvider(chainId) as ethers.Provider;
  const iface = new ethers.Interface(CAMPAIGN_ABI);
  const buyEvent = iface.getEvent("TokensPurchased");
  const sellEvent = iface.getEvent("TokensSold");
  const buyTopic = buyEvent?.topicHash;
  const sellTopic = sellEvent?.topicHash;
  if (!buyTopic || !sellTopic) return [];

  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - ONCHAIN_FALLBACK_LOOKBACK_BLOCKS);
  const address = campaignAddress.toLowerCase();

  const [buyLogs, sellLogs] = await Promise.all([
    getLogsChunked(provider, { address, topics: [buyTopic] }, fromBlock, latest, signal),
    getLogsChunked(provider, { address, topics: [sellTopic] }, fromBlock, latest, signal),
  ]);

  const blockTimeCache = new Map<number, number>();
  const timestampForBlock = async (blockNumber: number) => {
    if (blockTimeCache.has(blockNumber)) return blockTimeCache.get(blockNumber) || 0;
    try {
      const block = await provider.getBlock(blockNumber);
      const ts = Number(block?.timestamp ?? 0);
      blockTimeCache.set(blockNumber, ts);
      return ts;
    } catch {
      blockTimeCache.set(blockNumber, 0);
      return 0;
    }
  };

  const allLogs = [...buyLogs, ...sellLogs]
    .sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      return Number(a.index ?? 0) - Number(b.index ?? 0);
    })
    .slice(-limit);

  const out: CurveTradePoint[] = [];

  for (const log of allLogs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;

      const isSell = parsed.name === "TokensSold";
      const tokensWei = BigInt(String(isSell ? parsed.args.amountIn : parsed.args.amountOut));
      const nativeWei = BigInt(String(isSell ? parsed.args.payout : parsed.args.cost));
      const tokens = numberFromWei(tokensWei, 18);
      const bnb = numberFromWei(nativeWei, 18);
      const pricePerToken = tokens > 0 ? bnb / tokens : 0;
      const timestamp = await timestampForBlock(log.blockNumber);

      out.push({
        type: isSell ? "sell" : "buy",
        from: String(isSell ? parsed.args.seller : parsed.args.buyer).toLowerCase(),
        to: address,
        tokensWei,
        nativeWei,
        pricePerToken,
        timestamp,
        txHash: String(log.transactionHash || "").toLowerCase(),
        blockNumber: Number(log.blockNumber ?? 0),
        logIndex: Number(log.index ?? 0),
      });
    } catch {
      // Ignore malformed legacy logs; a partial chart is better than a blank chart.
    }
  }

  return out.filter((t) => /^0x[a-f0-9]{64}$/i.test(t.txHash) && t.blockNumber > 0 && t.timestamp > 0);
}

/**
 * Curve trades backed by:
 *  1) Snapshot: Railway realtime-indexer REST endpoint
 *  2) Explicit dev-only fallback: recent on-chain campaign logs
 *  3) Realtime: Ably channel updates
 *  4) Optional safety reconcile when VITE_ENABLE_TOKEN_POLLING=1
 */
export function useCurveTrades(campaignAddress?: string, opts?: UseCurveTradesOptions) {
  const enabled = opts?.enabled ?? true;
  const [points, setPoints] = useState<CurveTradePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevCampaignRef = useRef<string>("");

  const chainId = useMemo<SupportedChainId>(() => {
    const cid = Number(opts?.chainId ?? 97);
    return getActiveChainId(cid);
  }, [opts?.chainId]);

  const inFlightRef = useRef(false);
  const initialLoadedRef = useRef(false);
  const reconcileMs = opts?.reconcileMs ?? 60_000;
  const limit = Math.min(Math.max(Number(opts?.limit ?? 200), 1), 200);
  const canLoadTrades = enabled && isTradeCampaignAddress(campaignAddress, chainId);

  const apiTradesUrl = useMemo(() => {
    if (!API_BASE || !campaignAddress || !canLoadTrades) return "";
    return `${API_BASE}/api/token/${campaignAddress.toLowerCase()}/trades?chainId=${chainId}&limit=${limit}`;
  }, [campaignAddress, canLoadTrades, chainId, limit]);

  const applySnapshot = useCallback((rows: any[]) => {
    const next: CurveTradePoint[] = (rows || [])
      .map((r: any) => {
        const side = String(r.side || r.type || "").toLowerCase() === "sell" ? "sell" : "buy";
        const txHash = String(r.tx_hash || r.txHash || "");
        const logIndex = Number(r.log_index ?? r.logIndex ?? 0);
        const blockNumber = Number(r.block_number ?? r.blockNumber ?? 0);
        const ts = toTimestampSec(r.block_time ?? r.timestamp ?? r.time);
        const tokensWei = toBigIntWei(r.token_amount ?? r.tokens ?? r.tokensWei, "token");
        const nativeWei = toBigIntWei(r.bnb_amount ?? r.native ?? r.nativeWei, "ether");
        const tokens = Number(ethers.formatUnits(tokensWei, 18));
        const bnb = Number(ethers.formatEther(nativeWei));
        const pricePerToken = toNumber(r.price_bnb ?? r.pricePerToken) || (tokens > 0 ? bnb / tokens : 0);

        return {
          type: side,
          from: String(r.wallet || r.trader || r.from || "").toLowerCase(),
          to: String(campaignAddress || "").toLowerCase(),
          tokensWei,
          nativeWei,
          pricePerToken,
          timestamp: ts,
          txHash,
          blockNumber,
          logIndex,
        } satisfies CurveTradePoint;
      })
      .filter((t) => /^0x[a-f0-9]{64}$/i.test(t.txHash) && Number.isFinite(t.blockNumber));

    setPoints((prev) => mergeTrades(prev, next));
    return next.length;
  }, [campaignAddress]);

  const pullSnapshot = useCallback(async (signal?: AbortSignal, forceOnChainReconcile = false) => {
    if (!canLoadTrades || !campaignAddress) {
      setPoints([]);
      setLoading(false);
      setError(null);
      initialLoadedRef.current = true;
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (!initialLoadedRef.current) setLoading(true);

      if (!apiTradesUrl) {
        if (ENABLE_ONCHAIN_TRADE_FALLBACK) {
          const fallbackRows = await fetchOnChainTradeSnapshot(campaignAddress, chainId, limit, signal);
          applySnapshot(fallbackRows);
          setError(null);
        } else {
          setError("Trade indexer API is not configured.");
        }
        initialLoadedRef.current = true;
        return;
      }

      try {
        const rows = await fetchJson(apiTradesUrl, signal);
        const apiRows = Array.isArray(rows) ? rows : [];
        applySnapshot(apiRows);
        // Empty indexer history is common for older/multi-factory campaigns — fill from chain.
        if (apiRows.length === 0 || forceOnChainReconcile || ENABLE_ONCHAIN_TRADE_FALLBACK) {
          try {
            const fallbackRows = await fetchOnChainTradeSnapshot(campaignAddress, chainId, limit, signal);
            if (fallbackRows.length) applySnapshot(fallbackRows);
          } catch (fallbackError) {
            if (!isAbortError(fallbackError) && apiRows.length === 0) {
              console.warn("[useCurveTrades] on-chain trade fallback failed", fallbackError);
            }
          }
        }
        setError(null);
        initialLoadedRef.current = true;
      } catch (apiError: any) {
        if (isAbortError(apiError)) return;
        // Always try a bounded on-chain recovery when the API fails.
        console.warn("[useCurveTrades] trade API failed; trying on-chain recovery", apiError);
        try {
          const fallbackRows = await fetchOnChainTradeSnapshot(campaignAddress, chainId, limit, signal);
          applySnapshot(fallbackRows);
          setError(null);
        } catch (fallbackError) {
          if (!isAbortError(fallbackError)) {
            console.warn("[useCurveTrades] on-chain trade fallback failed", fallbackError);
            setError("Trade history is temporarily unavailable.");
          }
        }
        initialLoadedRef.current = true;
      }
    } catch (error: any) {
      if (!isAbortError(error)) {
        console.warn("[useCurveTrades] trade snapshot failed", error);
        setError("Trade history is temporarily unavailable.");
        initialLoadedRef.current = true;
      }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [canLoadTrades, campaignAddress, apiTradesUrl, applySnapshot, chainId, limit]);

  useEffect(() => {
    const ac = new AbortController();
    const curr = canLoadTrades ? (campaignAddress || "").toLowerCase() : "";
    const prev = prevCampaignRef.current;
    if (curr !== prev) {
      prevCampaignRef.current = curr;
      setPoints([]);
      setLoading(canLoadTrades);
      setError(null);
      initialLoadedRef.current = false;
    }

    void pullSnapshot(ac.signal);

    if (!canLoadTrades || !ENABLE_TOKEN_POLLING) return () => ac.abort();

    const timer = setInterval(() => {
      void pullSnapshot(ac.signal);
    }, reconcileMs);

    return () => {
      clearInterval(timer);
      ac.abort();
    };
  }, [canLoadTrades, campaignAddress, pullSnapshot, reconcileMs]);

  useEffect(() => {
    if (!canLoadTrades || !campaignAddress) return;
    const current = campaignAddress.toLowerCase();
    const onConfirmed = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const kind = String(detail?.kind || "").toLowerCase();
      const confirmedCampaign = String(detail?.campaignAddress || "").toLowerCase();
      if ((kind !== "buy" && kind !== "sell") || confirmedCampaign !== current) return;
      if (Array.isArray(detail?.trades) && detail.trades.length) {
        applySnapshot(detail.trades);
      }
      // Reconcile through the persisted API. Browser log scans are a deliberate
      // dev-only escape hatch and should not run after every confirmed trade.
      void pullSnapshot();
    };

    window.addEventListener("memebattles:txConfirmed", onConfirmed as EventListener);
    return () => window.removeEventListener("memebattles:txConfirmed", onConfirmed as EventListener);
  }, [canLoadTrades, campaignAddress, applySnapshot, pullSnapshot]);

  const ably = useAblyTokenChannel({ enabled: canLoadTrades, chainId, campaignAddress });
  useEffect(() => {
    if (!canLoadTrades) return;
    if (ably.missingBase || !ably.channel) return;

    const onTrade = (msg: any) => {
      const data = msg?.data;
      if (Array.isArray(data)) return applySnapshot(data);
      if (data && typeof data === "object") return applySnapshot([data]);
    };

    try {
      ably.channel.subscribe("trade", onTrade);
    } catch {
      // HTTP snapshot remains the source of truth when realtime is unavailable.
    }

    return () => {
      try {
        ably.channel.unsubscribe("trade", onTrade);
      } catch {
        // ignore
      }
    };
  }, [canLoadTrades, ably.channel, ably.missingBase, applySnapshot]);

  return { points, loading, error };
}
