/**
 * Client for the repo's Vercel functions:
 * - GET  /api/profile?chainId=...&address=...
 * - POST /api/profile
 * - GET  /api/auth/nonce?chainId=...&address=...
 */

export type UserProfile = {
  chainId: number;
  address: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  updatedAt?: string | null;
};

const rawBase = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_BASE = rawBase.replace(/\/$/, "");

function buildUrl(pathWithQuery: string): string {
  // Absolute base URL: VITE_API_BASE_URL=https://<your-vercel-domain>
  if (API_BASE && /^https?:\/\//i.test(API_BASE)) {
    return `${API_BASE}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
  }
  // Default: same-origin /api/*
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

function normalizeAddress(addr: string): string {
  return String(addr ?? "").trim().toLowerCase();
}

export function buildProfileMessage(args: {
  chainId: number;
  address: string;
  nonce: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): string {
  // Must match frontend/api/profile.js exactly.
  const name = String(args.displayName ?? "").trim().slice(0, 32);
  const avatar = String(args.avatarUrl ?? "").trim().slice(0, 200);
  return [
    "UPMEME Profile",
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
  const addr = normalizeAddress(address);
  const url = buildUrl(
    `/api/profile?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(addr)}`
  );

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    // If API isn't available in local dev, fail gracefully.
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
  };
}

export async function requestNonce(chainId: number, address: string): Promise<string> {
  const addr = normalizeAddress(address);
  const url = buildUrl(
    `/api/auth/nonce?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(addr)}`
  );
  const res = await fetch(url, { method: "GET" });
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
  const url = buildUrl(`/api/profile`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chainId: input.chainId,
      address: normalizeAddress(input.address),
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
