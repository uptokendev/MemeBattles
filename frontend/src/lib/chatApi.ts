import { requestNonce } from "@/lib/profileApi";

export type ChatRole = "trader" | "creator" | "recruiter" | "mod";

export type ChatProfile = {
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ChatRole;
};

export type ChatSession = {
  sessionToken: string;
  expiresAt: string;
  profile: ChatProfile;
};

export type ChatMessage = {
  id: string;
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ChatRole;
  message: string;
  createdAt: string;
  replyToId?: string | null;
  clientNonce?: string | null;
  pending?: boolean;
  failed?: boolean;
};

const rawBase = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_BASE = rawBase.replace(/\/$/, "");

function buildUrl(pathWithQuery: string): string {
  if (API_BASE && /^https?:\/\//i.test(API_BASE)) {
    return `${API_BASE}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
  }
  return new URL(pathWithQuery, window.location.origin).toString();
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function normalizeAddress(addr?: string | null): string {
  return String(addr ?? "").trim().toLowerCase();
}

export function storageKey(chainId: number, campaignAddress: string, walletAddress?: string | null) {
  return `mwz:chat:session:${chainId}:${normalizeAddress(campaignAddress)}:${normalizeAddress(walletAddress)}`;
}

export function loadStoredChatSession(chainId: number, campaignAddress: string, walletAddress?: string | null): ChatSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(chainId, campaignAddress, walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatSession;
    const expiresAt = parsed?.expiresAt ? new Date(parsed.expiresAt).getTime() : 0;
    if (!parsed?.sessionToken || !expiresAt || expiresAt <= Date.now()) {
      sessionStorage.removeItem(storageKey(chainId, campaignAddress, walletAddress));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredChatSession(chainId: number, campaignAddress: string, walletAddress: string, session: ChatSession) {
  try {
    sessionStorage.setItem(storageKey(chainId, campaignAddress, walletAddress), JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearStoredChatSession(chainId: number, campaignAddress: string, walletAddress?: string | null) {
  try {
    sessionStorage.removeItem(storageKey(chainId, campaignAddress, walletAddress));
  } catch {
    // ignore
  }
}

export function buildChatJoinMessage(args: {
  chainId: number;
  address: string;
  campaignAddress: string;
  nonce: string;
}) {
  return [
    "MemeBattles War Room",
    "Action: CHAT_JOIN",
    `ChainId: ${args.chainId}`,
    `Address: ${normalizeAddress(args.address)}`,
    `Campaign: ${normalizeAddress(args.campaignAddress)}`,
    `Nonce: ${args.nonce}`,
  ].join("\n");
}

export async function joinChatSession(args: {
  chainId: number;
  campaignAddress: string;
  walletAddress: string;
  signMessage: (message: string) => Promise<string>;
}): Promise<ChatSession> {
  const nonce = await requestNonce(args.chainId, args.walletAddress);
  const message = buildChatJoinMessage({
    chainId: args.chainId,
    address: args.walletAddress,
    campaignAddress: args.campaignAddress,
    nonce,
  });
  const signature = await args.signMessage(message);

  const res = await fetch(buildUrl("/api/chat/join"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chainId: args.chainId,
      campaignAddress: normalizeAddress(args.campaignAddress),
      address: normalizeAddress(args.walletAddress),
      nonce,
      signature,
    }),
  });

  if (!res.ok) {
    const j = await readJson(res);
    throw new Error(j?.error || `Failed to join chat (${res.status})`);
  }

  const j = await readJson(res);
  const session: ChatSession = {
    sessionToken: String(j?.sessionToken ?? ""),
    expiresAt: String(j?.expiresAt ?? ""),
    profile: {
      walletAddress: normalizeAddress(j?.profile?.walletAddress ?? args.walletAddress),
      displayName: (j?.profile?.displayName ?? null) as string | null,
      avatarUrl: (j?.profile?.avatarUrl ?? null) as string | null,
      role: ((j?.profile?.role ?? "trader") as ChatRole),
    },
  };
  if (!session.sessionToken) throw new Error("Session token missing");
  return session;
}

export async function fetchChatHistory(args: {
  chainId: number;
  campaignAddress: string;
  beforeId?: string | number | null;
  limit?: number;
}): Promise<{ items: ChatMessage[]; nextBeforeId: string | null }> {
  const params = new URLSearchParams({
    chainId: String(args.chainId),
    campaignAddress: normalizeAddress(args.campaignAddress),
    limit: String(args.limit ?? 50),
  });
  if (args.beforeId != null) params.set("beforeId", String(args.beforeId));

  const res = await fetch(buildUrl(`/api/chat/history?${params.toString()}`), { method: "GET" });
  if (!res.ok) {
    const j = await readJson(res);
    throw new Error(j?.error || `Failed to load chat (${res.status})`);
  }

  const j = await readJson(res);
  return {
    items: Array.isArray(j?.items) ? (j.items as ChatMessage[]) : [],
    nextBeforeId: j?.nextBeforeId == null ? null : String(j.nextBeforeId),
  };
}

export async function sendChatMessage(args: {
  chainId: number;
  campaignAddress: string;
  message: string;
  clientNonce: string;
  sessionToken: string;
}): Promise<ChatMessage> {
  const res = await fetch(buildUrl("/api/chat/send"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.sessionToken}`,
    },
    body: JSON.stringify({
      chainId: args.chainId,
      campaignAddress: normalizeAddress(args.campaignAddress),
      message: args.message,
      clientNonce: args.clientNonce,
    }),
  });

  if (!res.ok) {
    const j = await readJson(res);
    throw new Error(j?.error || `Failed to send message (${res.status})`);
  }

  const j = await readJson(res);
  return j?.item as ChatMessage;
}

export function buildRealtimeAuthUrl(chainId: number, campaignAddress: string) {
  const params = new URLSearchParams({
    chainId: String(chainId),
    campaignAddress: normalizeAddress(campaignAddress),
  });
  return buildUrl(`/api/chat/realtime-token?${params.toString()}`);
}
