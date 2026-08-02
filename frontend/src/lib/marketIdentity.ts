import { apiFetch } from "@/lib/apiBase";
import { normalizeEvmAddress } from "@/lib/tokenDetailsPath";

export type MarketIdentity = {
  chainId: number;
  campaignAddress: string;
  tokenAddress: string;
  matchedBy: "campaign" | "token";
  inputAddress: string;
  publicUrlAddress: string;
};

/**
 * Resolve public token URL id or campaign address to both identities via Railway indexer.
 */
export async function resolveMarketIdentity(input: {
  address: string;
  chainId: number;
  signal?: AbortSignal;
}): Promise<MarketIdentity | null> {
  const address = normalizeEvmAddress(input.address);
  const chainId = Number(input.chainId || 97);
  if (!address || !Number.isFinite(chainId)) return null;

  try {
    const response = await apiFetch(
      `/api/market/resolve?chainId=${chainId}&address=${address}`,
      { method: "GET", cache: "no-store", signal: input.signal },
    );
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    if (!body?.ok) return null;
    const campaignAddress = normalizeEvmAddress(body.campaignAddress);
    const tokenAddress = normalizeEvmAddress(body.tokenAddress);
    if (!campaignAddress) return null;
    return {
      chainId,
      campaignAddress,
      tokenAddress,
      matchedBy: body.matchedBy === "token" ? "token" : "campaign",
      inputAddress: normalizeEvmAddress(body.inputAddress) || address,
      publicUrlAddress: normalizeEvmAddress(body.publicUrlAddress) || tokenAddress || campaignAddress,
    };
  } catch {
    return null;
  }
}
