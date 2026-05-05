import { useEffect, useMemo, useState } from "react";
import {
  clearPendingRankPromotion,
  getRankIndex,
  isRankUpgrade,
  normalizeRank,
  readPendingRankPromotion,
  readStoredRank,
  writePendingRankPromotion,
  writeStoredRank,
  type RankName,
} from "@/lib/ranks";

interface UseProfileRankArgs {
  profile: { rank?: unknown } | null;
  isOwnProfile: boolean;
  chainId?: number;
  viewedAddress: string | null;
}

export function useProfileRank({
  profile,
  isOwnProfile,
  chainId,
  viewedAddress,
}: UseProfileRankArgs) {
  const [liveRank, setLiveRank] = useState<RankName>("Recruit");
  const [rankPromotionModal, setRankPromotionModal] = useState<{ isOpen: boolean; rank: RankName }>({
    isOpen: false,
    rank: "Recruit",
  });

  const resolvedProfileRank = useMemo<RankName>(() => {
    const apiRankRaw = profile?.rank;
    const apiRank = apiRankRaw ? normalizeRank(apiRankRaw) : null;
    const storedOwnRank = isOwnProfile && chainId && viewedAddress
      ? readStoredRank(chainId, viewedAddress)
      : null;

    if (apiRank && storedOwnRank) {
      return getRankIndex(storedOwnRank) > getRankIndex(apiRank) ? storedOwnRank : apiRank;
    }

    if (apiRank) return apiRank;
    if (storedOwnRank) return storedOwnRank;
    return "Recruit";
  }, [profile, isOwnProfile, chainId, viewedAddress]);

  useEffect(() => {
    setLiveRank(resolvedProfileRank);
  }, [resolvedProfileRank]);

  useEffect(() => {
    if (!isOwnProfile || !chainId || !viewedAddress) return;

    const storedRank = readStoredRank(chainId, viewedAddress);
    const pendingPromotion = readPendingRankPromotion(chainId, viewedAddress);

    if (!storedRank) {
      writeStoredRank(chainId, viewedAddress, resolvedProfileRank);
      return;
    }

    if (isRankUpgrade(resolvedProfileRank, storedRank)) {
      const pendingNewRank = pendingPromotion ? normalizeRank(pendingPromotion.newRank) : null;
      if (!pendingPromotion || pendingNewRank !== resolvedProfileRank) {
        writePendingRankPromotion(chainId, viewedAddress, storedRank, resolvedProfileRank);
      }
      writeStoredRank(chainId, viewedAddress, resolvedProfileRank);
    }
  }, [isOwnProfile, chainId, viewedAddress, resolvedProfileRank]);

  useEffect(() => {
    if (!isOwnProfile || !chainId || !viewedAddress) {
      setRankPromotionModal({ isOpen: false, rank: "Recruit" });
      return;
    }

    const pendingPromotion = readPendingRankPromotion(chainId, viewedAddress);
    if (!pendingPromotion) return;

    const nextRank = normalizeRank(pendingPromotion.newRank);
    setRankPromotionModal((current) => {
      if (current.isOpen && current.rank === nextRank) return current;
      return { isOpen: true, rank: nextRank };
    });
  }, [isOwnProfile, chainId, viewedAddress]);

  useEffect(() => {
    const onRankUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail ?? {};
      const targetAddress = String(detail.address ?? "").trim().toLowerCase();
      if (!viewedAddress || targetAddress !== viewedAddress.toLowerCase()) return;
      setLiveRank(normalizeRank(detail.newRank ?? detail.rank));
    };

    window.addEventListener("mwz:rank-updated", onRankUpdated as EventListener);
    return () => window.removeEventListener("mwz:rank-updated", onRankUpdated as EventListener);
  }, [viewedAddress]);

  const handleCloseRankPromotionModal = () => {
    if (chainId && viewedAddress) {
      clearPendingRankPromotion(chainId, viewedAddress);
    }
    setRankPromotionModal({ isOpen: false, rank: "Recruit" });
  };

  return {
    liveRank,
    rankPromotionModal,
    resolvedProfileRank,
    handleCloseRankPromotionModal,
  };
}