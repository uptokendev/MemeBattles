import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ably from "ably";
import { toast } from "sonner";
import { useWallet } from "@/contexts/WalletContext";
import {
  buildRealtimeAuthUrl,
  clearStoredChatSession,
  fetchChatHistory,
  joinChatSession,
  loadStoredChatSession,
  normalizeAddress,
  saveStoredChatSession,
  sendChatMessage,
  type ChatMessage,
  type ChatSession,
} from "@/lib/chatApi";

const SCROLL_NEAR_BOTTOM_PX = 96;
const TYPING_IDLE_MS = 1400;

type PresenceView = {
  count: number;
  typingNames: string[];
};

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function roomChannelName(chainId: number, campaignAddress: string) {
  return `warroom:${chainId}:${normalizeAddress(campaignAddress)}`;
}

function shortAddress(addr?: string | null) {
  const value = String(addr ?? "").trim();
  if (!value) return "Unknown";
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();

  const add = (item: ChatMessage) => {
    const idKey = item.id ? `id:${String(item.id)}` : "";
    const nonceKey = item.clientNonce ? `nonce:${item.clientNonce}` : "";

    if (idKey && byKey.has(idKey)) {
      byKey.set(idKey, { ...byKey.get(idKey)!, ...item, pending: false, failed: false });
      return;
    }

    if (nonceKey && byKey.has(nonceKey)) {
      const existing = byKey.get(nonceKey)!;
      const merged = { ...existing, ...item, pending: false, failed: false };
      byKey.set(nonceKey, merged);
      if (idKey) byKey.set(idKey, merged);
      return;
    }

    const merged = { ...item };
    if (idKey) byKey.set(idKey, merged);
    if (nonceKey) byKey.set(nonceKey, merged);
    if (!idKey && !nonceKey) byKey.set(`fallback:${prev.length}:${incoming.length}:${Math.random()}`, merged);
  };

  prev.forEach(add);
  incoming.forEach(add);

  const seen = new Set<ChatMessage>();
  const flat = Array.from(byKey.values()).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });

  flat.sort((a, b) => {
    const at = new Date(a.createdAt ?? 0).getTime();
    const bt = new Date(b.createdAt ?? 0).getTime();
    if (at !== bt) return at - bt;
    return String(a.id).localeCompare(String(b.id));
  });
  return flat;
}

