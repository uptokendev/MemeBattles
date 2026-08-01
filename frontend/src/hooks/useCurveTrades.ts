import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import { apiFetch } from "@/lib/apiBase";
import { getActiveChainId, isEvmChainId, type SupportedChainId } from "@/lib/chainConfig";
import { useAblyTokenChannel } from "@/hooks/useAblyTokenChannel";
import { getBlockTimestamps, scanContractLogs } from "@/lib/rpcLogScan";
import { loadCachedTradeHistory, saveCachedTradeHistory } from "@/lib/tradeHistoryCache";

// Prefer the same token/realtime base resolution as apiBase (TOKEN_API_BASE first).
// Default matches the live devpostgrad indexer service.
function resolveRealtimeApiBase(): string {
  const candidates = [
    import.meta.env.VITE_TOKEN_API_BASE,
    import.meta.env.VITE_RAILWAY_TOKEN_API_BASE,
    import.meta.env.RAILWAY_TOKEN_API_BASE_URL,
    import.meta.env.VITE_REALTIME_API_BASE,
  ];
  for (const value of candidates) {
    const raw = String(value || "").trim().replace(/\/+$/, "");
    if (!raw) continue;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) return `https:${raw}`;
    return `https://${raw}`;
  }
  return "https://memebattles-production-dca0.up.railway.app";
}

const API_BASE = resolveRealtimeApiBase();
const ENABLE_TOKEN_POLLING = String(import.meta.env.VITE_ENABLE_TOKEN_POLLING || "").trim() === "1";
// Browser eth_getLogs is optional recovery only — primary history comes from the Railway indexer.
const ENABLE_ONCHAIN_TRADE_FALLBACK =
  String(import.meta.env.VITE_ENABLE_ONCHAIN_TRADE_FALLBACK || "").trim() === "1" &&
  String(import.meta.env.VITE_DISABLE_ONCHAIN_TRADE_FALLBACK || "").trim() !== "1";

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

