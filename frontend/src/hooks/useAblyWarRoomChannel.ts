import { useEffect, useMemo, useState } from "react";
import Ably from "ably";

const ABLY_AUTH_BASE = String(import.meta.env.VITE_ABLY_AUTH_BASE || "").trim();

function getAuthBase() {
  if (ABLY_AUTH_BASE && /^https?:\/\//i.test(ABLY_AUTH_BASE)) {
    return ABLY_AUTH_BASE.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }

  return "";
}

type Entry = {
  key: string;
  client: Ably.Realtime;
  channelName: string;
  channel: any;
  refs: number;
  closeTimer: any | null;
};

const CACHE = new Map<string, Entry>();

function channelNameFor(chainId: number, campaign: string) {
  return `warroom:${chainId}:${campaign.toLowerCase()}`;
}

function authUrlFor(chainId: number, campaign: string) {
  return `${getAuthBase()}/api/ably/token?chainId=${chainId}&campaign=${campaign.toLowerCase()}&scope=warroom`;
}

function acquire(chainId: number, campaign: string) {
  const key = `${chainId}:${campaign.toLowerCase()}`;
  const existing = CACHE.get(key);

  if (existing) {
    existing.refs += 1;

    if (existing.closeTimer) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
    }

    return existing;
  }

  const client = new Ably.Realtime({
    authUrl: authUrlFor(chainId, campaign),
    authMethod: "GET",
  });

  const channelName = channelNameFor(chainId, campaign);
  const channel = client.channels.get(channelName);

  try {
    channel.setOptions({ params: { rewind: "120s" } });
  } catch {
    // ignore
  }

  try {
    channel.attach();
  } catch {
    // ignore
  }

  const entry: Entry = {
    key,
    client,
    channelName,
    channel,
    refs: 1,
    closeTimer: null,
  };

  CACHE.set(key, entry);
  return entry;
}

function release(key: string) {
  const entry = CACHE.get(key);
  if (!entry) return;

  entry.refs -= 1;
  if (entry.refs > 0) return;

  entry.closeTimer = setTimeout(() => {
    try {
      entry.channel.unsubscribe();
    } catch {
      // ignore
    }

    try {
      entry.client.close();
    } catch {
      // ignore
    }

    CACHE.delete(key);
  }, 1500);
}

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

  const [entry, setEntry] = useState<Entry | null>(null);
  const [connectionState, setConnectionState] = useState<string>("initialized");

  useEffect(() => {
    if (!enabled || !campaignAddress) {
      setEntry(null);
      setConnectionState("disabled");
      return;
    }

    if (!getAuthBase()) {
      setEntry(null);
      setConnectionState("missing_base");
      return;
    }

    const e = acquire(chainId, campaignAddress);
    setEntry(e);

    try {
      setConnectionState(e.client.connection.state);
    } catch {
      // ignore
    }

    const onConnectionState = () => {
      try {
        setConnectionState(e.client.connection.state);
      } catch {
        // ignore
      }
    };

    try {
      e.client.connection.on(onConnectionState);
    } catch {
      // ignore
    }

    return () => {
      try {
        e.client.connection.off(onConnectionState);
      } catch {
        // ignore
      }

      release(e.key);
    };
  }, [enabled, chainId, campaignAddress]);

  return {
    client: entry?.client ?? null,
    channel: entry?.channel ?? null,
    channelName: entry?.channelName ?? null,
    ready: Boolean(entry && entry.client && entry.channel),
    missingBase: enabled && !!campaignAddress && !getAuthBase(),
    cacheKey: key,
    connectionState,
    isConnected: connectionState === "connected",
  };
}