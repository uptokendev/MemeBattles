import { useEffect, useState } from "react";
import { fetchLeagueCabinet } from "@/lib/leagueCabinetApi";
import type { LeagueCabinet } from "@/lib/leagueCabinet";

export function useLeagueCabinet(chainId?: number, viewedAddress?: string | null) {
  const [leagueCabinet, setLeagueCabinet] = useState<LeagueCabinet | null>(null);
  const [loadingLeagueCabinet, setLoadingLeagueCabinet] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCabinet = async () => {
      if (!viewedAddress || !chainId) {
        setLeagueCabinet(null);
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

    loadCabinet();
    return () => {
      cancelled = true;
    };
  }, [chainId, viewedAddress]);

  return {
    leagueCabinet,
    loadingLeagueCabinet,
  };
}
