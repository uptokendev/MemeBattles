import Ably from "ably";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JsonRpcSigner } from "ethers";
import {
  clearStoredChatSession,
  fetchChatHistory,
  getStoredChatSession,
  joinChatSession,
  realtimeTokenUrl,
  sendChatMessage,
  type ChatSession,
  type WarRoomMessage,
} from "@/lib/chatApi";

type UseWarRoomParams = {
  chainId: number;
  campaignAddress: string;
  walletAddress?: string | null;
  signer?: JsonRpcSigner | null;
  connectWallet?: () => Promise<void>;
};

function makeNonce() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessage(input: WarRoomMessage): WarRoomMessage {
  const id = String(input.id || (input.clientNonce ? `optimistic:${input.clientNonce}` : makeNonce()));
  return {
    ...input,
    id,
    chainId: Number(input.chainId),
    campaignAddress: String(input.campaignAddress || "").toLowerCase(),
    walletAddress: String(input.walletAddress || "").toLowerCase(),
    clientNonce: input.clientNonce || null,
  };
}

function isSameMessage(a: WarRoomMessage, b: WarRoomMessage) {
  const aId = String(a.id || "");
  const bId = String(b.id || "");
  if (aId && bId && aId === bId) return true;

  const aNonce = a.clientNonce ? String(a.clientNonce) : "";
  const bNonce = b.clientNonce ? String(b.clientNonce) : "";
  if (aNonce && bNonce && aNonce === bNonce) return true;

  // Last-resort guard for messages that arrive without a nonce from a legacy deploy.
  if (
    a.walletAddress?.toLowerCase?.() === b.walletAddress?.toLowerCase?.() &&
    String(a.message ?? "").trim() === String(b.message ?? "").trim()
  ) {
    const at = Date.parse(String(a.createdAt || ""));
    const bt = Date.parse(String(b.createdAt || ""));
    if (Number.isFinite(at) && Number.isFinite(bt) && Math.abs(at - bt) < 2500) return true;
  }

  return false;
}

