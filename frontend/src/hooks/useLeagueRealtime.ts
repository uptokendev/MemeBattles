import { useEffect, useMemo, useRef, useState } from "react";
import { useAblyLeagueChannel } from "./useAblyLeagueChannel";

export type LeaguePatch = {
  campaignAddress: string; // lowercase
  lastPriceBnb?: string | null;
  marketcapBnb?: string | null;
  vol24hBnb?: string | null;
  votes24h?: number;
  votesAllTime?: number;
  trendingScore?: string | null;
  raisedTotalBnb?: string | null;
  ts?: number;
};

type PatchMsg = {
  type: "campaign_patch";
  chainId: number;
  ts: number;
  items: LeaguePatch[];
};

type Opts = {
  enabled: boolean;
  chainId: number;

  /**
   * Called only when realtime is NOT connected.
   * Use it to trigger a single lightweight REST refresh of Home data.
   */
  onFallbackRefresh?: () => void;

  /**
   * Default 25s. Keep it >= 20s to avoid hammering.
   */
  fallbackMs?: number;
};

export function useLeagueRealtime(opts: Opts) {
  const { enabled, chainId, onFallbackRefresh, fallbackMs } = opts;

  const { channel, ready, isConnected } = useAblyLeagueChannel({ enabled, chainId });

  const [patchByCampaign, setPatchByCampaign] = useState<Record<string, LeaguePatch>>({});

  // --- realtime subscription (campaign_patch) ---
  useEffect(() => {
    if (!ready || !channel) return;

    const onMsg = (msg: any) => {
      const data = (msg?.data ?? null) as PatchMsg | null;
      if (!data || data.type !== "campaign_patch" || !Array.isArray(data.items)) return;

      setPatchByCampaign((prev) => {
        const next = { ...prev };
        for (const it of data.items) {
          const addr = String(it?.campaignAddress ?? "").toLowerCase();
          if (!addr) continue;
          next[addr] = { ...(next[addr] ?? { campaignAddress: addr }), ...it, campaignAddress: addr, ts: data.ts };
        }
        return next;
      });
    };

    channel.subscribe("campaign_patch", onMsg);
    return () => {
      try {
        channel.unsubscribe("campaign_patch", onMsg);
      } catch {
        // ignore
      }
    };
  }, [ready, channel]);

  // --- self-heal: fallback refresh when disconnected ---
  const timerRef = useRef<any>(null);
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    const intervalMs = Math.max(20000, Number(fallbackMs ?? 25000));

    // stop timer if realtime connected or no callback
    if (!enabled || isConnected || !onFallbackRefresh) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // start (or keep) timer while disconnected
    if (!timerRef.current) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        // safety: ensure no accidental tight loop
        if (now - lastRefreshRef.current < intervalMs - 250) return;
        lastRefreshRef.current = now;

        try {
          onFallbackRefresh();
        } catch {
          // ignore
        }
      }, intervalMs);
    }

    // trigger an immediate refresh once when we first notice disconnect
    const now = Date.now();
    if (now - lastRefreshRef.current > 1000) {
      lastRefreshRef.current = now;
      try {
        onFallbackRefresh();
      } catch {
        // ignore
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, isConnected, onFallbackRefresh, fallbackMs]);

  return useMemo(() => ({ patchByCampaign, isConnected }), [patchByCampaign, isConnected]);
}
