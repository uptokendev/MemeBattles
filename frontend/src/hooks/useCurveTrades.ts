import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import { apiFetch } from "@/lib/apiBase";
import {
  getActiveChainId,
  isEvmChainId,
  isSolanaChainId,
  type SupportedChainId,
} from "@/lib/chainConfig";
import { useAblyTokenChannel } from "@/hooks/useAblyTokenChannel";
import { getBlockTimestamps, scanContractLogs } from "@/lib/rpcLogScan";
import { loadCachedTradeHistory, saveCachedTradeHistory } from "@/lib/tradeHistoryCache";
import {
  isValidTradeTxHash,
  mergeTradePoints,
  normalizeTradeTxHash,
} from "@/lib/tradeDedupe";

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
const ENABLE_TRADE_POLL = String(import.meta.env.VITE_DISABLE_TRADE_POLL || "").trim() !== "1";
const ENABLE_ONCHAIN_TRADE_FALLBACK =
  String(import.meta.env.VITE_ENABLE_ONCHAIN_TRADE_FALLBACK || "").trim() === "1" &&
  String(import.meta.env.VITE_DISABLE_ONCHAIN_TRADE_FALLBACK || "").trim() !== "1";
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type RealtimeChannel = any;

export type CurveTradePoint = {
  type: "buy" | "sell";
  from: string;
  to: string;
  tokensWei: bigint; // raw token units (name retained for existing callers)
  nativeWei: bigint; // wei on BNB, lamports on Solana
  pricePerToken: number; // native coin per whole token
  timestamp: number;
  txHash: string;
  blockNumber: number; // EVM block / Solana slot
  logIndex: number; // EVM log index / Anchor event index
};

type UseCurveTradesOptions = {
  enabled?: boolean;
  chainId?: number;
  limit?: number;
  reconcileMs?: number;
};

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;

function normalizeAddress(chainId: number, value: unknown) {
  const raw = String(value || "").trim();
  return isSolanaChainId(chainId) ? raw : raw.toLowerCase();
}

function isTradeCampaignAddress(campaignAddress: string | undefined, chainId: number) {
  const raw = normalizeAddress(chainId, campaignAddress || "");
  if (isSolanaChainId(chainId)) return SOLANA_ADDRESS_RE.test(raw);
  return isEvmChainId(chainId) && ethers.isAddress(raw);
}

function isAbortError(error: unknown): boolean {
  const candidate = error as any;
  return candidate?.name === "AbortError" || String(candidate?.message || candidate || "").toLowerCase().includes("aborted");
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

function parseAmount(rawValue: unknown, decimalValue: unknown, decimals: number): bigint {
  const raw = String(rawValue ?? "").trim();
  if (/^\d+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      // fall through
    }
  }
  try {
    return ethers.parseUnits(String(decimalValue ?? "0"), decimals);
  } catch {
    return 0n;
  }
}

function numberFromRaw(raw: bigint, decimals: number): number {
  try {
    const n = Number(ethers.formatUnits(raw, decimals));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function fetchIndexerTrades(campaignAddress: string, chainId: number, limit: number, signal?: AbortSignal) {
  const campaign = normalizeAddress(chainId, campaignAddress);
  const path = `/api/token/${encodeURIComponent(campaign)}/trades?chainId=${chainId}&limit=${limit}`;
  const timeout = new AbortController();
  const onParentAbort = () => timeout.abort();
  signal?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => timeout.abort(), isSolanaChainId(chainId) ? 7_000 : 5_000);
  try {
    try {
      const r = await apiFetch(path, { method: "GET", signal: timeout.signal, cache: "no-store" as RequestCache });
      if (r.ok) {
        const body = await r.json();
        if (Array.isArray(body)) return body;
        if (Array.isArray(body?.items)) return body.items;
      }
    } catch {
      // fall through to absolute indexer URL
    }

    if (!API_BASE) return [];
    const absolute = `${API_BASE}/api/token/${encodeURIComponent(campaign)}/trades?chainId=${chainId}&limit=${limit}`;
    const r = await fetch(absolute, { method: "GET", signal: timeout.signal, cache: "no-store" });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(text || `HTTP ${r.status}`);
    }
    const body = await r.json();
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.items)) return body.items;
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onParentAbort);
  }
}