async function fetchIndexerTrades(campaignAddress: string, chainId: number, limit: number, signal?: AbortSignal) {
  // Prefer relative /api/token/* through apiFetch so Netlify/proxy routing hits the
  // Railway indexer (memebattles-production-dca0) instead of inventing browser RPCs.
  const path = `/api/token/${String(campaignAddress).toLowerCase()}/trades?chainId=${chainId}&limit=${limit}`;
  try {
    const r = await apiFetch(path, { method: "GET", signal, cache: "no-store" as RequestCache });
    if (r.ok) {
      const body = await r.json();
      if (Array.isArray(body)) return body;
      if (Array.isArray(body?.items)) return body.items;
    }
  } catch {
    // fall through to absolute indexer URL
  }

  if (!API_BASE) return [];
  const absolute = `${API_BASE}/api/token/${String(campaignAddress).toLowerCase()}/trades?chainId=${chainId}&limit=${limit}`;
  const r = await fetch(absolute, { method: "GET", signal, cache: "no-store" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `HTTP ${r.status}`);
  }
  const body = await r.json();
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

async function fetchOnChainTradeSnapshot(
  campaignAddress: string,
  chainId: SupportedChainId,
  limit: number,
  signal?: AbortSignal,
): Promise<CurveTradePoint[]> {
  if (!ethers.isAddress(campaignAddress)) return [];
  const iface = new ethers.Interface(CAMPAIGN_ABI);
  const buyEvent = iface.getEvent("TokensPurchased");
  const sellEvent = iface.getEvent("TokensSold");
  const buyTopic = buyEvent?.topicHash;
  const sellTopic = sellEvent?.topicHash;
  if (!buyTopic || !sellTopic) return [];

  const address = campaignAddress.toLowerCase();
  // Multi-RPC sequential scans for bonding history (older graduated tokens often need this).
  const buyLogs = await scanContractLogs({
    chainId,
    address,
    topics: [buyTopic],
    lookbackBlocks: 4_000,
    chunkSize: 100,
    signal,
  });
  const sellLogs = await scanContractLogs({
    chainId,
    address,
    topics: [sellTopic],
    lookbackBlocks: 4_000,
    chunkSize: 100,
    signal,
  });

  const allLogs = [...buyLogs, ...sellLogs]
    .sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      return Number(a.index ?? 0) - Number(b.index ?? 0);
    })
    .slice(-limit);

  const timestamps = await getBlockTimestamps(
    chainId,
    allLogs.map((log) => Number(log.blockNumber || 0)),
    signal,
  );

  const out: CurveTradePoint[] = [];
  for (const log of allLogs) {
    if (signal?.aborted) break;
    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      const isSell = parsed.name === "TokensSold";
      const tokensWei = BigInt(String(isSell ? parsed.args.amountIn : parsed.args.amountOut));
      const nativeWei = BigInt(String(isSell ? parsed.args.payout : parsed.args.cost));
      const tokens = numberFromWei(tokensWei, 18);
      const bnb = numberFromWei(nativeWei, 18);
      const pricePerToken = tokens > 0 ? bnb / tokens : 0;
      const blockNumber = Number(log.blockNumber ?? 0);
      const timestamp = timestamps.get(blockNumber) || 0;
      if (!timestamp) continue;

      out.push({
        type: isSell ? "sell" : "buy",
        from: String(isSell ? parsed.args.seller : parsed.args.buyer).toLowerCase(),
        to: address,
        tokensWei,
        nativeWei,
        pricePerToken,
        timestamp,
        txHash: String(log.transactionHash || "").toLowerCase(),
        blockNumber,
        logIndex: Number(log.index ?? 0),
      });
    } catch {
      // ignore malformed logs
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

  const applySnapshot = useCallback((rows: any[], options?: { replaceEmpty?: boolean }) => {
    const next: CurveTradePoint[] = (rows || [])
      .map((r: any) => {
        // Already-normalized CurveTradePoint (on-chain path).
        if ((typeof r?.tokensWei === "bigint" || typeof r?.tokensWei === "string") && r?.txHash && r?.type) {
          try {
            return {
              type: String(r.type || "").toLowerCase() === "sell" ? "sell" : "buy",
              from: String(r.from || "").toLowerCase(),
              to: String(r.to || campaignAddress || "").toLowerCase(),
              tokensWei: typeof r.tokensWei === "bigint" ? r.tokensWei : BigInt(String(r.tokensWei || "0")),
              nativeWei: typeof r.nativeWei === "bigint" ? r.nativeWei : BigInt(String(r.nativeWei || "0")),
              pricePerToken: Number(r.pricePerToken || 0),
              timestamp: Number(r.timestamp || 0),
              txHash: String(r.txHash || "").toLowerCase(),
              blockNumber: Number(r.blockNumber || 0),
              logIndex: Number(r.logIndex || 0),
            } satisfies CurveTradePoint;
          } catch {
            return null;
          }
        }

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
      .filter((t): t is CurveTradePoint => Boolean(t) && /^0x[a-f0-9]{64}$/i.test(String(t?.txHash || "")) && Number.isFinite(Number(t?.blockNumber)));

    // Never wipe existing history with an empty fetch (RPC flakes / rate limits).
    if (!next.length && !options?.replaceEmpty) {
      return 0;
    }

    setPoints((prev) => {
      const merged = next.length ? mergeTrades(prev, next) : prev;
      if (campaignAddress && merged.length) {
        saveCachedTradeHistory(chainId, campaignAddress, merged);
      }
      return merged;
    });
    return next.length;
  }, [campaignAddress, chainId]);

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

      // 1) Primary: Railway realtime-indexer (memebattles-production-dca0).
      let apiRows: any[] = [];
      try {
        apiRows = await fetchIndexerTrades(campaignAddress, chainId, limit, signal);
        if (apiRows.length) applySnapshot(apiRows);
      } catch (apiError: any) {
        if (isAbortError(apiError)) return;
        console.warn("[useCurveTrades] indexer trade API failed", apiError);
      }

      // 2) Optional browser getLogs recovery — only when explicitly enabled.
      // Default OFF: trade history must come from Railway indexer (production-dca0),
      // not from inventing third-party RPCs in the browser.
      if ((ENABLE_ONCHAIN_TRADE_FALLBACK || forceOnChainReconcile) && !signal?.aborted) {
        try {
          const fallbackRows = await fetchOnChainTradeSnapshot(campaignAddress, chainId, limit, signal);
          if (fallbackRows.length) applySnapshot(fallbackRows);
        } catch (error) {
          if (!isAbortError(error)) {
            console.warn("[useCurveTrades] on-chain trade recovery skipped/failed", error);
          }
        }
      }

      setError(null);
      initialLoadedRef.current = true;
    } catch (error: any) {
      if (!isAbortError(error)) {
        console.warn("[useCurveTrades] trade snapshot failed", error);
        setError(null);
        initialLoadedRef.current = true;
      }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [canLoadTrades, campaignAddress, applySnapshot, chainId, limit]);

  useEffect(() => {
    const ac = new AbortController();
    const curr = canLoadTrades ? (campaignAddress || "").toLowerCase() : "";
    const prev = prevCampaignRef.current;
    if (curr !== prev) {
      prevCampaignRef.current = curr;
      // Seed from session cache immediately so reload is not blank while network runs.
      const cached = curr ? loadCachedTradeHistory(chainId, curr) : [];
      setPoints(cached);
      setLoading(canLoadTrades && cached.length === 0);
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
  }, [canLoadTrades, campaignAddress, chainId, pullSnapshot, reconcileMs]);

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
