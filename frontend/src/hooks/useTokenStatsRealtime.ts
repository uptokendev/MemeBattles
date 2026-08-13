import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveChainId, isSolanaChainId, type SupportedChainId } from "@/lib/chainConfig";
import { useAblyTokenChannel } from "@/hooks/useAblyTokenChannel";

const API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");
const ENABLE_TOKEN_POLLING = String(import.meta.env.VITE_ENABLE_TOKEN_POLLING || "").trim() === "1";

export type TokenStatsRealtime = {
  lastPriceBnb: number | null; // native/token (BNB or SOL; legacy field name)
  marketcapBnb: number | null; // native market cap (BNB or SOL; legacy field name)
  vol24hBnb: number; // native 24h volume (legacy field name)
  soldTokens: number | null;
  graduated?: boolean;
  dex?: string | null;
  dexPool?: string | null;
  dexPosition?: string | null;
  graduationLiquidityNative?: number | null;
  graduatedAt?: string | null;
  updatedAt?: string;
};

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

function normalizeCampaign(chainId: number, value: string) {
  const raw = String(value || "").trim();
  return isSolanaChainId(chainId) ? raw : raw.toLowerCase();
}

export function useTokenStatsRealtime(campaignAddress?: string, chainId?: number, enabled = true) {
  const [stats, setStats] = useState<TokenStatsRealtime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadedRef = useRef(false);

  const cid = useMemo<SupportedChainId>(() => {
    const n = Number(chainId ?? 97);
    if (n === 56 || n === 97 || isSolanaChainId(n)) return n as SupportedChainId;
    return getActiveChainId(n);
  }, [chainId]);

  const url = useMemo(() => {
    if (!API_BASE || !campaignAddress) return "";
    const campaign = normalizeCampaign(cid, campaignAddress);
    return `${API_BASE}/api/token/${encodeURIComponent(campaign)}/summary?chainId=${cid}`;
  }, [campaignAddress, cid]);

  const pull = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !campaignAddress) {
      setStats(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!url) {
      setError("Missing VITE_REALTIME_API_BASE");
      setLoading(false);
      return;
    }
    try {
      if (!initialLoadedRef.current) setLoading(true);
      const row = await fetchJson(url, signal);
      if (!row) {
        setStats(null);
        setError(null);
        return;
      }
      setStats({
        lastPriceBnb: num(row.last_price_bnb),
        marketcapBnb: num(row.marketcap_bnb),
        vol24hBnb: Number(num(row.vol_24h_bnb) ?? 0),
        soldTokens: num(row.sold_tokens),
        updatedAt: String(row.updated_at ?? ""),
      });
      setError(null);
      initialLoadedRef.current = true;
    } catch (e: any) {
      setError(String(e?.message || "Failed to load token stats"));
    } finally {
      setLoading(false);
    }
  }, [enabled, campaignAddress, url]);

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

      setStats((prev) => ({
        lastPriceBnb: num(data.lastPriceBnb) ?? prev?.lastPriceBnb ?? null,
        marketcapBnb: num(data.marketcapBnb) ?? prev?.marketcapBnb ?? null,
        vol24hBnb: Number(num(data.vol24hBnb) ?? prev?.vol24hBnb ?? 0),
        soldTokens: prev?.soldTokens ?? null,
        graduated: data.graduated === true ? true : prev?.graduated,
        dex: data.dex != null ? String(data.dex) : prev?.dex ?? null,
        dexPool: data.dexPool != null ? String(data.dexPool) : prev?.dexPool ?? null,
        dexPosition: data.dexPosition != null ? String(data.dexPosition) : prev?.dexPosition ?? null,
        graduationLiquidityNative:
          num(data.graduationLiquiditySol) ?? prev?.graduationLiquidityNative ?? null,
        graduatedAt:
          data.graduatedAt != null ? String(data.graduatedAt) : prev?.graduatedAt ?? null,
        updatedAt: prev?.updatedAt,
      }));
    };

    const onConn = (c: any) => {
      if (c?.current === "connected") pull();
    };

    try { ably.client.connection.on(onConn); } catch {}
    try { ably.channel.subscribe("stats_patch", onStats); } catch {}

    return () => {
      try { ably.channel.unsubscribe("stats_patch", onStats); } catch {}
      try { ably.client.connection.off(onConn); } catch {}
    };
  }, [enabled, campaignAddress, cid, pull, ably.channel, ably.client, ably.missingBase]);

  return { stats, loading, error };
}
