import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useAblyLeagueChannel } from "@/hooks/useAblyLeagueChannel";
import {
  isRankUpgrade,
  normalizeRank,
  readStoredRank,
  writeStoredRank,
  type RankName,
} from "@/lib/ranks";
import RankUpModal from "@/components/rank/RankUpModal";

type RankModalState = {
  isOpen: boolean;
  rank: RankName;
};

const DEFAULT_MODAL_STATE: RankModalState = {
  isOpen: false,
  rank: "Recruit",
};

function normalizeAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function RankPromotionListener() {
  const wallet = useWallet();
  const anyWallet: any = wallet as any;
  const chainId: number | null = Number(anyWallet?.chainId ?? anyWallet?.network?.chainId ?? 0) || null;
  const account = useMemo(() => normalizeAddress(wallet.account), [wallet.account]);
  const enabled = Boolean(chainId && account);
  const { channel } = useAblyLeagueChannel({ enabled, chainId: chainId || 97 });
  const [modal, setModal] = useState<RankModalState>(DEFAULT_MODAL_STATE);

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

      writeStoredRank(chainId, account, newRank);

      if (!isRankUpgrade(newRank, baselineRank) && !isRankUpgrade(newRank, previousRank)) {
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
        return;
      }

      if (baselineRank === newRank) return;

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

      setModal({ isOpen: true, rank: newRank });
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

  return (
    <RankUpModal
      isOpen={modal.isOpen}
      rank={modal.rank}
      onClose={() => setModal(DEFAULT_MODAL_STATE)}
    />
  );
}
