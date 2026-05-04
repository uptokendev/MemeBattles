import { verifyMessage } from "ethers";
import { buildRealtimeApiUrl } from "@/lib/realtimeApi";
import type { DraftActionAuth, DraftAuthAction } from "@/lib/draftAuth";

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

function normalizeWallet(value: string) {
  return String(value || "").trim().toLowerCase();
}

function buildDraftAuthMessage(input: {
  action: DraftAuthAction;
  walletAddress: string;
  chainId: number;
  nonce: string;
  draftId?: string | null;
}) {
  const lines = [
    "MemeWarzone Prepare Mode",
    `Action: ${input.action}`,
    `Wallet: ${normalizeWallet(input.walletAddress)}`,
    `Chain ID: ${Number(input.chainId)}`,
  ];

  if (input.draftId) lines.push(`Draft ID: ${input.draftId}`);
  lines.push(`Nonce: ${input.nonce}`);

  return lines.join("\n");
}

async function fetchNonce(chainId: number, walletAddress: string) {
  const qs = new URLSearchParams({
    chainId: String(chainId),
    address: normalizeWallet(walletAddress),
  });

  const res = await fetch(buildRealtimeApiUrl(`/api/auth/nonce?${qs.toString()}`), {
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.nonce) {
    throw new Error(String(json?.error || json?.message || "Could not create wallet auth nonce."));
  }

  return String(json.nonce);
}

function verifySignatureWallet(message: string, signature: string, walletAddress: string) {
  try {
    return normalizeWallet(verifyMessage(message, signature)) === normalizeWallet(walletAddress);
  } catch {
    return false;
  }
}

function getInjectedProviders() {
  const eth = (globalThis as any)?.ethereum;
  if (!eth) return [];
  const providers = Array.isArray(eth.providers) ? eth.providers : [eth];
  return providers.filter((provider: any) => provider?.request);
}

async function providerAccounts(provider: any) {
  const selected = normalizeWallet(provider?.selectedAddress || "");
  if (selected) return [selected];

  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    return Array.isArray(accounts) ? accounts.map((item) => normalizeWallet(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function findProviderForWallet(walletAddress: string) {
  const wallet = normalizeWallet(walletAddress);
  const providers = getInjectedProviders();

  for (const provider of providers) {
    const accounts = await providerAccounts(provider);
    if (accounts.includes(wallet)) return provider;
  }

  const metamask = providers.find((provider: any) => provider?.isMetaMask && !provider?.isCryptoCom);
  if (metamask) return metamask;

  return providers[0] || null;
}

async function signWithInjectedWallet(message: string, walletAddress: string) {
  const wallet = normalizeWallet(walletAddress);
  const provider = await findProviderForWallet(wallet);

  if (!provider?.request) {
    throw new Error("Wallet signer unavailable. Reconnect your wallet and try again.");
  }

  const accounts = await provider.request({ method: "eth_requestAccounts" }).catch(() => []);
  const active = normalizeWallet(Array.isArray(accounts) ? accounts[0] : "");

  if (active && active !== wallet) {
    throw new Error("Connected wallet does not match this action. Switch to the selected wallet and try again.");
  }

  const attempts = [[message, wallet], [wallet, message]];
  let lastError: any = null;

  for (const params of attempts) {
    try {
      const signature = String(
        await provider.request({
          method: "personal_sign",
          params,
        })
      );

      if (verifySignatureWallet(message, signature, wallet)) {
        return signature;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError?.message) throw lastError;
  throw new Error("Wallet signature could not be verified. Reconnect the selected wallet and try again.");
}

async function signDraftActionWithKnownChain(input: {
  action: DraftAuthAction;
  draftId: string;
  walletAddress: string;
  chainId: number;
}): Promise<DraftActionAuth> {
  const walletAddress = normalizeWallet(input.walletAddress);
  if (!walletAddress) throw new Error("Wallet address missing. Reconnect your wallet and try again.");

  const chainId = Number(input.chainId);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("Invalid draft chain id. Refresh and try again.");
  }

  const nonce = await fetchNonce(chainId, walletAddress);
  const message = buildDraftAuthMessage({
    action: input.action,
    walletAddress,
    chainId,
    nonce,
    draftId: input.draftId,
  });

  const signature = await signWithInjectedWallet(message, walletAddress);

  return {
    action: input.action,
    walletAddress,
    chainId,
    draftId: input.draftId,
    nonce,
    message,
    signature,
  };
}

async function signPrepareEngagement(input: {
  action: "follow_draft" | "comment_draft";
  draftId: string;
  walletAddress: string;
}): Promise<DraftActionAuth> {
  const walletAddress = normalizeWallet(input.walletAddress);
  if (!walletAddress) throw new Error("Wallet address missing. Reconnect your wallet and try again.");

  const bundle = await fetchCampaignDraft(input.draftId, walletAddress);
  return signDraftActionWithKnownChain({
    action: input.action,
    draftId: input.draftId,
    walletAddress,
    chainId: Number(bundle.draft.chainId),
  });
}

async function retryPrivateReadWithAuth(
  url: string,
  walletAddress: string | null | undefined,
  json: any,
  fallbackDraftId?: string | null
): Promise<PrepareDraftBundle> {
  const wallet = normalizeWallet(walletAddress || "");
  if (!wallet) {
    throw new Error(String(json?.error || "Private draft requires the owner wallet."));
  }

  const chainId = Number(json?.chainId);
  const draftId = String(json?.draftId || fallbackDraftId || "");

  if (!draftId) {
    throw new Error("Private draft auth could not identify the draft. Refresh and try again.");
  }

  const auth = await signDraftActionWithKnownChain({
    action: "read_draft",
    draftId,
    walletAddress: wallet,
    chainId,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth }),
  });

  return parseJson(res) as Promise<PrepareDraftBundle>;
}

export type DraftVisibility = "public" | "unlisted" | "private";
export type DraftStatus = "draft" | "promotion_published" | "ready_to_launch" | "scheduled" | "deployed" | "archived";

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

export type TickerAvailability = {
  ticker: string;
  chainId?: number;
  available: boolean;
  reason: string;
  source: "validation" | "draft" | "campaign" | "available" | string;
};

export async function checkTickerAvailability(input: { ticker: string; chainId?: number }): Promise<TickerAvailability> {
  const res = await fetch(
    buildRealtimeApiUrl(`/api/drafts/ticker-availability${query({ ticker: input.ticker, chainId: input.chainId })}`),
    { cache: "no-store" }
  );
  return parseJson(res) as Promise<TickerAvailability>;
}

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
  const url = buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}${query({ viewer })}`);
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));

  if (res.ok) return json as PrepareDraftBundle;
  if (res.status === 401 && json?.code === "PRIVATE_DRAFT_AUTH_REQUIRED") {
    return retryPrivateReadWithAuth(url, viewer, json, draftId);
  }

  throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
}

export async function fetchCampaignDraftWithAuth(draftId: string, auth: DraftActionAuth): Promise<PrepareDraftBundle> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth }),
  });

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
  const url = buildRealtimeApiUrl(`/api/prepare/${encodeURIComponent(slug)}${query({ viewer })}`);
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));

  if (res.ok) return json as PrepareDraftBundle;
  if (res.status === 401 && json?.code === "PRIVATE_DRAFT_AUTH_REQUIRED") {
    return retryPrivateReadWithAuth(url, viewer, json, json?.draftId || null);
  }

  throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
}

export async function followDraft(input: DraftActionAuth | string, walletAddress?: string): Promise<{ following: boolean; followCount: number }> {
  const auth = typeof input === "string"
    ? await signPrepareEngagement({ action: "follow_draft", draftId: input, walletAddress: walletAddress || "" })
    : input;

  const draftId = String(auth.draftId || "");
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/follow`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth }),
  });
  const json = await parseJson(res);
  return { following: Boolean(json.following), followCount: Number(json.followCount || 0) };
}

