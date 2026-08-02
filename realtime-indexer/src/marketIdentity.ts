import { pool } from "./db.js";

/**
 * Public TokenDetails URLs use the ERC-20 token address (stable, human-facing).
 * All market / trade / candle tables are keyed by LaunchCampaign (bonding curve).
 *
 * Resolve either address form to the canonical pair before querying.
 */

export type MarketIdentity = {
  chainId: number;
  /** LaunchCampaign / bonding-curve address (API + DB key). */
  campaignAddress: string;
  /** ERC-20 token address (public URL id). */
  tokenAddress: string;
  /** Which form the caller supplied. */
  matchedBy: "campaign" | "token";
  /** Raw normalized input. */
  inputAddress: string;
};

function normalizeAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isEvmAddress(value: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(value);
}

/**
 * Resolve a path/query address that may be either the campaign or the token.
 * Returns null when neither matches a known campaigns row on this chain.
 */
export async function resolveMarketIdentity(
  chainId: number,
  addressOrToken: string,
): Promise<MarketIdentity | null> {
  const input = normalizeAddress(addressOrToken);
  if (!Number.isInteger(chainId) || chainId <= 0 || !isEvmAddress(input)) {
    return null;
  }

  // Prefer exact campaign match, then token match (token is the public URL id).
  const result = await pool.query(
    `select
       campaign_address,
       token_address
     from public.campaigns
     where chain_id = $1
       and (
         campaign_address = $2
         or token_address = $2
       )
     order by
       case when campaign_address = $2 then 0 else 1 end,
       updated_at desc nulls last
     limit 1`,
    [chainId, input],
  );

  const row = result.rows[0];
  if (!row) return null;

  const campaignAddress = normalizeAddress(row.campaign_address);
  const tokenAddress = normalizeAddress(row.token_address);
  if (!isEvmAddress(campaignAddress)) return null;

  return {
    chainId,
    campaignAddress,
    tokenAddress: isEvmAddress(tokenAddress) ? tokenAddress : "",
    matchedBy: campaignAddress === input ? "campaign" : "token",
    inputAddress: input,
  };
}

/**
 * Like resolveMarketIdentity, but if the address is a valid EVM address and not
 * in DB yet, still return it as a provisional campaign address so legacy
 * campaign-only callers keep working during discovery lag.
 */
export async function resolveMarketIdentityOrPassthrough(
  chainId: number,
  addressOrToken: string,
): Promise<MarketIdentity> {
  const input = normalizeAddress(addressOrToken);
  const resolved = await resolveMarketIdentity(chainId, input);
  if (resolved) return resolved;

  return {
    chainId,
    campaignAddress: input,
    tokenAddress: "",
    matchedBy: "campaign",
    inputAddress: input,
  };
}
