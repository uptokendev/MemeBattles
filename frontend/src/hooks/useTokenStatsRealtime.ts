import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveChainId } from "@/lib/chainConfig";
import { useAblyTokenChannel } from "@/hooks/useAblyTokenChannel";

const API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");
const ENABLE_TOKEN_POLLING = String(import.meta.env.VITE_ENABLE_TOKEN_POLLING || "").trim() === "1";
const CHART_CHAIN_IDS = String(import.meta.env.VITE_TOKEN_CHART_CHAIN_IDS || "").trim();

export type TokenStatsRealtime = {
  lastPriceBnb: number | null;
  marketcapBnb: number | null;
  vol24hBnb: number;
  soldTokens: number | null;
  updatedAt?: string;
  chainId?: number;
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

async function fetchJson(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { method: "GET", signal });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.json();
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export function useTokenStatsRealtime(campaignAddress?: string, chainId?: number, enabled = true) {
  const [stats, setStats] = useState<TokenStatsRealtime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadedRef = useRef(false);

  const cid = useMemo(() => getActiveChainId(Number(chainId ?? 56)), [chainId]);
  const chartChainIds = useMemo(() => getChartChainIds(cid), [cid]);

  const urls = useMemo(() => {
    if (!API_BASE || !campaignAddress) return [] as Array<{ chainId: number; url: string }>;
    const campaign = campaignAddress.toLowerCase();
    return chartChainIds.map((chartChainId) => ({
      chainId: chartChainId,
      url: `${API_BASE}/api/token/${campaign}/summary?chainId=${chartChainId}`,
    }));
  }, [campaignAddress, chartChainIds]);

  const pull = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !campaignAddress) {
      setStats(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!urls.length) {
      setError("Missing VITE_REALTIME_API_BASE");
      setLoading(false);
      return;
    }
    try {
      if (!initialLoadedRef.current) setLoading(true);
      const results = await Promise.allSettled(
        urls.map(async (entry) => ({
          chainId: entry.chainId,
          row: await fetchJson(entry.url, signal),
        }))
      );
      const successes = results.filter((r): r is PromiseFulfilledResult<{ chainId: number; row: any }> => r.status === "fulfilled");
      const selected = successes.find((r) => r.value.row) ?? successes[0] ?? null;

      if (!selected) {
        const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
        throw firstError || new Error("Failed to load token stats");
      }

      const row = selected.value.row;
      if (!row) {
        setStats(null);
        setError(null);
        initialLoadedRef.current = true;
        return;
      }
      setStats({
        lastPriceBnb: num(row.last_price_bnb),
        marketcapBnb: num(row.marketcap_bnb),
        vol24hBnb: Number(num(row.vol_24h_bnb) ?? 0),
        soldTokens: num(row.sold_tokens),
        updatedAt: String(row.updated_at ?? ""),
        chainId: Number(row.chain_id ?? selected.value.chainId),
      });
      setError(null);
      initialLoadedRef.current = true;
    } catch (e: any) {
      setError(String(e?.message || "Failed to load token stats"));
    } finally {
      setLoading(false);
    }
  }, [enabled, campaignAddress, urls]);

  useEffect(() => {
    const ac = new AbortController();
    setError(null);
    if (!initialLoadedRef.current) setLoading(true);
    pull(ac.signal);

    if (!enabled || !campaignAddress || !ENABLE_TOKEN_POLLING) return () => ac.abort();

    const t = setInterval(() => pull(ac.signal), 60_000);
    return () => {
      clearInterval(t);
      ac.abort();
    };
  }, [enabled, campaignAddress, cid, pull]);

  const ably = useAblyTokenChannel({ enabled: enabled && !!campaignAddress, chainId: cid, campaignAddress });
  useEffect(() => {
    if (!enabled || !campaignAddress) return;
    if (ably.missingBase || !ably.channel || !ably.client) return;

    const onStats = (msg: any) => {
      const data: any = msg?.data;
      if (!data) return;
      if ((msg?.name || "") !== "stats_patch" && String(data.type || "") !== "stats_patch") return;

      setStats((prev) => {
        const next: TokenStatsRealtime = {
          lastPriceBnb: num(data.lastPriceBnb) ?? prev?.lastPriceBnb ?? null,
          marketcapBnb: num(data.marketcapBnb) ?? prev?.marketcapBnb ?? null,
          vol24hBnb: Number(num(data.vol24hBnb) ?? prev?.vol24hBnb ?? 0),
          soldTokens: prev?.soldTokens ?? null,
          updatedAt: prev?.updatedAt,
          chainId: prev?.chainId ?? cid,
        };
        return next;
      });
    };

    const onConn = (c: any) => {
      if (c?.current === "connected") pull();
    };

    try {
      ably.client.connection.on(onConn);
    } catch {
      // ignore
    }
    try {
      ably.channel.subscribe("stats_patch", onStats);
    } catch {
      // ignore
    }

    return () => {
      try { ably.channel.unsubscribe("stats_patch", onStats); } catch {}
      try { ably.client.connection.off(onConn); } catch {}
    };
  }, [enabled, campaignAddress, cid, pull, ably.channel, ably.client, ably.missingBase]);

  return { stats, loading, error };
}
