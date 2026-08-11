/**
 * Upsert a deployed draft into public.campaigns so home/token feeds can see it
 * without waiting for an indexer (critical for Solana V4 create).
 */
import { isSolanaChain } from "../../server/http.js";

function normalizeRegistryAddress(value, chainId) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (isSolanaChain(chainId)) return raw;
  return raw.toLowerCase();
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{
 *   chainId: number,
 *   campaignAddress: string,
 *   tokenAddress?: string | null,
 *   creatorWallet: string,
 *   name?: string | null,
 *   symbol?: string | null,
 *   logoUrl?: string | null,
 *   deployTxHash?: string | null,
 * }} input
 */
export async function upsertCampaignFromDraft(db, input) {
  const chainId = Number(input.chainId);
  const campaignAddress = normalizeRegistryAddress(input.campaignAddress, chainId);
  if (!Number.isFinite(chainId) || !campaignAddress) return null;

  const tokenAddress = normalizeRegistryAddress(input.tokenAddress, chainId);
  const creatorAddress = normalizeRegistryAddress(input.creatorWallet, chainId);
  const name = String(input.name || "").trim() || null;
  const symbol = String(input.symbol || "").trim().toUpperCase() || null;
  const logoUri = String(input.logoUrl || "").trim() || null;

  try {
    const result = await db.query(
      `insert into public.campaigns (
         chain_id,
         campaign_address,
         token_address,
         creator_address,
         name,
         symbol,
         logo_uri,
         created_block,
         is_active,
         created_at_chain,
         created_at,
         updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         0, true, now(), now(), now()
       )
       on conflict (chain_id, campaign_address) do update set
         token_address = coalesce(excluded.token_address, campaigns.token_address),
         creator_address = coalesce(excluded.creator_address, campaigns.creator_address),
         name = coalesce(excluded.name, campaigns.name),
         symbol = coalesce(excluded.symbol, campaigns.symbol),
         logo_uri = coalesce(nullif(excluded.logo_uri, ''), campaigns.logo_uri),
         is_active = true,
         updated_at = now()
       returning chain_id, campaign_address, token_address, creator_address, name, symbol`,
      [chainId, campaignAddress, tokenAddress, creatorAddress, name, symbol, logoUri],
    );
    return result.rows[0] || null;
  } catch (error) {
    // Do not fail deploy mark if registry upsert is blocked (legacy lowercase checks, etc.).
    console.warn("[campaign-registry] upsert failed", error?.message || error);
    return null;
  }
}
