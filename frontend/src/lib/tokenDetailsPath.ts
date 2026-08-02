/**
 * Canonical public Token Details route uses the ERC-20 token address.
 * Bonding / market APIs still key by LaunchCampaign internally — resolve first.
 */

export function normalizeEvmAddress(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(raw) ? raw : "";
}

/**
 * Build `/token/:tokenAddress` for navigation.
 * Prefer tokenAddress; fall back to campaign only when token is unknown.
 */
export function tokenDetailsPath(
  tokenOrCampaign: {
    tokenAddress?: string | null;
    token?: string | null;
    campaignAddress?: string | null;
    campaign?: string | null;
    chainId?: number | null;
  },
  options?: { chainId?: number; search?: string },
): string {
  const token =
    normalizeEvmAddress(tokenOrCampaign.tokenAddress) ||
    normalizeEvmAddress(tokenOrCampaign.token);
  const campaign =
    normalizeEvmAddress(tokenOrCampaign.campaignAddress) ||
    normalizeEvmAddress(tokenOrCampaign.campaign);
  const id = token || campaign;
  if (!id) return "/";

  const chainId = Number(options?.chainId ?? tokenOrCampaign.chainId ?? 0);
  const params = new URLSearchParams();
  if (Number.isFinite(chainId) && chainId > 0) params.set("chainId", String(chainId));

  const extra = String(options?.search || "").replace(/^\?/, "");
  if (extra) {
    const extraParams = new URLSearchParams(extra);
    extraParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }

  const qs = params.toString();
  return qs ? `/token/${id}?${qs}` : `/token/${id}`;
}
