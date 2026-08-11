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
 *   factoryAddress?: string | null,
 * }} input
 * @returns {Promise<{ ok: boolean, row?: any, error?: string, attempts?: string[] }>}
 */
export async function upsertCampaignFromDraft(db, input) {
  const chainId = Number(input.chainId);
  const campaignAddress = normalizeRegistryAddress(input.campaignAddress, chainId);
  if (!Number.isFinite(chainId) || !campaignAddress) {
    return { ok: false, error: "Missing chainId or campaignAddress for campaigns upsert." };
  }

  const tokenAddress = normalizeRegistryAddress(input.tokenAddress, chainId);
  const creatorAddress = normalizeRegistryAddress(input.creatorWallet, chainId);
  const name = String(input.name || "").trim() || null;
  const symbol = String(input.symbol || "").trim().toUpperCase() || null;
  const logoUri = String(input.logoUrl || "").trim() || null;
  const factoryAddress = String(input.factoryAddress || "").trim() || null;
  const attempts = [];

  // Try progressively simpler inserts so partial schemas still register the campaign.
  const strategies = [
    {
      label: "full",
      sql: `insert into public.campaigns (
              chain_id, campaign_address, token_address, creator_address,
              name, symbol, logo_uri, factory_address,
              created_block, is_active, launched, created_at_chain, created_at, updated_at
            ) values (
              $1,$2,$3,$4,$5,$6,$7,$8,
              0, true, true, now(), now(), now()
            )
            on conflict (chain_id, campaign_address) do update set
              token_address = coalesce(excluded.token_address, campaigns.token_address),
              creator_address = coalesce(excluded.creator_address, campaigns.creator_address),
              name = coalesce(excluded.name, campaigns.name),
              symbol = coalesce(excluded.symbol, campaigns.symbol),
              logo_uri = coalesce(nullif(excluded.logo_uri, ''), campaigns.logo_uri),
              factory_address = coalesce(excluded.factory_address, campaigns.factory_address),
              is_active = true,
              launched = true,
              updated_at = now()
            returning chain_id, campaign_address, token_address, creator_address, name, symbol`,
      params: [chainId, campaignAddress, tokenAddress, creatorAddress, name, symbol, logoUri, factoryAddress],
    },
    {
      label: "no_logo_factory",
      sql: `insert into public.campaigns (
              chain_id, campaign_address, token_address, creator_address,
              name, symbol, created_block, is_active, created_at_chain, created_at, updated_at
            ) values (
              $1,$2,$3,$4,$5,$6, 0, true, now(), now(), now()
            )
            on conflict (chain_id, campaign_address) do update set
              token_address = coalesce(excluded.token_address, campaigns.token_address),
              creator_address = coalesce(excluded.creator_address, campaigns.creator_address),
              name = coalesce(excluded.name, campaigns.name),
              symbol = coalesce(excluded.symbol, campaigns.symbol),
              is_active = true,
              updated_at = now()
            returning chain_id, campaign_address, token_address, creator_address, name, symbol`,
      params: [chainId, campaignAddress, tokenAddress, creatorAddress, name, symbol],
    },
    {
      label: "minimal",
      sql: `insert into public.campaigns (
              chain_id, campaign_address, token_address, creator_address, name, symbol, is_active
            ) values ($1,$2,$3,$4,$5,$6,true)
            on conflict (chain_id, campaign_address) do update set
              token_address = coalesce(excluded.token_address, campaigns.token_address),
              creator_address = coalesce(excluded.creator_address, campaigns.creator_address),
              name = coalesce(excluded.name, campaigns.name),
              symbol = coalesce(excluded.symbol, campaigns.symbol),
              is_active = true,
              updated_at = now()
            returning chain_id, campaign_address, token_address, creator_address, name, symbol`,
      params: [chainId, campaignAddress, tokenAddress, creatorAddress, name, symbol],
    },
  ];

  let lastError = null;
  for (const strategy of strategies) {
    try {
      const result = await db.query(strategy.sql, strategy.params);
      const row = result.rows[0] || null;
      if (row) {
        attempts.push(`${strategy.label}:ok`);
        console.info("[campaign-registry] upsert ok", {
          strategy: strategy.label,
          chainId,
          campaignAddress,
          tokenAddress,
        });
        return { ok: true, row, attempts };
      }
      attempts.push(`${strategy.label}:empty`);
    } catch (error) {
      lastError = error;
      attempts.push(`${strategy.label}:${error?.code || error?.message || "error"}`);
      console.warn("[campaign-registry] upsert attempt failed", strategy.label, error?.message || error);
    }
  }

  return {
    ok: false,
    error: String(lastError?.message || lastError || "campaigns upsert failed"),
    attempts,
  };
}

/**
 * Resolve a campaign or mint from campaigns + campaign_drafts (Solana-safe, case-preserving).
 */
export async function resolveCampaignByAddress(db, { chainId, address }) {
  const chain = Number(chainId);
  const addr = String(address || "").trim();
  if (!Number.isFinite(chain) || !addr) return null;

  const isSolana = isSolanaChain(chain);
  if (isSolana) {
    const camp = await db.query(
      `select chain_id, campaign_address, token_address, creator_address, name, symbol, logo_uri,
              created_at_chain, created_at, is_active
         from public.campaigns
        where chain_id = $1
          and (campaign_address = $2 or token_address = $2)
        limit 1`,
      [chain, addr],
    );
    if (camp.rows[0]) {
      return { source: "campaigns", ...camp.rows[0] };
    }
    const draft = await db.query(
      `select chain_id, campaign_address, token_address, creator_wallet as creator_address,
              name, ticker as symbol, logo_url as logo_uri,
              deployed_at as created_at_chain, created_at, true as is_active,
              id as draft_id, slug, status, visibility
         from public.campaign_drafts
        where chain_id = $1
          and campaign_address is not null
          and (campaign_address = $2 or token_address = $2)
        order by updated_at desc
        limit 1`,
      [chain, addr],
    );
    if (draft.rows[0]) {
      return { source: "campaign_drafts", ...draft.rows[0] };
    }
    return null;
  }

  const lower = addr.toLowerCase();
  const camp = await db.query(
    `select chain_id, campaign_address, token_address, creator_address, name, symbol, logo_uri,
            created_at_chain, created_at, is_active
       from public.campaigns
      where chain_id = $1
        and (lower(campaign_address) = $2 or lower(coalesce(token_address,'')) = $2)
      limit 1`,
    [chain, lower],
  );
  return camp.rows[0] ? { source: "campaigns", ...camp.rows[0] } : null;
}
