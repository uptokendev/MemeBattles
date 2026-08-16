import { isAddress, isSolanaAddress, isSolanaChain } from "../../server/http.js";

export function canonCampaign(chainId, value) {
  const raw = String(value ?? "").trim();
  if (isSolanaChain(chainId)) return isSolanaAddress(raw) ? raw : "";
  const lower = raw.toLowerCase();
  return isAddress(lower) ? lower : "";
}

export function canonWallet(chainId, value) {
  const raw = String(value ?? "").trim();
  if (isSolanaChain(chainId) || isSolanaAddress(raw)) return isSolanaAddress(raw) ? raw : "";
  const lower = raw.toLowerCase();
  return isAddress(lower) ? lower : "";
}

export function buildCommentMessage({ chainId, address, campaignAddress, nonce, body }) {
  const bodyPreview = String(body ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  const solana = isSolanaChain(chainId) || isSolanaAddress(address);
  return [
    "MemeWarzone Comment",
    "Action: COMMENT_CREATE",
    `ChainId: ${chainId}`,
    `Address: ${solana ? address : String(address).toLowerCase()}`,
    `Campaign: ${solana ? campaignAddress : String(campaignAddress).toLowerCase()}`,
    `Nonce: ${nonce}`,
    "",
    bodyPreview,
  ].join("\n");
}
