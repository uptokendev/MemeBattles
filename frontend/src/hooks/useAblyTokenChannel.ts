import { useEffect, useMemo, useState } from "react";
import Ably from "ably";
import { isAddress } from "ethers";
import { isEvmChainId, isSolanaChainId } from "@/lib/chainConfig";

// Token realtime belongs to the realtime-indexer Railway service.
const REALTIME_API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").trim();
const ABLY_AUTH_BASE = String(import.meta.env.VITE_ABLY_AUTH_BASE || "").trim();
const AUTH_PREFLIGHT_TIMEOUT_MS = 6_000;
const AUTH_PREFLIGHT_SUCCESS_TTL_MS = 60_000;
const AUTH_PREFLIGHT_FAILURE_TTL_MS = 15_000;
const CLOSE_GRACE_MS = 15_000;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

function normalizeCampaign(chainId: number, campaign: string) {
  const raw = String(campaign || "").trim();
  return isSolanaChainId(chainId) ? raw : raw.toLowerCase();
}

function isRealtimeCampaignAddress(chainId: number, campaign: string) {
  const raw = normalizeCampaign(chainId, campaign);
  if (isSolanaChainId(chainId)) return SOLANA_ADDRESS_RE.test(raw);
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

type PreflightEntry = {
  expiresAt: number;
  promise: Promise<boolean>;
};

const CACHE = new Map<string, Entry>();
const PREFLIGHT_CACHE = new Map<string, PreflightEntry>();

function channelNameFor(chainId: number, campaign: string) {
  return `token:${chainId}:${normalizeCampaign(chainId, campaign)}`;
}

function authUrlFor(chainId: number, campaign: string) {
  const normalized = normalizeCampaign(chainId, campaign);
  return `${getAuthBase()}/api/ably/token?chainId=${chainId}&campaign=${encodeURIComponent(normalized)}`;
}

function authPreflight(authUrl: string): Promise<boolean> {
  const cached = PREFLIGHT_CACHE.get(authUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), AUTH_PREFLIGHT_TIMEOUT_MS);
    try {
      const response = await fetch(authUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const body = await response.json().catch(() => null);
      return Boolean(body && (body.keyName || body.token || body.mac));
    } catch {
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  })();

  const entry: PreflightEntry = {
    expiresAt: Date.now() + AUTH_PREFLIGHT_SUCCESS_TTL_MS,
    promise,
  };
  PREFLIGHT_CACHE.set(authUrl, entry);
  void promise.then((ok) => {
    entry.expiresAt = Date.now() + (ok ? AUTH_PREFLIGHT_SUCCESS_TTL_MS : AUTH_PREFLIGHT_FAILURE_TTL_MS);
  });
  return promise;
}

function acquire(chainId: number, campaign: string) {
  const normalized = normalizeCampaign(chainId, campaign);
  const key = `${chainId}:${normalized}`;
  const existing = CACHE.get(key);
  if (existing) {
    existing.refs += 1;
    if (existing.closeTimer) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
    }
    return existing;
  }

  const authUrl = authUrlFor(chainId, normalized);
  const client = new Ably.Realtime({
    authUrl,
    authMethod: "GET",
    disconnectedRetryTimeout: 30_000,
    suspendedRetryTimeout: 60_000,
  });

  const chName = channelNameFor(chainId, normalized);
  const channel = client.channels.get(chName);

  try {
    channel.setOptions({ params: { rewind: "120s" } });
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
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0) return;

  entry.closeTimer = setTimeout(() => {
    const current = CACHE.get(key);
    if (!current || current !== entry || current.refs > 0) return;
    try {
      current.channel.unsubscribe();
    } catch {
      // ignore
    }
    try {
      current.client.close();
    } catch {
      // ignore
    }
    CACHE.delete(key);
  }, CLOSE_GRACE_MS);
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
    return `${chainId}:${normalizeCampaign(chainId, campaignAddress)}`;
  }, [canOpenChannel, chainId, campaignAddress]);

  const [entry, setEntry] = useState<Entry | null>(null);
  const [authUnavailable, setAuthUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!canOpenChannel || !campaignAddress) {
      setEntry(null);
      setAuthUnavailable(false);
      return;
    }
    if (!getAuthBase()) {
      setEntry(null);
      setAuthUnavailable(true);
      return;
    }

    const authUrl = authUrlFor(chainId, campaignAddress);
    void authPreflight(authUrl).then((available) => {
      if (cancelled) return;
      if (!available) {
        setEntry(null);
        setAuthUnavailable(true);
        return;
      }
      const acquired = acquire(chainId, campaignAddress);
      setAuthUnavailable(false);
      setEntry(acquired);
    });

    return () => {
      cancelled = true;
      const cached = CACHE.get(key);
      if (cached) release(key);
    };
  }, [canOpenChannel, chainId, campaignAddress, key]);

  return {
    client: entry?.client ?? null,
    channel: entry?.channel ?? null,
    channelName: entry?.channelName ?? null,
    ready: Boolean(entry && entry.client && entry.channel),
    missingBase: canOpenChannel && (!getAuthBase() || authUnavailable),
    cacheKey: key,
  };
}
