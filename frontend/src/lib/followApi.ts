import { isAddress } from "ethers";

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

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Follow API error (${res.status}): ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

function normAddr(a: string) {
  return (a ?? "").trim().toLowerCase();
}

function assertAddr(a: string, label: string) {
  const v = normAddr(a);
  if (!isAddress(v)) throw new Error(`Invalid ${label} address`);
  return v;
}

export async function followUser(followerAddress: string, followingAddress: string, chainId = 0): Promise<void> {
  const payload: FollowUserPayload = {
    chainId,
    followerAddress: assertAddr(followerAddress, "follower"),
    followingAddress: assertAddr(followingAddress, "following"),
  };
  await api<{ ok: true }>(`/api/follows/user`, {
    method: "POST",
    body: JSON.stringify({ ...payload, action: "follow" }),
  });
}

export async function unfollowUser(followerAddress: string, followingAddress: string, chainId = 0): Promise<void> {
  const payload: FollowUserPayload = {
    chainId,
    followerAddress: assertAddr(followerAddress, "follower"),
    followingAddress: assertAddr(followingAddress, "following"),
  };
  await api<{ ok: true }>(`/api/follows/user`, {
    method: "POST",
    body: JSON.stringify({ ...payload, action: "unfollow" }),
  });
}

export async function isFollowingUser(
  followerAddress: string,
  followingAddress: string,
  chainId = 0
): Promise<boolean> {
  const follower = assertAddr(followerAddress, "follower");
  const following = assertAddr(followingAddress, "following");
  const q = new URLSearchParams({ chainId: String(chainId), follower, following });
  const out = await api<{ isFollowing: boolean }>(`/api/follows/user?${q.toString()}`);
  return !!out.isFollowing;
}

export async function getFollowersCount(address: string, chainId = 0): Promise<number> {
  const a = assertAddr(address, "address");
  const q = new URLSearchParams({ chainId: String(chainId), address: a });
  const out = await api<{ followers: number }>(`/api/follows/user-counts?${q.toString()}`);
  return out.followers ?? 0;
}

export async function getFollowingCount(address: string, chainId = 0): Promise<number> {
  const a = assertAddr(address, "address");
  const q = new URLSearchParams({ chainId: String(chainId), address: a });
  const out = await api<{ following: number }>(`/api/follows/user-counts?${q.toString()}`);
  return out.following ?? 0;
}

export async function getFollowers(address: string, chainId = 0) {
  const a = assertAddr(address, "address");
  const q = new URLSearchParams({ chainId: String(chainId), address: a, type: "followers" });
  const out = await api<{ items: Array<{ address: string; profile?: any }> }>(`/api/follows/user-list?${q.toString()}`);
  return (out.items || []).map((it) => ({ id: it.address, profile: it.profile }));
}

export async function getFollowing(address: string, chainId = 0) {
  const a = assertAddr(address, "address");
  const q = new URLSearchParams({ chainId: String(chainId), address: a, type: "following" });
  const out = await api<{ items: Array<{ address: string; profile?: any }> }>(`/api/follows/user-list?${q.toString()}`);
  return (out.items || []).map((it) => ({ id: it.address, profile: it.profile }));
}

export async function followCampaign(userAddress: string, campaignAddress: string, chainId = 0): Promise<void> {
  const payload: FollowCampaignPayload = {
    chainId,
    userAddress: assertAddr(userAddress, "user"),
    campaignAddress: assertAddr(campaignAddress, "campaign"),
  };
  await api<{ ok: true }>(`/api/follows/campaign`, {
    method: "POST",
    body: JSON.stringify({ ...payload, action: "follow" }),
  });
}

export async function unfollowCampaign(userAddress: string, campaignAddress: string, chainId = 0): Promise<void> {
  const payload: FollowCampaignPayload = {
    chainId,
    userAddress: assertAddr(userAddress, "user"),
    campaignAddress: assertAddr(campaignAddress, "campaign"),
  };
  await api<{ ok: true }>(`/api/follows/campaign`, {
    method: "POST",
    body: JSON.stringify({ ...payload, action: "unfollow" }),
  });
}

export async function isFollowingCampaign(userAddress: string, campaignAddress: string, chainId = 0): Promise<boolean> {
  const user = assertAddr(userAddress, "user");
  const campaign = assertAddr(campaignAddress, "campaign");
  const q = new URLSearchParams({ chainId: String(chainId), user, campaign });
  const out = await api<{ isFollowing: boolean }>(`/api/follows/campaign?${q.toString()}`);
  return !!out.isFollowing;
}

export async function getFollowedCampaigns(userAddress: string, chainId = 0): Promise<string[]> {
  const user = assertAddr(userAddress, "user");
  const q = new URLSearchParams({ chainId: String(chainId), user });
  const out = await api<{ items: string[] }>(`/api/follows/campaign-list?${q.toString()}`);
  return out.items || [];
}