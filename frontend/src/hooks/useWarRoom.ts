import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import {
  buildChatSessionMessage,
  fetchWarRoomHistory,
  joinWarRoom,
  sendWarRoomMessage,
  type ChatMessage,
  type ChatSession,
  getNonce,
} from "@/lib/chatApi";

const POLL_MS = 4000;

function normalizeAddress(value?: string | null) {
  const v = String(value ?? "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(v) ? v : "";
}

function sessionStorageKey(chainId: number, campaignAddress: string, walletAddress: string) {
  return `mwz:warroom:session:${chainId}:${campaignAddress.toLowerCase()}:${walletAddress.toLowerCase()}`;
}

function readStoredSession(chainId: number, campaignAddress: string, walletAddress: string): ChatSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sessionStorageKey(chainId, campaignAddress, walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionToken || !parsed?.profile?.walletAddress) return null;
    if (normalizeAddress(parsed.profile.walletAddress) !== normalizeAddress(walletAddress)) return null;
    if (!parsed.expiresAt || Date.now() > new Date(parsed.expiresAt).getTime()) return null;
    return parsed as ChatSession;
  } catch {
    return null;
  }
}

function writeStoredSession(chainId: number, campaignAddress: string, walletAddress: string, session: ChatSession | null) {
  if (typeof window === "undefined") return;
  const key = sessionStorageKey(chainId, campaignAddress, walletAddress);
  if (!session) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(session));
}

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map<string, ChatMessage>();
  for (const item of [...prev, ...incoming]) {
    const key = item.id ? `id:${item.id}` : item.clientNonce ? `nonce:${item.clientNonce}` : `${item.walletAddress}:${item.createdAt}:${item.message}`;
    const existing = map.get(key);
    map.set(key, { ...(existing || {}), ...item, pending: item.pending ?? existing?.pending, failed: item.failed ?? existing?.failed });
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function useWarRoom(args: { chainId: number; campaignAddress: string; creatorAddress?: string | null; }) {
  const wallet = useWallet();
  const roomAddress = useMemo(() => normalizeAddress(args.campaignAddress), [args.campaignAddress]);
  const walletAddress = useMemo(() => normalizeAddress(wallet.account), [wallet.account]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const pollRef = useRef<number | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!roomAddress) return;
    try {
      const data = await fetchWarRoomHistory({ chainId: args.chainId, campaignAddress: roomAddress, limit: 50 });
      setMessages((prev) => mergeMessages(prev, data.items));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load War Room");
    } finally {
      setLoading(false);
    }
  }, [args.chainId, roomAddress]);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!walletAddress || !roomAddress) {
      setSession(null);
      return;
    }
    setSession(readStoredSession(args.chainId, roomAddress, walletAddress));
  }, [args.chainId, roomAddress, walletAddress]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!roomAddress) return;
    pollRef.current = window.setInterval(() => {
      void refreshHistory();
    }, POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refreshHistory, roomAddress]);

  const ensureSession = useCallback(async () => {
    if (!wallet.isConnected || !wallet.signer || !walletAddress) {
      throw new Error("Connect your wallet first");
    }

    const signerAddress = normalizeAddress(await wallet.signer.getAddress());
    if (signerAddress !== walletAddress) {
      throw new Error("Active signer does not match the selected wallet account");
    }

    const existing = readStoredSession(args.chainId, roomAddress, walletAddress);
    if (existing) {
      setSession(existing);
      return existing;
    }

    setJoining(true);
    try {
      const nonce = await getNonce(args.chainId, walletAddress);
      const msg = buildChatSessionMessage({
        chainId: args.chainId,
        address: walletAddress,
        campaignAddress: roomAddress,
        nonce,
      });
      const signature = await wallet.signer.signMessage(msg);
      const nextSession = await joinWarRoom({
        chainId: args.chainId,
        campaignAddress: roomAddress,
        address: walletAddress,
        nonce,
        signature,
        creatorAddress: args.creatorAddress ?? undefined,
      });
      writeStoredSession(args.chainId, roomAddress, walletAddress, nextSession);
      setSession(nextSession);
      setError(null);
      return nextSession;
    } finally {
      setJoining(false);
    }
  }, [args.chainId, args.creatorAddress, roomAddress, wallet.isConnected, wallet.signer, walletAddress]);

  const postMessage = useCallback(async (text: string) => {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return;
    if (!wallet.isConnected) {
      window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
      return;
    }

    const activeSession = await ensureSession();
    const clientNonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic: ChatMessage = {
      id: Number.MAX_SAFE_INTEGER - Math.floor(Math.random() * 100000),
      chainId: args.chainId,
      campaignAddress: roomAddress,
      walletAddress,
      displayName: activeSession.profile.displayName ?? null,
      avatarUrl: activeSession.profile.avatarUrl ?? null,
      role: activeSession.profile.role ?? "trader",
      message: trimmed,
      clientNonce,
      createdAt: new Date().toISOString(),
      pending: true,
      failed: false,
    };

    setMessages((prev) => mergeMessages(prev, [optimistic]));
    setPosting(true);
    try {
      const result = await sendWarRoomMessage({
        chainId: args.chainId,
        campaignAddress: roomAddress,
        message: trimmed,
        clientNonce,
        sessionToken: activeSession.sessionToken,
      });
      setMessages((prev) => mergeMessages(prev.filter((m) => m.clientNonce !== clientNonce), [{ ...result.item, pending: false, failed: false }]));
      setError(null);
    } catch (e: any) {
      const msg = e?.message || "Failed to send message";
      if (/session/i.test(msg)) {
        writeStoredSession(args.chainId, roomAddress, walletAddress, null);
        setSession(null);
      }
      setMessages((prev) => prev.map((m) => (m.clientNonce === clientNonce ? { ...m, pending: false, failed: true } : m)));
      setError(msg);
      throw e;
    } finally {
      setPosting(false);
    }
  }, [args.chainId, ensureSession, roomAddress, wallet.isConnected, walletAddress]);

  return {
    messages,
    loading,
    joining,
    posting,
    error,
    isConnected: wallet.isConnected,
    walletAddress,
    hasSession: Boolean(session),
    joinRoom: ensureSession,
    postMessage,
    reload: refreshHistory,
  };
}
