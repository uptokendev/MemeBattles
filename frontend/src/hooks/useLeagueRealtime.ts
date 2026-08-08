import { useEffect, useMemo, useRef, useState } from "react";

import {
  useLeagueRealtime as useBaseLeagueRealtime,
  type LeagueCampaignCreated,
  type LeaguePatch,
} from "./useLeagueRealtimeBase";
import {
  fetchPublicCampaignLifecycleDrafts,
  lifecycleByCampaign,
  readCampaignLaunchAt,
  timestampSeconds,
} from "@/lib/scheduledLaunchApi";

export type { LeagueCampaignCreated, LeaguePatch } from "./useLeagueRealtimeBase";

type Opts = {
  enabled: boolean;
  chainId: number;
  onFallbackRefresh?: () => void;
  fallbackMs?: number;
  /** Soft full-list re-rank while Ably connected (default 45s). 0 disables. */
  softRefreshMs?: number;
};

export function useLeagueRealtime(opts: Opts) {
  const base = useBaseLeagueRealtime(opts);
  const [launchByCampaign, setLaunchByCampaign] = useState<Record<string, number | null>>({});
  const [resolved, setResolved] = useState(base.created.length === 0);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const refreshRef = useRef(opts.onFallbackRefresh);
  const announcedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    refreshRef.current = opts.onFallbackRefresh;
  }, [opts.onFallbackRefresh]);

  useEffect(() => {
    if (!opts.enabled) {
      setResolved(true);
      setLaunchByCampaign({});
      return;
    }

    let cancelled = false;
    setResolved(false);

    void (async () => {
      let lifecycle = new Map<string, any>();
      try {
        lifecycle = lifecycleByCampaign(
          await fetchPublicCampaignLifecycleDrafts({ chainId: opts.chainId, limit: 500 }),
        );
      } catch {
        lifecycle = new Map();
      }

      const entries = new Map<string, number | null>();
      for (const [address, draft] of lifecycle.entries()) {
        entries.set(address, timestampSeconds(draft?.scheduledLaunchAt || draft?.tradingLaunchAt));
      }

      await Promise.all(
        base.created.map(async (item) => {
          const address = String(item.campaignAddress || "").toLowerCase();
          if (!address || entries.has(address)) return;
          entries.set(address, await readCampaignLaunchAt(opts.chainId, address));
        }),
      );

      if (cancelled) return;
      const current = Math.floor(Date.now() / 1000);
      for (const [address, launchAt] of entries) {
        if (launchAt && launchAt <= current) announcedRef.current.add(address);
      }
      setNowSec(current);
      setLaunchByCampaign(Object.fromEntries(entries));
      setResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [base.created, opts.chainId, opts.enabled]);

  useEffect(() => {
    const future = Object.entries(launchByCampaign).filter(([, value]) => value && value > Math.floor(Date.now() / 1000));
    if (!future.length) return;

    let previous = Math.floor(Date.now() / 1000);
    const timer = window.setInterval(() => {
      const current = Math.floor(Date.now() / 1000);
      let crossed = false;

      for (const [address, launchAt] of Object.entries(launchByCampaign)) {
        if (!launchAt || launchAt > current || launchAt <= previous || announcedRef.current.has(address)) continue;
        announcedRef.current.add(address);
        crossed = true;
        window.dispatchEvent(
          new CustomEvent("memewarzone:scheduledLaunchReached", {
            detail: { chainId: opts.chainId, campaignAddress: address, launchAt },
          }),
        );
      }

      previous = current;
      setNowSec(current);
      if (crossed) refreshRef.current?.();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [launchByCampaign, opts.chainId]);

  const created = useMemo<LeagueCampaignCreated[]>(() => {
    if (!resolved && base.created.length) return [];
    return base.created
      .filter((item) => {
        const launchAt = launchByCampaign[String(item.campaignAddress || "").toLowerCase()];
        return !launchAt || launchAt <= nowSec;
      })
      .map((item) => {
        const launchAt = launchByCampaign[String(item.campaignAddress || "").toLowerCase()];
        return launchAt
          ? { ...item, createdAtChain: new Date(launchAt * 1000).toISOString() }
          : item;
      });
  }, [base.created, launchByCampaign, nowSec, resolved]);

  return useMemo(
    () => ({ ...base, created }),
    [base, created],
  ) as {
    patchByCampaign: Record<string, LeaguePatch>;
    created: LeagueCampaignCreated[];
    isConnected: boolean;
  };
}
