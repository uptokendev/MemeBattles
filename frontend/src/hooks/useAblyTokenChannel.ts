import { useEffect, useMemo, useState } from "react";
import Ably from "ably";

// Realtime-indexer HTTP base (Railway). Example: https://memebattles-production.up.railway.app
const API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");

type Entry = {
  key: string;
  client: Ably.Realtime;
  channelName: string;
  channel: any;
  refs: number;
  closeTimer: any | null;
};

// Cache Ably connections per (chainId,campaign) to prevent multiple WebSockets
// being opened/closed within the same page. This eliminates the "reload" feel
// and prevents "WebSocket is closed before the connection is established" noise.
const CACHE = new Map<string, Entry>();

function channelNameFor(chainId: number, campaign: string) {
  return `token:${chainId}:${campaign.toLowerCase()}`;
}

function authUrlFor(chainId: number, campaign: string) {
  const base = String(API_BASE || "").replace(/\/$/, "");
  return `${base}/api/ably/token?chainId=${chainId}&campaign=${campaign.toLowerCase()}`;
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

  const authUrl = authUrlFor(chainId, campaign);
  const client = new Ably.Realtime({
    authUrl,
    authMethod: "GET",
  });

  const chName = channelNameFor(chainId, campaign);
  const channel = client.channels.get(chName);

  // Rewind a short window so reconnects pick up recent updates.
  // This is safe even if publish frequency is low.
  try {
    channel.setOptions({ params: { rewind: "120s" } });
  } catch {
    // ignore
  }

  // Attach eagerly
  try {
    channel.attach();
  } catch {
    // ignore
  }

  const entry: Entry = {
    key,
    client,
    channelName: chName,
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

  // Delay close slightly to avoid rapid open/close cycles during React rerenders
  // and route transitions, which can trigger "closed before established".
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

export function useAblyTokenChannel(opts: {
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

  useEffect(() => {
    if (!enabled || !campaignAddress) {
      setEntry(null);
      return;
    }
    if (!API_BASE) {
      setEntry(null);
      return;
    }
    const e = acquire(chainId, campaignAddress);
    setEntry(e);
    return () => {
      release(e.key);
    };
  }, [enabled, chainId, campaignAddress]);

  return {
    client: entry?.client ?? null,
    channel: entry?.channel ?? null,
    channelName: entry?.channelName ?? null,
    ready: Boolean(entry && entry.client && entry.channel),
    missingBase: enabled && !!campaignAddress && !API_BASE,
    cacheKey: key,
  };
}
