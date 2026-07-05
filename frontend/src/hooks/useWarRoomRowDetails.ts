import { useEffect, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { apiFetch } from "@/lib/apiBase";
import type { WarRoomCampaign } from "@/hooks/useWarRoomCampaignFeed";

export type WarRoomRowDetailSource = "api" | "draft" | "empty";

export type WarRoomRowDetails = {
  campaign?: Partial<WarRoomCampaign>;
  chart?: {
    source: "bonding_curve" | "dex" | "draft";
    campaignAddress: string;
    tokenAddress?: string | null;
    preferredTimeframe?: string;
  };
  battleIntel?: {
    status: "eligible" | "unavailable" | string;
    eligible: boolean;
    unavailableReason?: string | null;
    summary?: string;
  };
  tradeContext?: {
    mode: "bonding_curve" | "dex" | "draft" | string;
    canBuy: boolean;
    canSell: boolean;
    slippagePct?: number;
  };
  watchlist?: {
    supported: boolean;
    following: boolean;
    reason?: string | null;
  };
  updatedAt?: string;
};

export function useWarRoomRowDetails({
  campaignAddress,
  chainId,
  enabled,
}: {
  campaignAddress?: string | null;
  chainId?: number | null;
  enabled: boolean;
}) {
  const { account } = useWallet();
  const [details, setDetails] = useState<WarRoomRowDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<WarRoomRowDetailSource>("empty");

  useEffect(() => {
    const address = String(campaignAddress ?? "").trim();
    if (!enabled || !address) {
      setDetails(null);
      setLoading(false);
      setError(null);
      setSource("empty");
      return;
    }

    if (address.startsWith("draft:")) {
      setDetails({
        chart: { source: "draft", campaignAddress: address, tokenAddress: null },
        battleIntel: {
          status: "unavailable",
          eligible: false,
          unavailableReason: "draft_not_live",
          summary: "This draft is still in preparation. Trading and battles unlock once it goes live.",
        },
        tradeContext: { mode: "draft", canBuy: false, canSell: false },
        watchlist: { supported: false, following: false, reason: "draft_not_live" },
        updatedAt: new Date().toISOString(),
      });
      setLoading(false);
      setError(null);
      setSource("draft");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          campaignAddress: address,
          chainId: String(chainId || 97),
        });
        if (account) params.set("userAddress", account);
        const response = await apiFetch(`/api/war-room?${params.toString()}`, { cache: "no-store" as RequestCache, signal: controller.signal });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));
        if (cancelled) return;
        setDetails(json as WarRoomRowDetails);
        setSource("api");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("[useWarRoomRowDetails] failed to load row details", loadError);
        if (!cancelled) {
          setDetails(null);
          setSource("empty");
          setError(loadError instanceof Error ? loadError.message : "Failed to load market row details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [account, campaignAddress, chainId, enabled]);

  return { details, loading, error, source };
}
