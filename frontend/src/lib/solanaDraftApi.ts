import { apiFetch, apiUrl } from "@/lib/apiBase";
import { isSolanaDraftChainId } from "@/lib/draftChains";
import type { DraftActionAuth, DraftAuthAction } from "@/lib/draftAuth";
import type { PrepareDraftBundle } from "@/lib/draftApi";
import { connectSolanaWallet, getSolanaProvider } from "@/lib/solanaWallet";

function solanaWalletAddress() {
  return getSolanaProvider()?.publicKey?.toString?.() || "";
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
