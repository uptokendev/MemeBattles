import { useEffect, useMemo, useState } from "react";
import Ably from "ably";

// Realtime-indexer HTTP base (Railway). Example: https://upmeme-production.up.railway.app
const API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");

type Entry = {
  key: string;
  client: Ably.Realtime;
  channelName: string;
  channel: any;
  refs: number;
  closeTimer: any | null;
};

// Cache Ably connections per chainId to prevent multiple WebSockets being opened
// on the Home feed (Featured + Campaign Grid).
const CACHE = new Map<string, Entry>();

function channelNameFor(chainId: number) {
  return `league:${chainId}`;
}

function authUrlFor(chainId: number) {
  const base = String(API_BASE || "").replace(/\/$/, "");
  return `${base}/api/ably/token?chainId=${chainId}&scope=league`;
}

function acquire(chainId: number) {
  const key = `league:${chainId}`;
  const existing = CACHE.get(key);
  if (existing) {
    existing.refs += 1;
    if (existing.closeTimer) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
    }
    return existing;
  }

  const authUrl = authUrlFor(chainId);
  const client = new Ably.Realtime({
    authUrl,
    authMethod: "GET",
  });

  const chName = channelNameFor(chainId);
  const channel = client.channels.get(chName);

  // Rewind a short window so reconnects pick up recent updates.
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

export function useAblyLeagueChannel(opts: { enabled: boolean; chainId: number }) {
  const { enabled, chainId } = opts;

  const key = useMemo(() => {
    if (!enabled) return "";
    return `league:${chainId}`;
  }, [enabled, chainId]);

  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    if (!enabled) {
      setEntry(null);
      return;
    }
    if (!API_BASE) {
      setEntry(null);
      return;
    }

    const e = acquire(chainId);
    setEntry(e);

    return () => {
      release(e.key);
    };
  }, [enabled, chainId]);

  return {
    client: entry?.client ?? null,
    channel: entry?.channel ?? null,
    channelName: entry?.channelName ?? null,
    ready: Boolean(entry && entry.client && entry.channel),
    missingBase: enabled && !API_BASE,
    cacheKey: key,
  };
}
