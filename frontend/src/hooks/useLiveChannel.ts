// frontend/src/hooks/useLiveChannel.ts
import { useEffect, useMemo, useRef, useState } from "react";
import Ably from "ably";
import type { LiveChatDelete, LiveChatMessage } from "@/lib/liveChat";

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
  const [presenceCount, setPresenceCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const authBase = getAuthBase();
    if (!authBase) return; // local-dev with Ably disabled — no-op

    const client = new Ably.Realtime({
      authUrl: `${authBase}/api/ably/token`,
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
        for (const item of page.items) {
          const d = item.data;
          if (d?.type === "delete") {
            setDeletedIds((prev) => {
              const next = new Set(prev);
              next.add((d as LiveChatDelete).msgId);
              return next;
            });
          } else if (d?.id) {
            seeded.push(d as LiveChatMessage);
          }
        }
        // history returns newest-first; flip to chronological
        seeded.reverse();
        setMessages((prev) => (prev.length === 0 ? seeded : prev));
      })
      .catch(() => { /* history is best-effort */ });

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

  return { messages: visibleMessages, publish, presenceCount, connected };
}
