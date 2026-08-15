import { useEffect, useState } from "react";
import type { ProfileTab } from "@/types/profile";
import type { ActivityTradeRow } from "@/types/profilePage";
import { buildRealtimeApiUrl } from "@/lib/realtimeApi";
import { normalizeAddress } from "@/lib/address";

export type ProfileActivityTab = "trades" | "comments" | "created" | "interactions";

interface UseProfileActivityArgs {
  activeTab: ProfileTab;
  activityTab: ProfileActivityTab;
  viewedAddress: string | null;
  chainId?: number;
}

export function useProfileActivity({
  activeTab,
  activityTab,
  viewedAddress,
  chainId,
}: UseProfileActivityArgs) {
  const [activityTrades, setActivityTrades] = useState<ActivityTradeRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (activeTab !== "replies" || activityTab !== "trades") return;

    if (!viewedAddress) {
      setActivityTrades([]);
      setActivityError(null);
      setActivityLoading(false);
      return;
    }

    const ac = new AbortController();
    const addr = normalizeAddress(viewedAddress);
    const cid = Number(chainId ?? 97);

    setActivityLoading(true);
    setActivityError(null);

    (async () => {
      try {
        const qs = new URLSearchParams({
          chainId: String(cid),
          address: addr,
          limit: "50",
        });

        const url = buildRealtimeApiUrl(`/api/activity/trades?${qs.toString()}`);
        const r = await fetch(url, { method: "GET", signal: ac.signal });
        const j = await r.json().catch(() => null);

        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

        const rows = Array.isArray(j?.items) ? j.items : [];
        const next: ActivityTradeRow[] = rows.map((it: any) => ({
          id: String(it?.id ?? `${it?.txHash ?? ""}:${it?.logIndex ?? 0}`),
          txHash: String(it?.txHash ?? ""),
          logIndex: Number(it?.logIndex ?? 0),
          blockNumber: Number(it?.blockNumber ?? 0),
          blockTime: String(it?.blockTime ?? ""),
          side: String(it?.side ?? "buy") === "sell" ? "sell" : "buy",
          wallet: String(it?.wallet ?? ""),
          tokenAmount: it?.tokenAmount == null ? null : Number(it.tokenAmount),
          bnbAmount: it?.bnbAmount == null ? null : Number(it.bnbAmount),
          priceBnb: it?.priceBnb == null ? null : Number(it.priceBnb),
          campaignAddress: String(it?.campaignAddress ?? ""),
          tokenAddress: it?.tokenAddress ? String(it.tokenAddress) : null,
          campaignName: it?.campaignName ?? null,
          campaignSymbol: it?.campaignSymbol ?? null,
          logoUri: it?.logoUri ?? null,
        }));

        if (cancelled) return;
        setActivityTrades(next);
      } catch (e: any) {
        if (cancelled || ac.signal.aborted) return;
        setActivityError(String(e?.message || "Failed to load trades"));
        setActivityTrades([]);
      } finally {
        if (cancelled) return;
        setActivityLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [activeTab, activityTab, viewedAddress, chainId]);

  return {
    activityTrades,
    activityLoading,
    activityError,
  };
}
