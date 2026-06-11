import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { getActiveChainId } from "@/lib/chainConfig";
import { useAblyTokenChannel } from "@/hooks/useAblyTokenChannel";

// Realtime-indexer HTTP base (Railway). Example: https://memebattles-production.up.railway.app
const API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");
const ENABLE_TOKEN_POLLING = String(import.meta.env.VITE_ENABLE_TOKEN_POLLING || "").trim() === "1";
const CHART_CHAIN_IDS = String(import.meta.env.VITE_TOKEN_CHART_CHAIN_IDS || "").trim();

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
  chainId?: number;
};

type UseCurveTradesOptions = {
  enabled?: boolean;
  chainId?: number;
  limit?: number;
  /** Safety net: periodically re-fetch snapshot to reconcile any missed messages. Disabled by default. */
  reconcileMs?: number;
};

function uniquePositiveNumbers(values: number[]) {
  return Array.from(new Set(values.filter((n) => Number.isFinite(n) && n > 0)));
}

function getChartChainIds(primaryChainId: number): number[] {
  const configured = CHART_CHAIN_IDS
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return uniquePositiveNumbers(configured.length ? configured : [primaryChainId]);
}

function keyOf(t: Pick<CurveTradePoint, "txHash" | "logIndex" | "chainId">) {
  return `${Number(t.chainId || 0)}:${t.txHash.toLowerCase()}:${Number(t.logIndex ?? 0)}`;
}

function sortAsc(a: CurveTradePoint, b: CurveTradePoint) {
  if ((a.chainId || 0) !== (b.chainId || 0)) return (a.chainId || 0) - (b.chainId || 0);
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
  const s = typeof amount === "string" ? amount : typeof amount === "number" ? String(amount) : "0";
  try {
    if (kind === "ether") return ethers.parseEther(s);
    return ethers.parseUnits(s, 18);
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

async function fetchJson(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { method: "GET", signal });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.json();
}

/**
 * Curve trades backed by:
 *  1) Snapshot: Railway realtime-indexer REST endpoint
 *  2) Realtime: Ably channel updates
 *  3) Optional safety reconcile when VITE_ENABLE_TOKEN_POLLING=1
 */
export function useCurveTrades(campaignAddress?: string, opts?: UseCurveTradesOptions) {
  const enabled = opts?.enabled ?? true;
  const [points, setPoints] = useState<CurveTradePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevCampaignRef = useRef<string>("");

  const chainId = useMemo(() => {
    const cid = Number(opts?.chainId ?? 56);
    return getActiveChainId(cid);
  }, [opts?.chainId]);

  const chartChainIds = useMemo(() => getChartChainIds(chainId), [chainId]);
  const inFlightRef = useRef(false);
  const initialLoadedRef = useRef(false);
  const reconcileMs = opts?.reconcileMs ?? 60_000;
  const limit = Math.min(Math.max(Number(opts?.limit ?? 200), 1), 200);

  const apiTradesUrls = useMemo(() => {
    if (!API_BASE || !campaignAddress) return [] as Array<{ chainId: number; url: string }>;
    const campaign = campaignAddress.toLowerCase();
    return chartChainIds.map((cid) => ({
      chainId: cid,
      url: `${API_BASE}/api/token/${campaign}/trades?chainId=${cid}&limit=${limit}`,
    }));
  }, [campaignAddress, chartChainIds, limit]);

  const applySnapshot = useCallback((rows: any[], sourceChainId = chainId) => {
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
          chainId: Number(r.chain_id ?? r.chainId ?? sourceChainId),
        } satisfies CurveTradePoint;
      })
      .filter((t) => /^0x[a-f0-9]{64}$/i.test(t.txHash) && Number.isFinite(t.blockNumber));

    setPoints((prev) => mergeTrades(prev, next));
  }, [campaignAddress, chainId]);

  const pullSnapshot = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !campaignAddress) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!apiTradesUrls.length) {
      setError("Missing VITE_REALTIME_API_BASE");
      setLoading(false);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (!initialLoadedRef.current) setLoading(true);
      const results = await Promise.allSettled(
        apiTradesUrls.map(async (entry) => ({
          chainId: entry.chainId,
          rows: await fetchJson(entry.url, signal),
        }))
      );

      const successes = results.filter((r): r is PromiseFulfilledResult<{ chainId: number; rows: any }> => r.status === "fulfilled");
      for (const result of successes) {
        applySnapshot(Array.isArray(result.value.rows) ? result.value.rows : [], result.value.chainId);
      }

      if (!successes.length) {
        const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
        throw firstError || new Error("Failed to load trades");
      }

      setError(null);
      initialLoadedRef.current = true;
    } catch (e: any) {
      setError(String(e?.message || "Failed to load trades"));
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [enabled, campaignAddress, apiTradesUrls, applySnapshot]);

  useEffect(() => {
    const ac = new AbortController();
    const curr = (campaignAddress || "").toLowerCase();
    const prev = prevCampaignRef.current;
    if (curr !== prev) {
      prevCampaignRef.current = curr;
      setPoints([]);
      setLoading(true);
      setError(null);
      initialLoadedRef.current = false;
    }

    pullSnapshot(ac.signal);

    if (!enabled || !campaignAddress || !ENABLE_TOKEN_POLLING) return () => ac.abort();

    const t = setInterval(() => {
      pullSnapshot(ac.signal);
    }, reconcileMs);

    return () => {
      clearInterval(t);
      ac.abort();
    };
  }, [enabled, campaignAddress, pullSnapshot, reconcileMs]);

  const ably = useAblyTokenChannel({ enabled: enabled && !!campaignAddress, chainId, campaignAddress });
  useEffect(() => {
    if (!enabled || !campaignAddress) return;
    if (ably.missingBase || !ably.channel) return;

    const onTrade = (msg: any) => {
      const data = msg?.data;
      if (Array.isArray(data)) return applySnapshot(data, chainId);
      if (data && typeof data === "object") return applySnapshot([data], chainId);
    };

    try {
      ably.channel.subscribe("trade", onTrade);
    } catch {
      // ignore
    }

    return () => {
      try {
        ably.channel.unsubscribe("trade", onTrade);
      } catch {
        // ignore
      }
    };
  }, [enabled, campaignAddress, chainId, ably.channel, ably.missingBase, applySnapshot]);

  return { points, loading, error };
}
