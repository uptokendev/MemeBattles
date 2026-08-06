import { useCallback, useEffect, useState } from "react";
import { fetchLeagueCabinet } from "@/lib/leagueCabinetApi";
import type { LeagueCabinet } from "@/lib/leagueCabinet";

export function useLeagueCabinet(chainId?: number, viewedAddress?: string | null) {
  const [leagueCabinet, setLeagueCabinet] = useState<LeagueCabinet | null>(null);
  const [loadingLeagueCabinet, setLoadingLeagueCabinet] = useState(false);

  const loadCabinet = useCallback(async () => {
    if (!viewedAddress || !chainId) {
      setLeagueCabinet(null);
      return;
    }

    setLoadingLeagueCabinet(true);
    try {
      const cabinet = await fetchLeagueCabinet(chainId, viewedAddress);
      setLeagueCabinet(cabinet);
    } catch (e) {
      console.warn("Failed to load profile cabinet", e);
      setLeagueCabinet(null);
    } finally {
      setLoadingLeagueCabinet(false);
    }
  }, [chainId, viewedAddress]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!viewedAddress || !chainId) {
        if (!cancelled) setLeagueCabinet(null);
        return;
      }

      setLoadingLeagueCabinet(true);
      try {
        const cabinet = await fetchLeagueCabinet(chainId, viewedAddress);
        if (!cancelled) setLeagueCabinet(cabinet);
      } catch (e) {
        console.warn("Failed to load profile cabinet", e);
        if (!cancelled) setLeagueCabinet(null);
      } finally {
        if (!cancelled) setLoadingLeagueCabinet(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [chainId, viewedAddress]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleClaimRecorded = () => {
      void loadCabinet();
    };

    window.addEventListener("memewarzone:league-claim-recorded", handleClaimRecorded);
    return () => {
      window.removeEventListener("memewarzone:league-claim-recorded", handleClaimRecorded);
    };
  }, [loadCabinet]);

  return {
    leagueCabinet,
    loadingLeagueCabinet,
    reloadLeagueCabinet: loadCabinet,
  };
}
