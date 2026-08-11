/**
 * Canonical public Token Details route uses token mint/address when known.
 * Bonding / market APIs still key by campaign internally — resolve first.
 */

export function normalizeEvmAddress(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(raw) ? raw : "";
}

export function isSolanaBase58Address(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  return raw.length >= 32 && raw.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(raw) && !raw.startsWith("0x");
}

/** Preserve Solana base58 case; lowercase EVM. */
export function normalizeTokenRouteAddress(value: unknown, chainId?: number | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (Number(chainId) === 101 || Number(chainId) === 102 || isSolanaBase58Address(raw)) {
    return isSolanaBase58Address(raw) ? raw : "";
  }
  return normalizeEvmAddress(raw);
}

/**
 * Build `/token/:tokenAddress` for navigation.
 * Prefer tokenAddress; fall back to campaign only when token is unknown.
 * Always attach chainId for Solana (101) so TokenDetails does not default to EVM.
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
  const chainId = Number(options?.chainId ?? tokenOrCampaign.chainId ?? 0);
  const isSolana = chainId === 101 || chainId === 102;

  const token = isSolana
    ? normalizeTokenRouteAddress(tokenOrCampaign.tokenAddress ?? tokenOrCampaign.token, chainId)
    : normalizeEvmAddress(tokenOrCampaign.tokenAddress) || normalizeEvmAddress(tokenOrCampaign.token);
  const campaign = isSolana
    ? normalizeTokenRouteAddress(tokenOrCampaign.campaignAddress ?? tokenOrCampaign.campaign, chainId)
    : normalizeEvmAddress(tokenOrCampaign.campaignAddress) || normalizeEvmAddress(tokenOrCampaign.campaign);

  // If chainId omitted but address is Solana base58, still build a Solana route.
  const looseToken =
    token ||
    (isSolanaBase58Address(tokenOrCampaign.tokenAddress || tokenOrCampaign.token)
      ? String(tokenOrCampaign.tokenAddress || tokenOrCampaign.token).trim()
      : "");
  const looseCampaign =
    campaign ||
    (isSolanaBase58Address(tokenOrCampaign.campaignAddress || tokenOrCampaign.campaign)
      ? String(tokenOrCampaign.campaignAddress || tokenOrCampaign.campaign).trim()
      : "");

  const id = looseToken || looseCampaign;
  if (!id) return "/";

  const params = new URLSearchParams();
  // Always pin Solana; for EVM only attach chainId when the caller provided one
  // (preserves legacy `/token/0x…` links without forcing ?chainId=).
  const resolvedChain = isSolana
    ? chainId || 101
    : isSolanaBase58Address(id)
      ? 101
      : Number.isFinite(chainId) && chainId > 0
        ? chainId
        : 0;
  if (resolvedChain === 101 || resolvedChain === 102) {
    params.set("chainId", String(resolvedChain));
  } else if (resolvedChain > 0 && (options?.chainId != null || tokenOrCampaign.chainId != null)) {
    // Explicit chain from caller (Create / Featured) — keep multi-chain BNB correct.
    params.set("chainId", String(resolvedChain));
  }

  const extra = String(options?.search || "").replace(/^\?/, "");
  if (extra) {
    const extraParams = new URLSearchParams(extra);
    extraParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }

  // encodeURIComponent is a no-op for 0x hex; required for some base58 edge chars.
  const qs = params.toString();
  return qs ? `/token/${encodeURIComponent(id)}?${qs}` : `/token/${encodeURIComponent(id)}`;
}
