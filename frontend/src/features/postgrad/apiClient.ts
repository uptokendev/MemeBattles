import { apiFetch } from "@/lib/apiBase";

type JsonObject = Record<string, any>;

export type PostGradWarRoomMode = "trending" | "new" | "graduated" | "draft";
export type PostGradLeagueAction = "advance-week" | "rebalance-divisions" | "cycle-season-state";

export type PostGradCampaignFeedParams = {
  chainId?: number | string | null;
  limit?: number;
  bnbUsd?: number | null;
  signal?: AbortSignal;
};

export type PostGradFeaturedFeedParams = {
  chainId?: number | string | null;
  limit?: number;
  signal?: AbortSignal;
};

export type PostGradWarRoomCampaignFeedParams = {
  chainId?: number | string | null;
  limit: number;
  mode: PostGradWarRoomMode;
  search?: string;
  signal?: AbortSignal;
};

export type PostGradSponsoredFeedParams = {
  chainId?: number | string | null;
  limit?: number;
  signal?: AbortSignal;
};

export type OpenPostGradBattleInput = {
  tokenId: string;
  chainId?: number | null;
  initialPotBnb?: number;
};

export type PostGradWarPoolState = "open" | "locked" | "settling" | "paid";

async function readJson(response: Response): Promise<JsonObject | null> {
  return response.json().catch(() => null) as Promise<JsonObject | null>;
}

async function fetchJson(path: string, init?: RequestInit): Promise<JsonObject | null> {
  const response = await apiFetch(path, init);
  if (!response.ok) return null;
  const json = await readJson(response);
  return json && typeof json === "object" ? json : null;
}

async function mutateJson(path: string, body: JsonObject = {}): Promise<boolean> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) return false;
  const json = await readJson(response);
  return json == null || json.ok !== false;
}

export async function fetchPostGradBattleFeed(signal?: AbortSignal) {
  return fetchJson("/api/arena/battles", { cache: "no-store", signal });
}

export async function fetchPostGradCreatorBattleStatuses(creatorAddress: string, chainId?: number | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ creator: creatorAddress });
  if (chainId) params.set("chainId", String(chainId));
  return fetchJson(`/api/arena/battles/creator-status?${params.toString()}`, { cache: "no-store", signal });
}

export async function fetchPostGradBattleDetails(battleId: string, signal?: AbortSignal) {
  return fetchJson(`/api/arena/battles/${encodeURIComponent(battleId)}`, { cache: "no-store", signal });
}

export async function openPostGradBattle(input: OpenPostGradBattleInput) {
  const payload: JsonObject = {
    tokenId: input.tokenId,
    chainId: input.chainId || undefined,
  };

  if (typeof input.initialPotBnb === "number" && input.initialPotBnb > 0) {
    payload.initialPotBnb = input.initialPotBnb;
  }

  return mutateJson("/api/arena/battles/open", payload);
}

export async function fetchPostGradEventFeed(signal?: AbortSignal) {
  return fetchJson("/api/arena/events", { cache: "no-store", signal });
}

export async function fetchPostGradEventDetails(eventId: string, signal?: AbortSignal) {
  return fetchJson(`/api/arena/events/${encodeURIComponent(eventId)}`, { cache: "no-store", signal });
}

export async function fetchPostGradLeagueFeed(signal?: AbortSignal) {
  return fetchJson("/api/arena/league", { cache: "no-store", signal });
}

export async function mutatePostGradLeague(action: PostGradLeagueAction) {
  return mutateJson("/api/arena/league/mutate", { action });
}

export async function fetchPostGradWarPool(battleId: string, signal?: AbortSignal) {
  return fetchJson(`/api/arena/war-pools/${encodeURIComponent(battleId)}`, { cache: "no-store", signal });
}

export async function fetchPostGradWarPoolSummary(signal?: AbortSignal) {
  return fetchJson("/api/arena/war-pools", { cache: "no-store", signal });
}

export async function supportPostGradWarPool(battleId: string, sideTokenId: string, amountUsd: number) {
  return mutateJson(`/api/arena/war-pools/${encodeURIComponent(battleId)}/support`, { sideTokenId, amountUsd });
}

export async function transitionPostGradWarPool(battleId: string, state: PostGradWarPoolState) {
  return mutateJson(`/api/arena/war-pools/${encodeURIComponent(battleId)}/transition`, { state });
}

export async function fetchPostGradSponsoredFeed({ chainId = 97, limit = 4, signal }: PostGradSponsoredFeedParams) {
  const params = new URLSearchParams({
    chainId: String(chainId || 97),
    limit: String(limit),
  });

  return fetchJson(`/api/sponsored?${params.toString()}`, { cache: "no-store", signal });
}

export async function fetchPostGradFeaturedFeed({ chainId = 97, limit = 6, signal }: PostGradFeaturedFeedParams) {
  const params = new URLSearchParams({
    chainId: String(chainId || 97),
    sort: "24h",
    limit: String(limit),
  });

  return fetchJson(`/api/featured?${params.toString()}`, { cache: "no-store", signal });
}

export async function fetchPostGradCampaignFeed({ chainId = 97, limit = 12, bnbUsd, signal }: PostGradCampaignFeedParams) {
  const params = new URLSearchParams({
    chainId: String(chainId || 97),
    limit: String(limit),
    cursor: "0",
    tab: "trending",
    status: "all",
    sort: "default",
  });
  if (bnbUsd && Number.isFinite(bnbUsd)) params.set("bnbUsd", String(bnbUsd));

  return fetchJson(`/api/campaigns?${params.toString()}`, { cache: "no-store", signal });
}

export async function fetchPostGradWarRoomCampaignFeed({
  chainId = 97,
  limit = 250,
  mode,
  search = "",
  signal,
}: PostGradWarRoomCampaignFeedParams) {
  const params = new URLSearchParams({
    chainId: String(chainId || 97),
    limit: String(limit),
    mode,
  });
  if (search.trim()) params.set("search", search.trim());

  return fetchJson(`/api/war-room?${params.toString()}`, { cache: "no-store", signal });
}
