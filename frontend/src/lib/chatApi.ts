import type { JsonRpcSigner } from "ethers";

export type WarRoomRole = "trader" | "creator" | "recruiter" | "mod";

export type WarRoomProfile = {
  walletAddress: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: WarRoomRole | string | null;
};

export type WarRoomMessage = {
  id: string;
  chainId: number;
  campaignAddress: string;
  walletAddress: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: WarRoomRole | string | null;
  message: string;
  createdAt: string;
  clientNonce?: string | null;
  replyToId?: string | null;
  pending?: boolean;
  failed?: boolean;
};

export type ChatSession = {
  sessionToken: string;
  expiresAt?: string | null;
  profile?: WarRoomProfile | null;
};

const CHAT_SESSION_PREFIX = "mwz_chat_session";

function apiPath(path: string) {
  return `/api/chat/${path.replace(/^\//, "")}`;
}

function sessionKey(chainId: number, campaignAddress: string, walletAddress: string) {
  return `${CHAT_SESSION_PREFIX}:${chainId}:${campaignAddress.toLowerCase()}:${walletAddress.toLowerCase()}`;
}

export function getStoredChatSession(chainId: number, campaignAddress: string, walletAddress: string): ChatSession | null {
  if (typeof window === "undefined" || !walletAddress) return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(chainId, campaignAddress, walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatSession;
    if (!parsed?.sessionToken) return null;
    const expires = parsed.expiresAt ? new Date(parsed.expiresAt).getTime() : 0;
    if (expires && Date.now() > expires - 60_000) {
      clearStoredChatSession(chainId, campaignAddress, walletAddress);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storeChatSession(chainId: number, campaignAddress: string, walletAddress: string, session: ChatSession) {
  if (typeof window === "undefined" || !walletAddress || !session?.sessionToken) return;
  window.sessionStorage.setItem(sessionKey(chainId, campaignAddress, walletAddress), JSON.stringify(session));
}

export function clearStoredChatSession(chainId: number, campaignAddress: string, walletAddress: string) {
  if (typeof window === "undefined" || !walletAddress) return;
  window.sessionStorage.removeItem(sessionKey(chainId, campaignAddress, walletAddress));
}

export function buildChatJoinMessage(params: {
  chainId: number;
  campaignAddress: string;
  walletAddress: string;
  nonce: string;
}) {
  return [
    "MemeWarzone War Room",
    "Action: CHAT_SESSION_CREATE",
    `ChainId: ${Number(params.chainId)}`,
    `Wallet: ${params.walletAddress.toLowerCase()}`,
    `Campaign: ${params.campaignAddress.toLowerCase()}`,
    `Nonce: ${params.nonce}`,
  ].join("\n");
}

export async function joinChatSession(params: {
  chainId: number;
  campaignAddress: string;
  walletAddress: string;
  signer: JsonRpcSigner;
}) {
  const nonce = `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`;
  const message = buildChatJoinMessage({ ...params, nonce });
  const signature = await params.signer.signMessage(message);

  const res = await fetch(apiPath("join"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chainId: params.chainId,
      campaignAddress: params.campaignAddress,
      walletAddress: params.walletAddress,
      nonce,
      message,
      signature,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not join War Room");
  storeChatSession(params.chainId, params.campaignAddress, params.walletAddress, data);
  return data as ChatSession;
}

export async function fetchChatHistory(params: {
  chainId: number;
  campaignAddress: string;
  before?: string | null;
  limit?: number;
}) {
  const qs = new URLSearchParams({
    chainId: String(params.chainId),
    campaignAddress: params.campaignAddress,
    limit: String(params.limit ?? 50),
  });
  if (params.before) qs.set("before", params.before);
  const res = await fetch(apiPath(`history?${qs.toString()}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not load War Room history");
  return data as { messages: WarRoomMessage[]; nextCursor?: string | null };
}

export async function sendChatMessage(params: {
  chainId: number;
  campaignAddress: string;
  sessionToken: string;
  message: string;
  clientNonce: string;
}) {
  const res = await fetch(apiPath("send"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.sessionToken}`,
    },
    body: JSON.stringify({
      chainId: params.chainId,
      campaignAddress: params.campaignAddress,
      message: params.message,
      clientNonce: params.clientNonce,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not send message");
  return data.message as WarRoomMessage;
}

export function realtimeTokenUrl(params: {
  chainId: number;
  campaignAddress: string;
  sessionToken: string;
}) {
  const qs = new URLSearchParams({
    chainId: String(params.chainId),
    campaignAddress: params.campaignAddress,
  });
  return apiPath(`realtime-token?${qs.toString()}`);
}
