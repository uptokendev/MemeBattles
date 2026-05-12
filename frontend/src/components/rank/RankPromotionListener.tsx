import { useEffect, useMemo } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useAblyLeagueChannel } from "@/hooks/useAblyLeagueChannel";
import { getActiveChainId } from "@/lib/chainConfig";
import {
  isRankUpgrade,
  normalizeRank,
  readStoredRank,
  writePendingRankPromotion,
  writeStoredRank,
} from "@/lib/ranks";

function normalizeAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function RankPromotionListener() {
  const wallet = useWallet();
  const anyWallet: any = wallet as any;
  // Always map to the active app chain — rank events are emitted on supported
  // chains only, so a wallet on (e.g.) ETH mainnet=1 would otherwise listen on
  // the wrong Ably channel and miss promotions.
  const walletChainId = Number(anyWallet?.chainId ?? anyWallet?.network?.chainId ?? 0) || null;
  const chainId = getActiveChainId(walletChainId);
  const account = useMemo(() => normalizeAddress(wallet.account), [wallet.account]);
  const enabled = Boolean(account);
  const { channel } = useAblyLeagueChannel({ enabled, chainId });

  useEffect(() => {
    if (!chainId || !account) return;

    const stored = readStoredRank(chainId, account);
    if (!stored) {
      writeStoredRank(chainId, account, "Recruit");
    }
  }, [chainId, account]);

  useEffect(() => {
    if (!channel || !chainId || !account) return;

    const onRankUpdated = (message: any) => {
      const payload = message?.data ?? {};
      const targetAddress = normalizeAddress(
        payload.address ?? payload.userAddress ?? payload.wallet ?? payload.recipient
      );

      if (!targetAddress || targetAddress !== account) return;

      const newRank = normalizeRank(payload.newRank ?? payload.rank);
      const storedRank = readStoredRank(chainId, account) ?? "Recruit";
      const previousRank = normalizeRank(payload.oldRank ?? payload.previousRank ?? storedRank);
      const baselineRank = normalizeRank(storedRank || previousRank);
      const upgraded = isRankUpgrade(newRank, baselineRank) || isRankUpgrade(newRank, previousRank);

      if (upgraded && baselineRank !== newRank) {
        writePendingRankPromotion(chainId, account, baselineRank, newRank);
      }

      if (isRankUpgrade(newRank, baselineRank) || baselineRank === newRank || isRankUpgrade(newRank, previousRank)) {
        writeStoredRank(chainId, account, newRank);
      }

      window.dispatchEvent(
        new CustomEvent("mwz:rank-updated", {
          detail: {
            address: account,
            chainId,
            oldRank: previousRank,
            newRank,
          },
        })
      );
    };

    channel.subscribe("user_rank_updated", onRankUpdated);

    return () => {
      try {
        channel.unsubscribe("user_rank_updated", onRankUpdated);
      } catch {
        // ignore cleanup errors
      }
    };
  }, [channel, chainId, account]);

  return null;
}
