import { apiFetch, apiUrl } from "@/lib/apiBase";
import { isSolanaDraftChainId } from "@/lib/draftChains";
import type { DraftActionAuth, DraftAuthAction } from "@/lib/draftAuth";
import type { DraftComment, PrepareDraftBundle } from "@/lib/draftApi";
import { connectSolanaWallet, getSolanaProvider, signSolanaDraftAction } from "@/lib/solanaWallet";

function solanaWalletAddress() {
  return getSolanaProvider()?.publicKey?.toString?.() || "";
}

async function ensureSolanaWallet(walletAddress?: string | null) {
  const connected = solanaWalletAddress();
  if (walletAddress && connected === walletAddress) return walletAddress;
  if (connected) return connected;
  return connectSolanaWallet();
}

function buildSolanaConnectedAuth(input: {
  action: DraftAuthAction;
  walletAddress: string;
  chainId: number;
  draftId?: string | null;
}): DraftActionAuth & { walletType: "solana" } {
  return {
    action: input.action,
    walletType: "solana",
    walletAddress: input.walletAddress,
    chainId: Number(input.chainId),
    draftId: input.draftId || null,
    nonce: "",
    message: "",
    signature: "",
  };
}

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

export function getCurrentSolanaAddress() {
  return solanaWalletAddress();
}

export async function connectCurrentSolanaAddress() {
  return ensureSolanaWallet();
}

export function isSolanaDraftOwner(bundle: PrepareDraftBundle | null, walletAddress: string) {
  const draft = bundle?.draft;
  return Boolean(draft && isSolanaDraftChainId(draft.chainId) && walletAddress && draft.creatorWallet === walletAddress);
}

export async function fetchCampaignDraftWithSolanaOwner(draftId: string): Promise<PrepareDraftBundle> {
  const url = apiUrl(`/api/drafts/${encodeURIComponent(draftId)}`);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));

  if (res.ok) return json as PrepareDraftBundle;

  const chainId = Number(json?.chainId);
  if (res.status !== 401 || json?.code !== "PRIVATE_DRAFT_AUTH_REQUIRED" || !isSolanaDraftChainId(chainId)) {
    throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
  }

  const walletAddress = solanaWalletAddress() || await connectSolanaWallet();
  const auth = buildSolanaConnectedAuth({ action: "read_draft", walletAddress, chainId, draftId });
  const authed = await apiFetch(`/api/drafts/${encodeURIComponent(draftId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth }),
  });
  return parseJson(authed) as Promise<PrepareDraftBundle>;
}

export async function saveSolanaDraftPromotion(
  draftId: string,
  chainId: number,
  walletAddress: string,
  input: Record<string, unknown> & { publish?: boolean },
): Promise<PrepareDraftBundle> {
  const auth = buildSolanaConnectedAuth({
    action: input.publish ? "publish_promotion" : "save_promotion",
    walletAddress,
    chainId,
    draftId,
  });
  const res = await apiFetch(`/api/drafts/${encodeURIComponent(draftId)}/promotion`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, auth }),
  });
  return parseJson(res) as Promise<PrepareDraftBundle>;
}

export async function archiveSolanaCampaignDraft(draftId: string, chainId: number, walletAddress: string): Promise<PrepareDraftBundle> {
  const auth = buildSolanaConnectedAuth({ action: "archive_draft", walletAddress, chainId, draftId });
  const res = await apiFetch(`/api/drafts/${encodeURIComponent(draftId)}/archive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth }),
  });
  return parseJson(res) as Promise<PrepareDraftBundle>;
}

export async function followSolanaDraft(
  draftId: string,
  walletAddress?: string | null,
): Promise<{ following: boolean; followCount: number; walletAddress: string }> {
  const wallet = await ensureSolanaWallet(walletAddress);
  const res = await apiFetch(`/api/drafts/${encodeURIComponent(draftId)}/follow`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet }),
  });
  const json = await parseJson(res);
  return {
    following: Boolean(json.following),
    followCount: Number(json.followCount || 0),
    walletAddress: wallet,
  };
}

export async function armSolanaDraftNotifications(
  draftId: string,
  chainId: number,
  walletAddress?: string | null,
): Promise<{ armed: boolean; walletAddress: string }> {
  const wallet = await ensureSolanaWallet(walletAddress);
  const auth = await signSolanaDraftAction({
    action: "arm_draft_notifications",
    walletAddress: wallet,
    chainId,
    draftId,
  });
  const res = await apiFetch(`/api/drafts/${encodeURIComponent(draftId)}/notifications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth }),
  });
  const json = await parseJson(res);
  return { armed: Boolean(json.armed), walletAddress: wallet };
}

export async function addSolanaDraftComment(
  draftId: string,
  chainId: number,
  body: string,
  parentCommentId?: string | null,
  walletAddress?: string | null,
): Promise<{ comment: DraftComment; walletAddress: string }> {
  const wallet = await ensureSolanaWallet(walletAddress);
  const auth = await signSolanaDraftAction({
    action: "comment_draft",
    walletAddress: wallet,
    chainId,
    draftId,
  });
  const res = await apiFetch(`/api/drafts/${encodeURIComponent(draftId)}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth, body, parentCommentId: parentCommentId || null }),
  });
  const json = await parseJson(res);
  return { comment: json.comment as DraftComment, walletAddress: wallet };
}
