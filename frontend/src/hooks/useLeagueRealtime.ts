import { useEffect, useMemo, useState } from "react";

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
};

export function useLeagueRealtime(opts: Opts) {
  const base = useBaseLeagueRealtime(opts);
  const [launchByCampaign, setLaunchByCampaign] = useState<Record<string, number | null>>({});
  const [resolved, setResolved] = useState(base.created.length === 0);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!base.created.length) {
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

      const entries = await Promise.all(
        base.created.map(async (item) => {
          const address = String(item.campaignAddress || "").toLowerCase();
          const draft = lifecycle.get(address);
          const stored = timestampSeconds(draft?.scheduledLaunchAt || draft?.tradingLaunchAt);
          const launchAt = stored ?? (await readCampaignLaunchAt(opts.chainId, address));
          return [address, launchAt] as const;
        }),
      );

      if (cancelled) return;
      setLaunchByCampaign(Object.fromEntries(entries));
      setResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [base.created, opts.chainId]);

  useEffect(() => {
    const hasFuture = Object.values(launchByCampaign).some((value) => value && value > Math.floor(Date.now() / 1000));
    if (!hasFuture) return;
    const timer = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [launchByCampaign]);

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
