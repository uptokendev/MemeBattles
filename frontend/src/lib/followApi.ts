import { isAddress, type JsonRpcSigner } from "ethers";
import { apiFetch } from "@/lib/apiBase";
import { isSolanaAddress } from "@/lib/address";
import { isEvmChainId, isSolanaChainId, SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { signWalletAction, type WalletActionAuthPayload } from "@/lib/walletActionAuth";

export type FollowSignOpts = {
  signer?: JsonRpcSigner | null;
  signMessage?: (message: string) => Promise<string>;
  auth?: WalletActionAuthPayload | null;
};

async function maybeFollowAuth(
  action: "follow_user" | "unfollow_user" | "follow_campaign" | "unfollow_campaign",
  walletAddress: string,
  chainId: number,
  opts?: FollowSignOpts,
  extraLines: string[] = [],
): Promise<WalletActionAuthPayload | null> {
  if (opts?.auth) return opts.auth;
  if (!opts?.signer && !opts?.signMessage) return null;
  try {
    return await signWalletAction({
      action,
      walletAddress,
      // May be 0 for EVM wallet-global user follows (matches API body + walletActionAuth).
      chainId: Number.isFinite(chainId) ? chainId : 56,
      extraLines,
      signer: opts.signer,
      signMessage: opts.signMessage,
    });
  } catch (error) {
    console.warn(`[followApi] ${action} sign skipped:`, error);
    return null;
  }
}

type FollowUserPayload = {
  chainId: number;
  followerAddress: string;
  followingAddress: string;
};

type FollowCampaignPayload = {
  chainId: number;
  userAddress: string;
  campaignAddress: string;
};

type AddressKind = "evm" | "solana" | "invalid";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, {
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Follow API error (${res.status}): ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

function addressKind(a: string): AddressKind {
  const raw = String(a ?? "").trim();
  if (isSolanaAddress(raw)) return "solana";
  if (isAddress(raw)) return "evm";
  return "invalid";
}

function normAddr(a: string) {
  const raw = (a ?? "").trim();
  if (isSolanaAddress(raw)) return raw;
  return raw.toLowerCase();
}

function assertAddr(a: string, label: string) {
  const v = normAddr(a);
  if (!isSolanaAddress(v) && !isAddress(v)) throw new Error(`Invalid ${label} address`);
  return v;
}

export function isChainAddressCompatible(chainId: number, ...addresses: string[]): boolean {
  const kinds = addresses.map(addressKind);
  if (kinds.some((kind) => kind === "invalid")) return false;
  if (isSolanaChainId(chainId)) return kinds.every((kind) => kind === "solana");
  if (isEvmChainId(chainId)) return kinds.every((kind) => kind === "evm");
  return true;
}

export function chainAddressCompatibilityMessage(chainId: number): string {
  if (isSolanaChainId(chainId)) return "This action needs Solana campaign and wallet addresses.";
  if (isEvmChainId(chainId)) return "This action needs EVM campaign and wallet addresses.";
  return "This campaign cannot be followed from the selected chain.";
}

function assertChainAddressCompatible(chainId: number, ...addresses: string[]) {
  if (!isChainAddressCompatible(chainId, ...addresses)) {
    throw new Error(chainAddressCompatibilityMessage(chainId));
  }
}

function resolveChainId(chainId: number, ...addresses: string[]) {
  if (addresses.some((address) => isSolanaAddress(address))) {
    return isSolanaChainId(chainId) ? chainId : SOLANA_CHAIN_ID;
  }
  // EVM user-follows are wallet-global (not per 56/97). API stores them under 0.
  return 0;
}

export async function followUser(
  followerAddress: string,
  followingAddress: string,
  chainId = 0,
  signOpts?: FollowSignOpts,
): Promise<void> {
  const follower = assertAddr(followerAddress, "follower");
  const following = assertAddr(followingAddress, "following");
  const payload: FollowUserPayload = {
    chainId: resolveChainId(chainId, follower, following),
    followerAddress: follower,
    followingAddress: following,
  };
  // Auth chain must match body chainId (0 for EVM wallet-global follows).
  const auth = await maybeFollowAuth("follow_user", follower, payload.chainId, signOpts, [`Following: ${following}`]);
  await api<{ ok: true }>(`/api/follows/user`, {
    method: "POST",
    body: JSON.stringify({ ...payload, action: "follow", ...(auth || {}), auth: auth || undefined }),
  });
}

export async function unfollowUser(
  followerAddress: string,
  followingAddress: string,
  chainId = 0,
  signOpts?: FollowSignOpts,
): Promise<void> {
  const follower = assertAddr(followerAddress, "follower");
  const following = assertAddr(followingAddress, "following");
  const payload: FollowUserPayload = {
    chainId: resolveChainId(chainId, follower, following),
    followerAddress: follower,
    followingAddress: following,
  };
  const auth = await maybeFollowAuth("unfollow_user", follower, payload.chainId, signOpts, [`Following: ${following}`]);
  await api<{ ok: true }>(`/api/follows/user`, {
    method: "POST",
    body: JSON.stringify({ ...payload, action: "unfollow", ...(auth || {}), auth: auth || undefined }),
  });
}

export async function isFollowingUser(
  followerAddress: string,
  followingAddress: string,
  chainId = 0
): Promise<boolean> {
  const follower = assertAddr(followerAddress, "follower");
  const following = assertAddr(followingAddress, "following");
  const q = new URLSearchParams({ chainId: String(resolveChainId(chainId, follower, following)), follower, following });
  const out = await api<{ isFollowing: boolean }>(`/api/follows/user?${q.toString()}`);
  return !!out.isFollowing;
}

export async function getFollowersCount(address: string, chainId = 0): Promise<number> {
  const a = assertAddr(address, "address");
  const q = new URLSearchParams({ chainId: String(resolveChainId(chainId, a)), address: a });
  const out = await api<{ followers: number }>(`/api/follows/user-counts?${q.toString()}`);
  return out.followers ?? 0;
}

export async function getFollowingCount(address: string, chainId = 0): Promise<number> {
  const a = assertAddr(address, "address");
  const q = new URLSearchParams({ chainId: String(resolveChainId(chainId, a)), address: a });
  const out = await api<{ following: number }>(`/api/follows/user-counts?${q.toString()}`);
  return out.following ?? 0;
}

export async function getFollowers(address: string, chainId = 0) {
  const a = assertAddr(address, "address");
  const q = new URLSearchParams({ chainId: String(resolveChainId(chainId, a)), address: a, type: "followers" });
  const out = await api<{ items: Array<{ address: string; profile?: any }> }>(`/api/follows/user-list?${q.toString()}`);
  return (out.items || []).map((it) => ({ id: it.address, profile: it.profile }));
}

export async function getFollowing(address: string, chainId = 0) {
  const a = assertAddr(address, "address");
  const q = new URLSearchParams({ chainId: String(resolveChainId(chainId, a)), address: a, type: "following" });
  const out = await api<{ items: Array<{ address: string; profile?: any }> }>(`/api/follows/user-list?${q.toString()}`);
  return (out.items || []).map((it) => ({ id: it.address, profile: it.profile }));
}

export async function followCampaign(
  userAddress: string,
  campaignAddress: string,
  chainId = 0,
  signOpts?: FollowSignOpts,
): Promise<void> {
  const user = assertAddr(userAddress, "user");
  const campaign = assertAddr(campaignAddress, "campaign");
  assertChainAddressCompatible(chainId, user, campaign);
  const payload: FollowCampaignPayload = {
    chainId: resolveChainId(chainId, user, campaign),
    userAddress: user,
    campaignAddress: campaign,
  };
  const auth = await maybeFollowAuth("follow_campaign", user, payload.chainId || chainId || 56, signOpts, [
    `Campaign: ${campaign}`,
  ]);
  await api<{ ok: true }>(`/api/follows/campaign`, {
    method: "POST",
    body: JSON.stringify({ ...payload, action: "follow", ...(auth || {}), auth: auth || undefined }),
  });
}

export async function unfollowCampaign(
  userAddress: string,
  campaignAddress: string,
  chainId = 0,
  signOpts?: FollowSignOpts,
): Promise<void> {
  const user = assertAddr(userAddress, "user");
  const campaign = assertAddr(campaignAddress, "campaign");
  assertChainAddressCompatible(chainId, user, campaign);
  const payload: FollowCampaignPayload = {
    chainId: resolveChainId(chainId, user, campaign),
    userAddress: user,
    campaignAddress: campaign,
  };
  const auth = await maybeFollowAuth("unfollow_campaign", user, payload.chainId || chainId || 56, signOpts, [
    `Campaign: ${campaign}`,
  ]);
  await api<{ ok: true }>(`/api/follows/campaign`, {
    method: "POST",
    body: JSON.stringify({ ...payload, action: "unfollow", ...(auth || {}), auth: auth || undefined }),
  });
}

export async function isFollowingCampaign(userAddress: string, campaignAddress: string, chainId = 0): Promise<boolean> {
  const user = assertAddr(userAddress, "user");
  const campaign = assertAddr(campaignAddress, "campaign");
  if (!isChainAddressCompatible(chainId, user, campaign)) return false;
  const q = new URLSearchParams({ chainId: String(resolveChainId(chainId, user, campaign)), user, campaign });
  const out = await api<{ isFollowing: boolean }>(`/api/follows/campaign?${q.toString()}`);
  return !!out.isFollowing;
}

export async function getFollowedCampaigns(userAddress: string, chainId = 0): Promise<string[]> {
  const user = assertAddr(userAddress, "user");
  const q = new URLSearchParams({ chainId: String(resolveChainId(chainId, user)), user });
  const out = await api<{ items: string[] }>(`/api/follows/campaign-list?${q.toString()}`);
  return out.items || [];
}
