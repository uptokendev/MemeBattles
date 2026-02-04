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

export type LeagueCampaignCreated = {
  campaignAddress: string; // lowercase
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  name?: string | null;
  symbol?: string | null;
  createdAtChain?: string | null;
  blockNumber?: number | null;
};

type PatchMsg = {
  type: "campaign_patch";
  chainId: number;
  ts: number;
  items: LeaguePatch[];
};

type CampaignCreatedMsg = {
  type: "campaign_created";
  chainId: number;
  ts: number;
  item: LeagueCampaignCreated;
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
  const [created, setCreated] = useState<LeagueCampaignCreated[]>([]);

  // Buffer updates to avoid render storms. Flush at 500ms (requested).
  const pendingPatchRef = useRef<Record<string, LeaguePatch>>({});
  const pendingCreatedRef = useRef<LeagueCampaignCreated[]>([]);

  // --- realtime subscription (campaign_patch) ---
  useEffect(() => {
    if (!ready || !channel) return;

    const onPatch = (msg: any) => {
      const data = (msg?.data ?? null) as PatchMsg | null;
      if (!data || data.type !== "campaign_patch" || !Array.isArray(data.items)) return;

      const buf = pendingPatchRef.current;
      for (const it of data.items) {
        const addr = String(it?.campaignAddress ?? "").toLowerCase();
        if (!addr) continue;
        const prev = buf[addr] ?? { campaignAddress: addr };
        buf[addr] = { ...prev, ...it, campaignAddress: addr, ts: data.ts };
      }
    };

    const onCreated = (msg: any) => {
      const data = (msg?.data ?? null) as CampaignCreatedMsg | null;
      if (!data || data.type !== "campaign_created" || !data.item) return;
      const addr = String((data.item as any).campaignAddress ?? "").toLowerCase();
      if (!addr) return;
      pendingCreatedRef.current.push({ ...data.item, campaignAddress: addr });
    };

    channel.subscribe("campaign_patch", onPatch);
    channel.subscribe("campaign_created", onCreated);

    const flushId = setInterval(() => {
      // Flush patches
      const buf = pendingPatchRef.current;
      const keys = Object.keys(buf);
      if (keys.length) {
        setPatchByCampaign((prev) => {
          const next = { ...prev };
          for (const k of keys) {
            const it = buf[k];
            next[k] = { ...(next[k] ?? { campaignAddress: k }), ...it, campaignAddress: k };
          }
          return next;
        });
        pendingPatchRef.current = {};
      }

      // Flush created campaigns
      const createdBatch = pendingCreatedRef.current;
      if (createdBatch.length) {
        setCreated((prev) => {
          // keep last 50 created announcements (UI consumption only)
          const next = [...createdBatch, ...prev];
          return next.slice(0, 50);
        });
        pendingCreatedRef.current = [];
      }
    }, 500);

    return () => {
      clearInterval(flushId);
      try {
        channel.unsubscribe("campaign_patch", onPatch);
      } catch {}
      try {
        channel.unsubscribe("campaign_created", onCreated);
      } catch {}
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

  return useMemo(() => ({ patchByCampaign, created, isConnected }), [patchByCampaign, created, isConnected]);
}