async function fetchOnChainTradeSnapshot(
  campaignAddress: string,
  chainId: SupportedChainId,
  limit: number,
  signal?: AbortSignal,
): Promise<CurveTradePoint[]> {
  // Solana history comes from the dedicated program indexer; never send base58
  // addresses through EVM getLogs recovery.
  if (!isEvmChainId(chainId) || !ethers.isAddress(campaignAddress)) return [];

  const iface = new ethers.Interface(CAMPAIGN_ABI);
  const buyEvent = iface.getEvent("TokensPurchased");
  const sellEvent = iface.getEvent("TokensSold");
  const buyTopic = buyEvent?.topicHash;
  const sellTopic = sellEvent?.topicHash;
  if (!buyTopic || !sellTopic) return [];

  const address = campaignAddress.toLowerCase();
  const lookbackBlocks = 40_000;
  const buyLogs = await scanContractLogs({ chainId, address, topics: [buyTopic], lookbackBlocks, chunkSize: 2_000, signal });
  const sellLogs = await scanContractLogs({ chainId, address, topics: [sellTopic], lookbackBlocks, chunkSize: 2_000, signal });
  const allLogs = [...buyLogs, ...sellLogs]
    .sort((a, b) => a.blockNumber - b.blockNumber || Number(a.index ?? 0) - Number(b.index ?? 0))
    .slice(-limit);

  const timestamps = await getBlockTimestamps(chainId, allLogs.map((log) => Number(log.blockNumber || 0)), signal);
  const out: CurveTradePoint[] = [];
  for (const log of allLogs) {
    if (signal?.aborted) break;
    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      const isSell = parsed.name === "TokensSold";
      const tokensWei = BigInt(String(isSell ? parsed.args.amountIn : parsed.args.amountOut));
      const nativeWei = BigInt(String(isSell ? parsed.args.payout : parsed.args.cost));
      const tokens = numberFromRaw(tokensWei, 18);
      const native = numberFromRaw(nativeWei, 18);
      const blockNumber = Number(log.blockNumber ?? 0);
      const timestamp = timestamps.get(blockNumber) || 0;
      if (!timestamp) continue;
      out.push({
        type: isSell ? "sell" : "buy",
        from: String(isSell ? parsed.args.seller : parsed.args.buyer).toLowerCase(),
        to: address,
        tokensWei,
        nativeWei,
        pricePerToken: tokens > 0 ? native / tokens : 0,
        timestamp,
        txHash: normalizeTradeTxHash(log.transactionHash),
        blockNumber,
        logIndex: Number(log.index ?? 0),
      });
    } catch {
      // ignore malformed logs
    }
  }
  return out.filter((t) => isValidTradeTxHash(t.txHash) && t.blockNumber > 0 && t.timestamp > 0);
}