function mergeOne(list: WarRoomMessage[], nextRaw: WarRoomMessage) {
  const next = normalizeMessage(nextRaw);
  const idx = list.findIndex((item) => isSameMessage(item, next));

  if (idx >= 0) {
    const copy = [...list];
    copy[idx] = {
      ...copy[idx],
      ...next,
      // A server/realtime copy should clear optimistic state.
      pending: next.pending ?? false,
      failed: next.failed ?? false,
    };
    return copy;
  }

  return [...list, next].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function mergeMany(existing: WarRoomMessage[], incoming: WarRoomMessage[]) {
  return incoming.reduce((acc, msg) => mergeOne(acc, msg), existing);
}

export function useWarRoom({ chainId, campaignAddress, walletAddress, signer, connectWallet }: UseWarRoomParams) {
  const [messages, setMessages] = useState<WarRoomMessage[]>([]);
  const [input, setInput] = useState("");
  const [session, setSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingWallets, setTypingWallets] = useState<string[]>([]);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const listRef = useRef<HTMLDivElement | null>(null);
  const ablyRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const sessionRef = useRef<ChatSession | null>(null);
  const nearBottomRef = useRef(true);
  const typingTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const normalizedCampaign = useMemo(() => String(campaignAddress || "").toLowerCase(), [campaignAddress]);
  const normalizedWallet = useMemo(() => String(walletAddress || "").toLowerCase(), [walletAddress]);
  const roomChannelName = useMemo(() => `warroom:${Number(chainId)}:${normalizedCampaign}`, [chainId, normalizedCampaign]);

  const jumpToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    nearBottomRef.current = true;
    setIsNearBottom(true);
    setUnreadCount(0);
  }, []);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottomRef.current = near;
    setIsNearBottom(near);
    if (near) setUnreadCount(0);
  }, []);

  const ensureSession = useCallback(async () => {
    if (!normalizedWallet) {
      if (connectWallet) await connectWallet();
      throw new Error("Connect wallet to use War Room.");
    }
    if (!signer) throw new Error("Wallet signer is not ready yet.");

    const cached = getStoredChatSession(chainId, normalizedCampaign, normalizedWallet);
    if (cached?.sessionToken) {
      sessionRef.current = cached;
      setSession(cached);
      return cached;
    }

    const fresh = await joinChatSession({
      chainId,
      campaignAddress: normalizedCampaign,
      walletAddress: normalizedWallet,
      signer,
    });
    sessionRef.current = fresh;
    setSession(fresh);
    return fresh;
  }, [chainId, normalizedCampaign, normalizedWallet, signer, connectWallet]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setMessages([]);
    setNextCursor(null);
    setError(null);

    fetchChatHistory({ chainId, campaignAddress: normalizedCampaign, limit: 50 })
      .then((data) => {
        if (!mountedRef.current) return;
        setMessages(mergeMany([], data.messages || []));
        setNextCursor(data.nextCursor || null);
        requestAnimationFrame(jumpToBottom);
      })
      .catch((e) => mountedRef.current && setError(e?.message || "Could not load War Room"))
      .finally(() => mountedRef.current && setLoading(false));

    return () => {
      mountedRef.current = false;
    };
  }, [chainId, normalizedCampaign, jumpToBottom]);

  useEffect(() => {
    if (!normalizedWallet) {
      setSession(null);
      sessionRef.current = null;
      return;
    }
    const cached = getStoredChatSession(chainId, normalizedCampaign, normalizedWallet);
    setSession(cached);
    sessionRef.current = cached;
  }, [chainId, normalizedCampaign, normalizedWallet]);

  useEffect(() => {
    let cancelled = false;

    async function connectRealtime() {
      if (!session?.sessionToken || !normalizedCampaign) return;

      const ably = new Ably.Realtime({
        authCallback: async (_params: any, callback: any) => {
          try {
            const res = await fetch(
              realtimeTokenUrl({ chainId, campaignAddress: normalizedCampaign, sessionToken: session.sessionToken }),
              { headers: { authorization: `Bearer ${session.sessionToken}` } }
            );
            const tokenRequest = await res.json();
            if (!res.ok) throw new Error(tokenRequest?.error || "Realtime auth failed");
            callback(null, tokenRequest);
          } catch (e: any) {
            callback(e, null);
          }
        },
      });

      if (cancelled) {
        ably.close();
        return;
      }

      ablyRef.current = ably;
      const channel = ably.channels.get(roomChannelName);
      channelRef.current = channel;

      const onMessage = (msg: any) => {
        const data = msg.data as WarRoomMessage;
        if (!data) return;
        setMessages((current) => mergeOne(current, data));
        if (nearBottomRef.current) {
          requestAnimationFrame(jumpToBottom);
        } else if (String(data.walletAddress || "").toLowerCase() !== normalizedWallet) {
          setUnreadCount((n) => n + 1);
        }
      };

      const updatePresence = async () => {
        try {
          const members = await channel.presence.get();
          if (cancelled) return;
          const unique = new Set(members.map((m) => String(m.clientId || m.id || "")).filter(Boolean));
          setOnlineCount(unique.size);
          const typing = members
            .filter((m) => (m.data as any)?.typing)
            .map((m) => String(m.clientId || ""))
            .filter((id) => id && id.toLowerCase() !== normalizedWallet);
          setTypingWallets(Array.from(new Set(typing)).slice(0, 3));
        } catch {
          // ignore presence read failures; messages still work
        }
      };

      channel.subscribe("message:new", onMessage);
      channel.presence.subscribe("enter", updatePresence);
      channel.presence.subscribe("leave", updatePresence);
      channel.presence.subscribe("update", updatePresence);

      try {
        await channel.presence.enter({ typing: false });
        await updatePresence();
      } catch {
        // presence is nice-to-have
      }
    }

    connectRealtime();

    return () => {
      cancelled = true;
      const channel = channelRef.current;
      if (channel) {
        try { channel.unsubscribe(); } catch {}
        try { channel.presence.leave(); } catch {}
      }
      channelRef.current = null;
      if (ablyRef.current) {
        try { ablyRef.current.close(); } catch {}
      }
      ablyRef.current = null;
      setOnlineCount(0);
      setTypingWallets([]);
    };
  }, [chainId, normalizedCampaign, normalizedWallet, roomChannelName, session?.sessionToken, jumpToBottom]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor) return;
    const el = listRef.current;
    const beforeHeight = el?.scrollHeight ?? 0;
    const data = await fetchChatHistory({ chainId, campaignAddress: normalizedCampaign, before: nextCursor, limit: 50 });
    setMessages((current) => mergeMany(data.messages || [], current));
    setNextCursor(data.nextCursor || null);
    requestAnimationFrame(() => {
      const currentEl = listRef.current;
      if (!currentEl) return;
      currentEl.scrollTop = currentEl.scrollHeight - beforeHeight;
    });
  }, [chainId, normalizedCampaign, nextCursor]);

  const sendTyping = useCallback((typing: boolean) => {
    const channel = channelRef.current;
    if (!channel) return;
    try {
      channel.presence.update({ typing });
    } catch {
      // ignore
    }
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    sendTyping(Boolean(value.trim()));
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => sendTyping(false), 1800);
  }, [sendTyping]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setSending(true);
    sendTyping(false);

    const clientNonce = makeNonce();
    const now = new Date().toISOString();
    const optimistic: WarRoomMessage = {
      id: `optimistic:${clientNonce}`,
      chainId,
      campaignAddress: normalizedCampaign,
      walletAddress: normalizedWallet,
      displayName: sessionRef.current?.profile?.displayName || null,
      avatarUrl: sessionRef.current?.profile?.avatarUrl || null,
      role: sessionRef.current?.profile?.role || "trader",
      message: text,
      createdAt: now,
      clientNonce,
      pending: true,
    };

    setInput("");
    setMessages((current) => mergeOne(current, optimistic));
    requestAnimationFrame(jumpToBottom);

    try {
      const activeSession = sessionRef.current || await ensureSession();
      const saved = await sendChatMessage({
        chainId,
        campaignAddress: normalizedCampaign,
        sessionToken: activeSession.sessionToken,
        message: text,
        clientNonce,
      });
      setMessages((current) => mergeOne(current, { ...saved, clientNonce, pending: false, failed: false }));
      requestAnimationFrame(jumpToBottom);
    } catch (e: any) {
      if (/session/i.test(String(e?.message || "")) && normalizedWallet) {
        clearStoredChatSession(chainId, normalizedCampaign, normalizedWallet);
        setSession(null);
        sessionRef.current = null;
      }
      setMessages((current) =>
        current.map((m) => (m.clientNonce === clientNonce ? { ...m, pending: false, failed: true } : m))
      );
      setError(e?.message || "Could not send message");
    } finally {
      setSending(false);
    }
  }, [chainId, ensureSession, input, jumpToBottom, normalizedCampaign, normalizedWallet, sending, sendTyping]);

  const typingLabel = useMemo(() => {
    if (!typingWallets.length) return "";
    if (typingWallets.length === 1) return `${typingWallets[0].slice(0, 6)}…${typingWallets[0].slice(-4)} is typing`;
    return `${typingWallets.length} soldiers are typing`;
  }, [typingWallets]);

  return {
    messages,
    input,
    setInput: handleInputChange,
    loading,
    sending,
    error,
    session,
    onlineCount,
    typingLabel,
    listRef,
    isNearBottom,
    unreadCount,
    hasMore: Boolean(nextCursor),
    onScroll,
    jumpToBottom,
    loadOlder,
    sendMessage,
  };
}
