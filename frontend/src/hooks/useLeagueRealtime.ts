import { useEffect, useMemo, useState } from "react";
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

export function useLeagueRealtime(enabled: boolean, chainId: number) {
  const { channel, ready } = useAblyLeagueChannel({ enabled, chainId });

  const [patchByCampaign, setPatchByCampaign] = useState<Record<string, LeaguePatch>>({});

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

  return useMemo(() => ({ patchByCampaign }), [patchByCampaign]);
}