export async function fetchDraftComments(draftId: string): Promise<DraftComment[]> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/comments`));
  const json = await parseJson(res);
  return Array.isArray(json.items) ? (json.items as DraftComment[]) : [];
}

export async function addDraftComment(
  input: DraftActionAuth | string,
  walletAddressOrBody: string,
  bodyOrParentCommentId?: string | null,
  parentCommentIdArg?: string | null
): Promise<DraftComment> {
  const oldSignature = typeof input === "string";
  const draftId = oldSignature ? input : String(input.draftId || "");
  const auth = oldSignature
    ? await signPrepareEngagement({ action: "comment_draft", draftId, walletAddress: walletAddressOrBody })
    : input;
  const body = oldSignature ? String(bodyOrParentCommentId || "") : walletAddressOrBody;
  const parentCommentId = oldSignature ? parentCommentIdArg : bodyOrParentCommentId;

  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/comments`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth, body, parentCommentId: parentCommentId || null }),
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

export async function markDraftDeployed(
  draftId: string,
  input: {
    auth: DraftActionAuth;
    campaignAddress: string;
    tokenAddress?: string | null;
    deployTxHash?: string | null;
  }
): Promise<CampaignDraft> {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/deploy`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = await parseJson(res);
  return json.draft as CampaignDraft;
}