/**
 * Curve trades backed by:
 *  1) Railway realtime-indexer REST snapshot (BNB + Solana)
 *  2) EVM-only getLogs fallback
 *  3) Ably token channel
 *  4) Light HTTP polling for convergence
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
  const reconcileMs = opts?.reconcileMs ?? 5_000;
  const limit = Math.min(Math.max(Number(opts?.limit ?? 200), 1), 200);
  const canLoadTrades = enabled && isTradeCampaignAddress(campaignAddress, chainId);

  const applySnapshot = useCallback((rows: any[], options?: { replaceEmpty?: boolean }) => {
    const tokenDecimals = isSolanaChainId(chainId) ? 6 : 18;
    const nativeDecimals = isSolanaChainId(chainId) ? 9 : 18;
    const target = normalizeAddress(chainId, campaignAddress || "");

    const next: CurveTradePoint[] = (rows || [])
      .map((r: any) => {
        try {
          const side = String(r.side || r.type || "").toLowerCase() === "sell" ? "sell" : "buy";
          const txHash = normalizeTradeTxHash(r.tx_hash || r.txHash);
          if (!txHash) return null;
          const tokensWei =
            r.tokensWei != null
              ? BigInt(String(r.tokensWei))
              : parseAmount(r.token_amount_raw, r.token_amount ?? r.tokens, tokenDecimals);
          const nativeWei =
            r.nativeWei != null
              ? BigInt(String(r.nativeWei))
              : parseAmount(r.bnb_amount_raw, r.bnb_amount ?? r.native, nativeDecimals);
          const tokens = numberFromRaw(tokensWei, tokenDecimals);
          const native = numberFromRaw(nativeWei, nativeDecimals);
          const suppliedPrice = Number(r.price_bnb ?? r.pricePerToken ?? 0);
          return {
            type: side,
            from: normalizeAddress(chainId, r.wallet || r.trader || r.from || ""),
            to: normalizeAddress(chainId, r.to || target),
            tokensWei,
            nativeWei,
            pricePerToken: Number.isFinite(suppliedPrice) && suppliedPrice > 0 ? suppliedPrice : tokens > 0 ? native / tokens : 0,
            timestamp: toTimestampSec(r.block_time ?? r.timestamp ?? r.time),
            txHash,
            blockNumber: Number(r.block_number ?? r.blockNumber ?? 0),
            logIndex: Number(r.log_index ?? r.logIndex ?? 0),
          } satisfies CurveTradePoint;
        } catch {
          return null;
        }
      })
      .filter((t): t is CurveTradePoint => Boolean(t) && isValidTradeTxHash(t?.txHash) && Number.isFinite(Number(t?.blockNumber)));

    if (!next.length && !options?.replaceEmpty) return 0;

    setPoints((prev) => {
      const merged = next.length ? mergeTradePoints(prev, next) : prev;
      if (campaignAddress && merged.length) saveCachedTradeHistory(chainId, campaignAddress, merged);
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
      let apiRows: any[] = [];
      try {
        apiRows = await fetchIndexerTrades(campaignAddress, chainId, limit, signal);
        if (signal?.aborted) return;
        if (apiRows.length) {
          applySnapshot(apiRows);
          setLoading(false);
          initialLoadedRef.current = true;
          if (!forceOnChainReconcile || isSolanaChainId(chainId)) {
            setError(null);
            return;
          }
        }
      } catch (apiError: any) {
        if (isAbortError(apiError)) return;
        console.warn("[useCurveTrades] indexer trade API failed", apiError);
      }

      if (isEvmChainId(chainId) && (!apiRows.length || forceOnChainReconcile || ENABLE_ONCHAIN_TRADE_FALLBACK)) {
        try {
          const fallbackRows = await fetchOnChainTradeSnapshot(campaignAddress, chainId, limit, signal);
          if (signal?.aborted) return;
          if (fallbackRows.length) applySnapshot(fallbackRows);
        } catch (fallbackError) {
          if (!isAbortError(fallbackError)) console.warn("[useCurveTrades] on-chain trade recovery skipped/failed", fallbackError);
        }
      }

      setError(null);
      initialLoadedRef.current = true;
    } catch (snapshotError: any) {
      if (!isAbortError(snapshotError)) {
        console.warn("[useCurveTrades] trade snapshot failed", snapshotError);
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
    const curr = canLoadTrades ? normalizeAddress(chainId, campaignAddress || "") : "";
    const prev = prevCampaignRef.current;
    if (curr !== prev) {
      prevCampaignRef.current = curr;
      const cached = curr ? loadCachedTradeHistory(chainId, curr) : [];
      setPoints(cached);
      setLoading(canLoadTrades && cached.length === 0);
      setError(null);
      initialLoadedRef.current = false;
    }

    void pullSnapshot(ac.signal);
    if (!canLoadTrades || (!ENABLE_TRADE_POLL && !ENABLE_TOKEN_POLLING)) return () => ac.abort();
    const timer = setInterval(() => void pullSnapshot(ac.signal), reconcileMs);
    return () => {
      clearInterval(timer);
      ac.abort();
    };
  }, [canLoadTrades, campaignAddress, chainId, pullSnapshot, reconcileMs]);

  useEffect(() => {
    if (!canLoadTrades || !campaignAddress) return;
    const current = normalizeAddress(chainId, campaignAddress);
    const onConfirmed = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const kind = String(detail?.kind || "").toLowerCase();
      const confirmedCampaign = normalizeAddress(chainId, detail?.campaignAddress || "");
      if ((kind !== "buy" && kind !== "sell") || confirmedCampaign !== current) return;
      if (Array.isArray(detail?.trades) && detail.trades.length) applySnapshot(detail.trades);
      void pullSnapshot();
      window.setTimeout(() => void pullSnapshot(), 1_500);
      window.setTimeout(() => void pullSnapshot(), 4_000);
      window.setTimeout(() => void pullSnapshot(), 8_000);
    };
    window.addEventListener("memewarzone:txConfirmed", onConfirmed as EventListener);
    return () => window.removeEventListener("memewarzone:txConfirmed", onConfirmed as EventListener);
  }, [canLoadTrades, campaignAddress, chainId, applySnapshot, pullSnapshot]);

  const ably = useAblyTokenChannel({ enabled: canLoadTrades, chainId, campaignAddress });
  useEffect(() => {
    if (!canLoadTrades || ably.missingBase || !ably.channel) return;
    const channel: RealtimeChannel = ably.channel;
    const onTrade = (msg: any) => {
      const data = msg?.data;
      if (Array.isArray(data)) applySnapshot(data);
      else if (data && typeof data === "object") applySnapshot([data]);
    };
    try {
      channel.subscribe("trade", onTrade);
    } catch {
      // HTTP polling remains authoritative when realtime is unavailable.
    }
    return () => {
      try {
        channel.unsubscribe("trade", onTrade);
      } catch {
        // ignore
      }
    };
  }, [canLoadTrades, ably.channel, ably.missingBase, applySnapshot]);

  return { points, loading, error };
}
