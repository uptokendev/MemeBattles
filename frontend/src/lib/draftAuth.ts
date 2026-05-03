import type { JsonRpcSigner } from "ethers";
import { buildRealtimeApiUrl } from "@/lib/realtimeApi";

export type DraftAuthAction =
  | "create_draft"
  | "save_promotion"
  | "publish_promotion"
  | "archive_draft";

export type DraftActionAuth = {
  action: DraftAuthAction;
  walletAddress: string;
  chainId: number;
  draftId?: string | null;
  nonce: string;
  message: string;
  signature: string;
};

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

export async function signDraftAction(input: {
  signer: JsonRpcSigner | null | undefined;
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId?: string | null;
}): Promise<DraftActionAuth> {
  if (!input.signer) {
    throw new Error("Wallet signer unavailable. Reconnect your wallet and try again.");
  }

  const walletAddress = normalizeWallet(input.walletAddress);
  if (!walletAddress) {
    throw new Error("Wallet address missing. Reconnect your wallet and try again.");
  }

  const chainId = Number(input.chainId);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("Invalid wallet chain. Reconnect your wallet and try again.");
  }

  const nonce = await fetchNonce(chainId, walletAddress);

  const message = buildDraftAuthMessage({
    action: input.action,
    walletAddress,
    chainId,
    nonce,
    draftId: input.draftId || null,
  });

  const signature = await input.signer.signMessage(message);

  return {
    action: input.action,
    walletAddress,
    chainId,
    draftId: input.draftId || null,
    nonce,
    message,
    signature,
  };
}