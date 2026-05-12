import { useMemo } from "react";

// War Room realtime is temporarily disabled on the frontend because the current
// realtime-indexer Ably auth endpoint grants token:<chain>:<campaign> capability,
// while War Room subscribes to warroom:<chain>:<campaign>. Attaching anyway causes
// Ably 40160 console errors. War Room still works through the existing polling
// fallback in useWarRoom.ts.
//
// Re-enable this hook after /api/ably/token?scope=warroom grants subscribe access
// to warroom:<chain>:<campaign> on the realtime-indexer service.
export function useAblyWarRoomChannel(opts: {
  enabled: boolean;
  chainId: number;
  campaignAddress?: string;
}) {
  const { enabled, chainId, campaignAddress } = opts;

  const key = useMemo(() => {
    if (!enabled || !campaignAddress) return "";
    return `${chainId}:${campaignAddress.toLowerCase()}`;
  }, [enabled, chainId, campaignAddress]);

  return {
    client: null,
    channel: null,
    channelName: null,
    ready: false,
    missingBase: false,
    cacheKey: key,
    connectionState: enabled && campaignAddress ? "polling" : "disabled",
    isConnected: false,
  };
}
