import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { getActiveChainId, type SupportedChainId } from "@/lib/chainConfig";
import { useAblyTokenChannel } from "@/hooks/useAblyTokenChannel";

// Realtime-indexer HTTP base (Railway). Example: https://upmeme-production.up.railway.app
const API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");

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
  /** Safety net: periodically re-fetch snapshot to reconcile any missed messages. */
  reconcileMs?: number;
};

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
  // Postgres numerics often come through as strings (best case).
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
 * Curve trades (bonding curve) backed by:
 *  1) Snapshot: Railway realtime-indexer REST endpoint
 *  2) Realtime: Ably channel updates
 *  3) Safety: periodic snapshot reconcile to avoid drift under heavy load
 */
export function useCurveTrades(campaignAddress?: string, opts?: UseCurveTradesOptions) {
  const enabled = opts?.enabled ?? true;
  const [points, setPoints] = useState<CurveTradePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only hard-reset state when the campaign address actually changes.
  // This prevents brief "trade list resets" that can cause the chart to
  // momentarily drop the latest candle while the indexer catches up.
  const prevCampaignRef = useRef<string>("");

  const chainId = useMemo<SupportedChainId>(() => {
    const cid = Number(opts?.chainId ?? 97);
    return getActiveChainId(cid);
  }, [opts?.chainId]);

  const inFlightRef = useRef(false);
  const initialLoadedRef = useRef(false);

  // If Ably realtime is temporarily unavailable (e.g., mobile networks, WS blocked),
  // this snapshot reconcile keeps the UI fresh. Keep it relatively low for testnet UX.
  const reconcileMs = opts?.reconcileMs ?? 10_000;
  const limit = Math.min(Math.max(Number(opts?.limit ?? 200), 1), 200);

  const apiTradesUrl = useMemo(() => {
    if (!API_BASE || !campaignAddress) return "";
    return `${API_BASE}/api/token/${campaignAddress.toLowerCase()}/trades?chainId=${chainId}&limit=${limit}`;
  }, [campaignAddress, chainId, limit]);

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
  }, [campaignAddress]);

  const pullSnapshot = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !campaignAddress) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!apiTradesUrl) {
      setError("Missing VITE_REALTIME_API_BASE");
      setLoading(false);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Avoid "page reload" feel by only showing the loading state for the first fetch.
      if (!initialLoadedRef.current) setLoading(true);
      const rows = await fetchJson(apiTradesUrl, signal);
      applySnapshot(Array.isArray(rows) ? rows : []);
      setError(null);
      initialLoadedRef.current = true;
    } catch (e: any) {
      const msg = e?.message || "Failed to load trades";
      setError(String(msg));
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [enabled, campaignAddress, apiTradesUrl, applySnapshot]);

  // Initial snapshot + periodic reconcile
  useEffect(() => {
    const ac = new AbortController();
    const curr = (campaignAddress || "").toLowerCase();
    const prev = prevCampaignRef.current;
    // Only reset when the campaign truly changed. Avoid resets caused by
    // incidental prop changes (e.g., undefined -> 97 chainId) which can
    // temporarily clear the trade series and cause chart flicker.
    if (curr !== prev) {
      prevCampaignRef.current = curr;
      setPoints([]);
      setLoading(true);
      setError(null);
      initialLoadedRef.current = false;
    }

    pullSnapshot(ac.signal);

    if (!enabled || !campaignAddress) return () => ac.abort();

    const t = setInterval(() => {
      pullSnapshot(ac.signal);
    }, reconcileMs);

    return () => {
      clearInterval(t);
      ac.abort();
    };
  }, [enabled, campaignAddress, pullSnapshot, reconcileMs]);

  // Ably realtime stream (trade events) — shared per campaign to avoid multiple WebSockets.
  const ably = useAblyTokenChannel({ enabled: enabled && !!campaignAddress, chainId, campaignAddress });
  useEffect(() => {
    if (!enabled || !campaignAddress) return;
    if (ably.missingBase || !ably.channel) return;

    const onTrade = (msg: any) => {
      const data = msg?.data;
      if (Array.isArray(data)) return applySnapshot(data);
      if (data && typeof data === "object") return applySnapshot([data]);
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
  }, [enabled, campaignAddress, ably.channel, ably.missingBase, applySnapshot]);


  return { points, loading, error };
}
