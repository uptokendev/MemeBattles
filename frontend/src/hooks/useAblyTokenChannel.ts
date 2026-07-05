import { useEffect, useMemo, useState } from "react";
import Ably from "ably";
import { isAddress } from "ethers";
import { isEvmChainId } from "@/lib/chainConfig";

// Token realtime belongs to the realtime-indexer Railway service.
const REALTIME_API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").trim();
const ABLY_AUTH_BASE = String(import.meta.env.VITE_ABLY_AUTH_BASE || "").trim();

function getAuthBase() {
  if (REALTIME_API_BASE && /^https?:\/\//i.test(REALTIME_API_BASE)) {
    return REALTIME_API_BASE.replace(/\/$/, "");
  }
  if (ABLY_AUTH_BASE && /^https?:\/\//i.test(ABLY_AUTH_BASE)) {
    return ABLY_AUTH_BASE.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}

function isRealtimeCampaignAddress(chainId: number, campaign: string) {
  const raw = String(campaign || "").trim();
  return isEvmChainId(chainId) && isAddress(raw);
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
  return `token:${chainId}:${campaign.toLowerCase()}`;
}

function authUrlFor(chainId: number, campaign: string) {
  return `${getAuthBase()}/api/ably/token?chainId=${chainId}&campaign=${campaign.toLowerCase()}`;
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

export function useAblyTokenChannel(opts: {
  enabled: boolean;
  chainId: number;
  campaignAddress?: string;
}) {
  const { enabled, chainId, campaignAddress } = opts;
  const canOpenChannel = enabled && !!campaignAddress && isRealtimeCampaignAddress(chainId, campaignAddress);

  const key = useMemo(() => {
    if (!canOpenChannel || !campaignAddress) return "";
    return `${chainId}:${campaignAddress.toLowerCase()}`;
  }, [canOpenChannel, chainId, campaignAddress]);

  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    if (!canOpenChannel || !campaignAddress) {
      setEntry(null);
      return;
    }
    if (!getAuthBase()) {
      setEntry(null);
      return;
    }
    const e = acquire(chainId, campaignAddress);
    setEntry(e);
    return () => {
      release(e.key);
    };
  }, [canOpenChannel, chainId, campaignAddress]);

  return {
    client: entry?.client ?? null,
    channel: entry?.channel ?? null,
    channelName: entry?.channelName ?? null,
    ready: Boolean(entry && entry.client && entry.channel),
    missingBase: canOpenChannel && !getAuthBase(),
    cacheKey: key,
  };
}
