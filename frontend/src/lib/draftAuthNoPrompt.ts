import type { JsonRpcSigner } from "ethers";

export type DraftAuthAction =
  | "create_draft"
  | "read_draft"
  | "save_promotion"
  | "publish_promotion"
  | "archive_draft"
  | "deploy_draft"
  | "follow_draft"
  | "comment_draft"
  | "arm_draft_notifications"
  | "draft_owner_session";

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

export function clearCachedDraftOwnerSession(_input: { walletAddress: string; chainId: number; draftId: string }) {
  // No separate draft owner session is used in this migration scope.
}

export function cacheDraftOwnerSessionFromCreateAuth(_input: {
  auth: DraftActionAuth;
  walletAddress: string;
  chainId: number;
  draftId: string;
}) {
  // No separate draft owner session is used in this migration scope.
}

export async function signDraftAction(input: {
  signer: JsonRpcSigner | null | undefined;
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId?: string | null;
  forceNewOwnerSession?: boolean;
}): Promise<DraftActionAuth> {
  const walletAddress = normalizeWallet(input.walletAddress);
  if (!walletAddress) throw new Error("Wallet address missing. Reconnect your wallet and try again.");

  const chainId = Number(input.chainId);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("Invalid wallet chain. Reconnect your wallet and try again.");
  }

  if (input.action === "create_draft") {
    const original = await import("./draftAuth");
    return original.signDraftAction(input);
  }

  return {
    action: input.action,
    walletAddress,
    chainId,
    draftId: input.draftId || null,
    nonce: "",
    message: "",
    signature: "",
  };
}