export function useWarRoom(args: { chainId: number; campaignAddress: string }) {
  const { chainId, campaignAddress } = args;
  const wallet = useWallet();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ChatSession | null>(null);
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<any>(null);
  const presenceTypingRef = useRef(false);
  const typingIdleTimerRef = useRef<number | null>(null);

  const normalizedCampaign = useMemo(() => normalizeAddress(campaignAddress), [campaignAddress]);
  const normalizedWallet = useMemo(() => normalizeAddress(wallet.account), [wallet.account]);
  const hasMore = Boolean(nextBeforeId);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!wallet.account) {
      setSession(null);
      return;
    }
    setSession(loadStoredChatSession(chainId, normalizedCampaign, wallet.account));
  }, [chainId, normalizedCampaign, wallet.account]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const recomputeNearBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    const delta = el.scrollHeight - el.scrollTop - el.clientHeight;
    return delta <= SCROLL_NEAR_BOTTOM_PX;
  }, []);

  const updatePresenceView = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel?.presence) {
      setOnlineCount(0);
      setTypingNames([]);
      return;
    }

    try {
      const members = await channel.presence.get();
      const unique = new Map<string, any>();
      for (const member of members || []) {
        const key = String(member.clientId || member.connectionId || "");
        if (!key) continue;
        unique.set(key, member);
      }
      const view: PresenceView = { count: unique.size, typingNames: [] };
      unique.forEach((member) => {
        const data = member.data || {};
        if (data.typing) {
          const label = String(data.displayName || shortAddress(member.clientId));
          view.typingNames.push(label);
        }
      });
      setOnlineCount(view.count);
      setTypingNames(view.typingNames.slice(0, 3));
    } catch {
      // ignore transient presence errors
    }
  }, []);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current && new Date(sessionRef.current.expiresAt).getTime() > Date.now()) {
      return sessionRef.current;
    }

    if (!wallet.account) {
      await wallet.connect();
    }
    if (!wallet.signer || !wallet.account) {
      throw new Error("Connect your wallet to join chat.");
    }

    const nextSession = await joinChatSession({
      chainId,
      campaignAddress: normalizedCampaign,
      walletAddress: wallet.account,
      signMessage: (message) => wallet.signer!.signMessage(message),
    });

    saveStoredChatSession(chainId, normalizedCampaign, wallet.account, nextSession);
    setSession(nextSession);
    sessionRef.current = nextSession;
    return nextSession;
  }, [wallet, chainId, normalizedCampaign]);

  const loadLatest = useCallback(async () => {
    if (!normalizedCampaign) return;
    setLoading(true);
    try {
      const result = await fetchChatHistory({ chainId, campaignAddress: normalizedCampaign, limit: 50 });
      setMessages(result.items);
      setNextBeforeId(result.nextBeforeId);
      requestAnimationFrame(() => scrollToBottom());
    } catch (e: any) {
      toast(e?.message || "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [chainId, normalizedCampaign, scrollToBottom]);

  const loadOlder = useCallback(async () => {
    if (!nextBeforeId || loadingOlder) return;
    const el = listRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const result = await fetchChatHistory({
        chainId,
        campaignAddress: normalizedCampaign,
        beforeId: nextBeforeId,
        limit: 50,
      });
      setMessages((prev) => mergeMessages(result.items, prev));
      setNextBeforeId(result.nextBeforeId);
      requestAnimationFrame(() => {
        if (!el) return;
        const nextHeight = el.scrollHeight;
        el.scrollTop = nextHeight - previousHeight + el.scrollTop;
      });
    } catch (e: any) {
      toast(e?.message || "Failed to load older messages");
    } finally {
      setLoadingOlder(false);
    }
  }, [chainId, normalizedCampaign, nextBeforeId, loadingOlder]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = recomputeNearBottom();
      setIsNearBottom(nearBottom);
      if (nearBottom) setUnreadCount(0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [recomputeNearBottom, messages.length]);

  useEffect(() => {
    const authUrl = buildRealtimeAuthUrl(chainId, normalizedCampaign);
    const client = new Ably.Realtime({
      authCallback: async (_params: any, callback: any) => {
        try {
          const headers: Record<string, string> = {};
          if (sessionRef.current?.sessionToken) {
            headers.authorization = `Bearer ${sessionRef.current.sessionToken}`;
          }
          const res = await fetch(authUrl, { method: "GET", headers });
          if (!res.ok) {
            const j = await readJson(res);
            throw new Error(j?.error || `Realtime auth failed (${res.status})`);
          }
          callback(null, await res.json());
        } catch (err) {
          callback(err, null);
        }
      },
      authMethod: "GET",
      autoConnect: true,
    });

    const channel = client.channels.get(roomChannelName(chainId, normalizedCampaign));
    ablyRef.current = client;
    channelRef.current = channel;

    const onMessage = (msg: any) => {
      const item = msg?.data as ChatMessage | undefined;
      if (!item) return;
      const shouldStick = recomputeNearBottom();
      setMessages((prev) => mergeMessages(prev, [item]));
      requestAnimationFrame(() => {
        if (shouldStick) {
          scrollToBottom("smooth");
        } else {
          setUnreadCount((count) => count + 1);
        }
      });
    };

    const onPresence = () => {
      void updatePresenceView();
    };

    channel.subscribe("message:new", onMessage);
    try { channel.attach(); } catch {}
    try {
      channel.presence.subscribe("enter", onPresence);
      channel.presence.subscribe("leave", onPresence);
      channel.presence.subscribe("update", onPresence);
    } catch {
      // ignore
    }

    const enterPresence = async () => {
      if (!sessionRef.current?.sessionToken || !wallet.account) {
        await updatePresenceView();
        return;
      }
      try {
        await channel.presence.enter({
          displayName: sessionRef.current.profile.displayName || shortAddress(wallet.account),
          role: sessionRef.current.profile.role,
          typing: false,
        });
      } catch {
        // ignore until authorized session exists
      }
      await updatePresenceView();
    };

    void enterPresence();

    return () => {
      if (typingIdleTimerRef.current) {
        window.clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      try { channel.presence.unsubscribe("enter", onPresence); } catch {}
      try { channel.presence.unsubscribe("leave", onPresence); } catch {}
      try { channel.presence.unsubscribe("update", onPresence); } catch {}
      try { channel.unsubscribe("message:new", onMessage); } catch {}
      try { channel.presence.leave(); } catch {}
      try { client.close(); } catch {}
      channelRef.current = null;
      ablyRef.current = null;
      presenceTypingRef.current = false;
    };
  }, [chainId, normalizedCampaign, session?.sessionToken, wallet.account, recomputeNearBottom, scrollToBottom, updatePresenceView]);

  const updateTypingState = useCallback(async (typing: boolean) => {
    const channel = channelRef.current;
    const currentSession = sessionRef.current;
    if (!channel?.presence || !currentSession?.sessionToken || !wallet.account) return;
    if (presenceTypingRef.current === typing) return;
    presenceTypingRef.current = typing;
    try {
      await channel.presence.update({
        displayName: currentSession.profile.displayName || shortAddress(wallet.account),
        role: currentSession.profile.role,
        typing,
      });
    } catch {
      // ignore
    }
  }, [wallet.account]);

  useEffect(() => {
    if (!session?.sessionToken || !wallet.account) return;
    const trimmed = input.trim();
    if (!trimmed) {
      void updateTypingState(false);
      return;
    }
    void updateTypingState(true);
    if (typingIdleTimerRef.current) window.clearTimeout(typingIdleTimerRef.current);
    typingIdleTimerRef.current = window.setTimeout(() => {
      void updateTypingState(false);
    }, TYPING_IDLE_MS);
    return () => {
      if (typingIdleTimerRef.current) {
        window.clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
    };
  }, [input, session?.sessionToken, wallet.account, updateTypingState]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    try {
      setSending(true);
      const activeSession = await ensureSession();
      const clientNonce = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const optimistic: ChatMessage = {
        id: `tmp:${clientNonce}`,
        walletAddress: normalizeAddress(wallet.account || activeSession.profile.walletAddress),
        displayName: activeSession.profile.displayName,
        avatarUrl: activeSession.profile.avatarUrl,
        role: activeSession.profile.role,
        message: trimmed,
        createdAt: new Date().toISOString(),
        clientNonce,
        pending: true,
      };

      setMessages((prev) => mergeMessages(prev, [optimistic]));
      setInput("");
      requestAnimationFrame(() => scrollToBottom("smooth"));
      void updateTypingState(false);

      const saved = await sendChatMessage({
        chainId,
        campaignAddress: normalizedCampaign,
        message: trimmed,
        clientNonce,
        sessionToken: activeSession.sessionToken,
      });

      setMessages((prev) => mergeMessages(prev, [saved]));
    } catch (e: any) {
      const message = e?.message || "Failed to send message";
      toast(message);
      setMessages((prev) => prev.map((item) => item.pending ? { ...item, pending: false, failed: true } : item));
      if (/unauthorized/i.test(String(message))) {
        clearStoredChatSession(chainId, normalizedCampaign, wallet.account);
        setSession(null);
        sessionRef.current = null;
      }
    } finally {
      setSending(false);
    }
  }, [input, sending, ensureSession, wallet.account, chainId, normalizedCampaign, scrollToBottom, updateTypingState]);

  const jumpToBottom = useCallback(() => {
    scrollToBottom("smooth");
    setUnreadCount(0);
  }, [scrollToBottom]);

  return {
    wallet,
    messages,
    loading,
    loadingOlder,
    sending,
    input,
    setInput,
    send,
    listRef,
    loadOlder,
    hasMore,
    onlineCount,
    typingNames,
    unreadCount,
    isNearBottom,
    jumpToBottom,
    ensureSession,
    session,
  };
}
