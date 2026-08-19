import { useEffect, useMemo, useState } from "react";
import Ably from "ably";
import { getFrontendApiOrigin } from "@/lib/apiBase";

const ABLY_AUTH_BASE = String(import.meta.env.VITE_ABLY_AUTH_BASE || "").trim();
const ENABLE_LOCAL_ABLY = String(import.meta.env.VITE_ENABLE_LOCAL_ABLY || "").trim() === "1";

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function isLocalBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return isLoopbackHost(window.location.hostname);
}

function shouldDisableLocalAbly(): boolean {
  // In Vite local dev, missing server-side ABLY_API_KEY creates noisy 500s from
  // /api/ably/token. Netlify/Railway/prod can still enable realtime normally.
  return isLocalBrowser() && !ABLY_AUTH_BASE && !ENABLE_LOCAL_ABLY;
}

function getAuthBase() {
  if (shouldDisableLocalAbly()) return "";

  if (ABLY_AUTH_BASE && /^https?:\/\//i.test(ABLY_AUTH_BASE)) {
    return ABLY_AUTH_BASE.replace(/\/$/, "");
  }
  const frontendApi = getFrontendApiOrigin();
  if (frontendApi) return frontendApi;
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

// Cache Ably connections per chainId to prevent multiple WebSockets being opened
// on the Home feed (Featured + Campaign Grid).
const CACHE = new Map<string, Entry>();

function channelNameFor(chainId: number) {
  return `league:${chainId}`;
}

function authUrlFor(chainId: number) {
  return `${getAuthBase()}/api/ably/token?chainId=${chainId}&scope=league`;
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
  const [connectionState, setConnectionState] = useState<string>("initialized");

  useEffect(() => {
    if (!enabled) {
      setEntry(null);
      setConnectionState("disabled");
      return;
    }
    if (shouldDisableLocalAbly()) {
      setEntry(null);
      setConnectionState("disabled_local_dev");
      return;
    }
    if (!getAuthBase()) {
      setEntry(null);
      setConnectionState("missing_base");
      return;
    }

    const e = acquire(chainId);
    setEntry(e);

    try {
      setConnectionState(e.client.connection.state);
    } catch {
      // ignore
    }

    // Track Ably connection health for self-heal fallback
    const onConn = () => {
      try {
        setConnectionState(e.client.connection.state);
      } catch {
        // ignore
      }
    };
    try {
      e.client.connection.on(onConn);
    } catch {
      // ignore
    }

    return () => {
      try {
        e.client.connection.off(onConn);
      } catch {
        // ignore
      }
      release(e.key);
    };
  }, [enabled, chainId]);

  return {
    client: entry?.client ?? null,
    channel: entry?.channel ?? null,
    channelName: entry?.channelName ?? null,
    ready: Boolean(entry && entry.client && entry.channel),
    missingBase: enabled && !getAuthBase(),
    cacheKey: key,
    connectionState,
    isConnected: connectionState === "connected",
  };
}
