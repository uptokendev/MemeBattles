import { buildRealtimeApiUrl } from "@/lib/realtimeApi";
import type { DraftActionAuth } from "@/lib/draftAuth";

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

function query(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}

export type DraftVisibility = "public" | "unlisted" | "private";
export type DraftStatus = "draft" | "promotion_published" | "ready_to_launch" | "deployed" | "archived";

export type CampaignDraft = {
  id: string;
  chainId: number;
  creatorWallet: string;
  name: string;
  ticker: string;
  description: string | null;
  category: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  xUrl: string | null;
  otherUrl: string | null;
  slug: string;
  status: DraftStatus;
  visibility: DraftVisibility;
  campaignAddress: string | null;
  tokenAddress: string | null;
  deployTxHash: string | null;
  archivedAt: string | null;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignDraftPromotion = {
  draftId: string;
  missionStatement: string;
  roadmap: string[];
  launchStrategy: string;
  telegramUrl: string;
  discordUrl: string;
  xUrl: string;
  websiteUrl: string;
  docs: string[];
  creatorNote: string;
  bannerUrl: string;
  shareMessage: string;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DraftPopularity = {
  views: number;
  follows: number;
  comments: number;
  reactions: number;
  shares: number;
  signedActions: number;
  popularityPercentage: number;
  heatLabel: "Cold" | "Warming" | "Hot" | "On Fire";
  rankingScore: number;
};

export type DraftComment = {
  id: string;
  draftId: string;
  walletAddress: string;
  body: string;
  parentCommentId: string | null;
  reactionCount: number;
  createdAt: string;
  replies?: DraftComment[];
};

export type PrepareDraftBundle = {
  draft: CampaignDraft;
  promotion: CampaignDraftPromotion;
  popularity: DraftPopularity;
};

export type CreateDraftInput = {
  auth?: DraftActionAuth;
  chainId: number;
  creatorWallet: string;
  name: string;
  ticker: string;
  description?: string | null;
  category?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  xUrl?: string | null;
  otherUrl?: string | null;
  visibility?: DraftVisibility;
};

export type SavePromotionInput = {
  auth?: DraftActionAuth;
  missionStatement?: string;
  roadmap?: string[];
  launchStrategy?: string;
  telegramUrl?: string;
  discordUrl?: string;
  xUrl?: string;
  websiteUrl?: string;
  docs?: string[];
  creatorNote?: string;
  bannerUrl?: string;
  visibility?: DraftVisibility;
  shareMessage?: string;
  publish?: boolean;
};

export async function createCampaignDraft(input: CreateDraftInput): Promise<CampaignDraft> {
  const res = await fetch(buildRealtimeApiUrl("/api/drafts"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  return json.draft as CampaignDraft;
}
export async function fetchPublicCampaignDrafts(input: { chainId?: number; limit?: number } = {}): Promise<CampaignDraft[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts${query({ chainId: input.chainId, limit: input.limit })}`), {
    cache: "no-store",
  });
  const json = await parseJson(res);
  return Array.isArray(json.items) ? (json.items as CampaignDraft[]) : [];
}
export async function fetchOwnerCampaignDrafts(
  owner: string,
  input: { chainId?: number; limit?: number } = {}
): Promise<CampaignDraft[]> {
  const res = await fetch(
    buildRealtimeApiUrl(
      `/api/drafts${query({
        owner,
        chainId: input.chainId,
        limit: input.limit,
      })}`
    ),
    { cache: "no-store" }
  );

  const json = await parseJson(res);
  return Array.isArray(json.items) ? (json.items as CampaignDraft[]) : [];
}
export async function fetchCampaignDraft(draftId: string, viewer?: string | null): Promise<PrepareDraftBundle> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}${query({ viewer })}`));
  return parseJson(res) as Promise<PrepareDraftBundle>;
}

export async function saveDraftPromotion(draftId: string, input: SavePromotionInput): Promise<PrepareDraftBundle> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/promotion`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson(res) as Promise<PrepareDraftBundle>;
}

export async function fetchPrepareDraft(slug: string, viewer?: string | null): Promise<PrepareDraftBundle> {
  const res = await fetch(buildRealtimeApiUrl(`/api/prepare/${encodeURIComponent(slug)}${query({ viewer })}`));
  return parseJson(res) as Promise<PrepareDraftBundle>;
}

export async function followDraft(draftId: string, walletAddress: string): Promise<{ following: boolean; followCount: number }> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/follow`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  const json = await parseJson(res);
  return { following: Boolean(json.following), followCount: Number(json.followCount || 0) };
}

export async function fetchDraftComments(draftId: string): Promise<DraftComment[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/comments`));
  const json = await parseJson(res);
  return Array.isArray(json.items) ? (json.items as DraftComment[]) : [];
}

export async function addDraftComment(draftId: string, walletAddress: string, body: string, parentCommentId?: string | null): Promise<DraftComment> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/comments`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress, body, parentCommentId: parentCommentId || null }),
  });
  const json = await parseJson(res);
  return json.comment as DraftComment;
}
export async function archiveCampaignDraft(
  draftId: string,
  auth: DraftActionAuth
): Promise<PrepareDraftBundle> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/archive`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth }),
  });

  return parseJson(res) as Promise<PrepareDraftBundle>;
}