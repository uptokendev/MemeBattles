// frontend/src/hooks/useLiveChannel.ts
import { useEffect, useMemo, useRef, useState } from "react";
import Ably from "ably";
import type { LiveChatDelete, LiveChatMessage, LiveChatMute, LiveChatUnmute } from "@/lib/liveChat";

const REALTIME_API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").trim();
const ABLY_AUTH_BASE = String(import.meta.env.VITE_ABLY_AUTH_BASE || "").trim();
const ENABLE_LOCAL_ABLY = String(import.meta.env.VITE_ENABLE_LOCAL_ABLY || "").trim() === "1";

function isLoopbackHost(h: string) {
  const n = h.trim().toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]";
}
function isLocalBrowser() {
  if (typeof window === "undefined") return false;
  return isLoopbackHost(window.location.hostname);
}
function shouldDisableLocalAbly() {
  return isLocalBrowser() && !ABLY_AUTH_BASE && !ENABLE_LOCAL_ABLY;
}
function getAuthBase() {
  if (shouldDisableLocalAbly()) return "";
  if (ABLY_AUTH_BASE && /^https?:\/\//i.test(ABLY_AUTH_BASE)) return ABLY_AUTH_BASE.replace(/\/$/, "");
  if (REALTIME_API_BASE && /^https?:\/\//i.test(REALTIME_API_BASE)) return REALTIME_API_BASE.replace(/\/$/, "");
  // Same-origin fallback so production (where /api/ably/token is co-hosted) works
  // without requiring VITE_ABLY_AUTH_BASE to be set — matches the existing
  // useAblyTokenChannel pattern for token-comment realtime.
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin.replace(/\/$/, "");
  return "";
}

type Options = {
  channelName: string;
  clientId: string;          // wallet address — used for presence identity
  enabled: boolean;          // false → don't connect (e.g. wallet not connected, feature flag off)
  historyLimit?: number;
};

export function useLiveChannel({ channelName, clientId, enabled, historyLimit = 50 }: Options) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [mutedWallets, setMutedWallets] = useState<Map<string, number | null>>(new Map());
  const [presenceCount, setPresenceCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const authBase = getAuthBase();
    if (!authBase) return; // local-dev with Ably disabled — no-op

    // Pass scope=live + the exact channel name so the token endpoint mints a
    // token with subscribe/publish/presence/history capabilities for THIS
    // channel (not the default subscribe-only campaign/token scope).
    const authUrl = `${authBase}/api/ably/token?scope=live&channel=${encodeURIComponent(channelName)}`;
    const client = new Ably.Realtime({
      authUrl,
      authMethod: "GET",
      clientId,
    });
    clientRef.current = client;

    const channel = client.channels.get(channelName);

    const handleConnected = () => setConnected(true);
    const handleClosed = () => setConnected(false);
    client.connection.on("connected", handleConnected);
    client.connection.on("disconnected", handleClosed);
    client.connection.on("closed", handleClosed);

    const onMessage = (msg: Ably.Message) => {
      const data = msg.data;
      if (data?.type === "delete") {
        const d = data as LiveChatDelete;
        setDeletedIds((prev) => {
          const next = new Set(prev);
          next.add(d.msgId);
          return next;
        });
        return;
      }
      if (data?.type === "mute") {
        const m = data as LiveChatMute;
        setMutedWallets((prev) => {
          const next = new Map(prev);
          next.set(m.wallet.toLowerCase(), m.until);
          return next;
        });
        return;
      }
      if (data?.type === "unmute") {
        const m = data as LiveChatUnmute;
        setMutedWallets((prev) => {
          const next = new Map(prev);
          next.delete(m.wallet.toLowerCase());
          return next;
        });
        return;
      }
      const m = data as LiveChatMessage;
      if (!m || !m.id) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    };

    channel.subscribe(onMessage);

    // history seed
    channel
      .history({ limit: historyLimit })
      .then((page) => {
        const seeded: LiveChatMessage[] = [];
        // Replay history in chronological order so later events override earlier
        // ones correctly (e.g. mute → unmute → re-mute lands in the right state).
        const items = [...page.items].reverse();
        for (const item of items) {
          const d = item.data;
          if (d?.type === "delete") {
            setDeletedIds((prev) => {
              const next = new Set(prev);
              next.add((d as LiveChatDelete).msgId);
              return next;
            });
          } else if (d?.type === "mute") {
            const mm = d as LiveChatMute;
            setMutedWallets((prev) => {
              const next = new Map(prev);
              next.set(mm.wallet.toLowerCase(), mm.until);
              return next;
            });
          } else if (d?.type === "unmute") {
            const mm = d as LiveChatUnmute;
            setMutedWallets((prev) => {
              const next = new Map(prev);
              next.delete(mm.wallet.toLowerCase());
              return next;
            });
          } else if (d?.id) {
            seeded.push(d as LiveChatMessage);
          }
        }
        setMessages((prev) => (prev.length === 0 ? seeded : prev));
      })
      .catch(() => { /* history is best-effort */ });

    // Expire temp mutes every 30s. Operator's right-rail in mw-dashboard ticks
    // at 1s for precision; viewers tolerate ~30s lag.
    const expiryInterval = window.setInterval(() => {
      setMutedWallets((prev) => {
        const now = Date.now();
        let mutated = false;
        const next = new Map(prev);
        for (const [w, until] of prev) {
          if (until !== null && until < now) {
            next.delete(w);
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });
    }, 30_000);

    // presence
    channel.presence.enter({ at: Date.now() }).catch(() => { /* ignore */ });
    const refreshPresence = async () => {
      try {
        const members = await channel.presence.get();
        setPresenceCount(members.length);
      } catch { /* ignore */ }
    };
    channel.presence.subscribe(["enter", "leave", "update"], refreshPresence);
    refreshPresence();

    return () => {
      window.clearInterval(expiryInterval);
      try { channel.presence.leave(); } catch {}
      channel.unsubscribe();
      client.connection.off();
      client.close();
      clientRef.current = null;
      setConnected(false);
      setPresenceCount(0);
    };
  }, [channelName, clientId, enabled, historyLimit]);

  const publish = useMemo(() => {
    return async (data: LiveChatMessage) => {
      const client = clientRef.current;
      if (!client) return;
      const channel = client.channels.get(channelName);
      await channel.publish("msg", data);
    };
  }, [channelName]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => !deletedIds.has(m.id)),
    [messages, deletedIds],
  );

  const isWalletMuted = (wallet: string): boolean => {
    if (!wallet) return false;
    const until = mutedWallets.get(wallet.toLowerCase());
    if (until === undefined) return false; // not muted
    if (until === null) return true;        // perma
    return until > Date.now();              // temp, still active
  };

  const getMuteExpiry = (wallet: string): number | null | undefined => {
    if (!wallet) return undefined;
    return mutedWallets.get(wallet.toLowerCase());
  };

  return {
    messages: visibleMessages,
    publish,
    presenceCount,
    connected,
    mutedWallets,
    isWalletMuted,
    getMuteExpiry,
  };
}
