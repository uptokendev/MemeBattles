import { useEffect, useState } from "react";

import {
  fetchSolanaOnChainHolders,
  type SolanaOnChainHolderDistribution,
} from "@/lib/solanaMeteoraMarket";
import {
  fetchSolanaMeteoraPoolSnapshot,
  type SolanaMeteoraPoolSnapshot,
} from "@/lib/solanaMeteoraTrade";

export function useSolanaMeteoraMarket(input: {
  mint?: string;
  tokenDecimals: number;
  campaignTokenVault?: string | null;
  enabled: boolean;
  refreshToken?: number;
}) {
  const [spot, setSpot] = useState<SolanaMeteoraPoolSnapshot | null>(null);
  const [holders, setHolders] = useState<SolanaOnChainHolderDistribution | null>(null);

  useEffect(() => {
    const mint = String(input.mint || "").trim();
    if (!input.enabled || !mint) {
      setSpot(null);
      setHolders(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const nextSpot = await fetchSolanaMeteoraPoolSnapshot({
          mint,
          tokenDecimals: input.tokenDecimals,
        });
        if (cancelled) return;
        setSpot(nextSpot);
        try {
          const nextHolders = await fetchSolanaOnChainHolders({
            mint,
            poolTokenVault: nextSpot.tokenVault,
            campaignTokenVault: input.campaignTokenVault,
          });
          if (!cancelled) setHolders(nextHolders);
        } catch (error) {
          console.warn("[solana-meteora] holders", error);
        }
      } catch (error) {
        console.warn("[solana-meteora] spot", error);
      }
    };

    void load();
    const timer = window.setInterval(load, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [input.campaignTokenVault, input.enabled, input.mint, input.refreshToken, input.tokenDecimals]);

  return { spot, holders };
}
