import { apiFetch, apiUrl } from "@/lib/apiBase";
import { normalizeAddress as centralNormalize } from "@/lib/address";

export type UserProfile = {
  chainId: number;
  address: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  updatedAt?: string | null;
  rank?: string | null;
  previousRank?: string | null;
  rankPoints?: number | null;
  rankUpdatedAt?: string | null;
};

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildUrl(pathWithQuery: string): string {
  return apiUrl(pathWithQuery);
}

function normalizeAddress(addr: string, chainId?: number): string {
  return centralNormalize(addr, chainId);
}

export function buildProfileMessage(args: {
  chainId: number;
  address: string;
  nonce: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): string {
  const name = String(args.displayName ?? "").trim().slice(0, 32);
  const avatar = String(args.avatarUrl ?? "").trim().slice(0, 200);
  return [
    "MemeBattles Profile",
    "Action: PROFILE_UPSERT",
    `ChainId: ${args.chainId}`,
    `Address: ${normalizeAddress(args.address)}`,
    `Nonce: ${args.nonce}`,
    "",
    `DisplayName: ${name}`,
    `AvatarUrl: ${avatar}`,
  ].join("\n");
}

export async function fetchUserProfile(chainId: number, address: string): Promise<UserProfile | null> {
  const addr = normalizeAddress(address, chainId);
  const url = buildUrl(`/api/profile?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(addr)}`);

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    if (res.status === 404) return null;
    const j = await readJson(res);
    throw new Error(j?.error || `Failed to load profile (${res.status})`);
  }

  const j = await readJson(res);
  const p = j?.profile ?? null;
  if (!p) return null;

  return {
    chainId: Number(p.chainId ?? chainId),
    address: String(p.address ?? addr),
    displayName: (p.displayName ?? null) as string | null,
    avatarUrl: (p.avatarUrl ?? null) as string | null,
    bio: (p.bio ?? null) as string | null,
    updatedAt: (p.updatedAt ?? null) as string | null,
    rank: (p.rank ?? null) as string | null,
    previousRank: (p.previousRank ?? null) as string | null,
    rankPoints: p.rankPoints == null ? null : Number(p.rankPoints),
    rankUpdatedAt: (p.rankUpdatedAt ?? null) as string | null,
  };
}

export async function requestNonce(chainId: number, address: string): Promise<string> {
  const addr = normalizeAddress(address, chainId);
  const res = await apiFetch(`/api/auth/nonce?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(addr)}`, { method: "GET" });
  if (!res.ok) {
    const j = await readJson(res);
    throw new Error(j?.error || `Nonce request failed (${res.status})`);
  }
  const j = await res.json();
  if (!j?.nonce) throw new Error("Nonce missing");
  return String(j.nonce);
}

export type SaveProfileInput = {
  chainId: number;
  address: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  nonce: string;
  signature: string;
};

export async function saveUserProfile(input: SaveProfileInput): Promise<void> {
  const res = await apiFetch(`/api/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chainId: input.chainId,
      address: normalizeAddress(input.address, input.chainId),
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      bio: input.bio,
      nonce: input.nonce,
      signature: input.signature,
    }),
  });

  if (!res.ok) {
    const j = await readJson(res);
    throw new Error(j?.error || `Failed to save profile (${res.status})`);
  }
}
