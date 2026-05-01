import { pool } from "../../server/db.js";
import { badMethod, isAddress, json, readJson } from "../../server/http.js";

function cleanText(value, max = 280) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanAddress(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function metadataUrlFromRequest(req, chainId, tokenAddress, campaignAddress) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const address = cleanAddress(tokenAddress) || cleanAddress(campaignAddress);
  if (!host || !address) return "";
  return `${proto}://${host}/api/token-metadata/${chainId}/${address}`;
}

async function mirrorTokenMetadata(req, body) {
  const chainId = Number(body.chainId);
  const campaignAddress = cleanAddress(body.campaignAddress);
  const tokenAddress = cleanAddress(body.tokenAddress);
  const creatorAddress = cleanAddress(body.creatorAddress);
  const name = cleanText(body.name, 64);
  const symbol = cleanText(body.symbol, 16);
  const description = cleanText(body.description, 1000) || null;
  const logoUri = cleanText(body.logoURI ?? body.logoUri ?? body.logo_url, 1000) || null;
  const website = cleanText(body.website, 500) || null;
  const xAccount = cleanText(body.xAccount ?? body.twitter, 500) || null;
  const telegram = cleanText(body.telegram, 500) || null;
  const discord = cleanText(body.discord, 500) || null;
  const externalUrl = cleanText(body.externalUrl ?? body.external_url, 1000) || null;
  const metadataUri = cleanText(body.metadataURI ?? body.metadataUri ?? body.metadata_url, 1000)
    || metadataUrlFromRequest(req, chainId, tokenAddress, campaignAddress)
    || null;

  if (!Number.isFinite(chainId) || (!campaignAddress && !tokenAddress)) return;

  try {
    await pool.query(
      `insert into public.token_metadata_registry (
         chain_id,
         campaign_address,
         token_address,
         creator_address,
         name,
         symbol,
         description,
         logo_uri,
         metadata_uri,
         external_url,
         website,
         x_account,
         telegram,
         discord,
         source,
         metadata
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, 'campaigns_upsert', $15::jsonb
       )
       on conflict (chain_id, lower(campaign_address))
       where campaign_address is not null
       do update set
         token_address = coalesce(excluded.token_address, public.token_metadata_registry.token_address),
         creator_address = coalesce(excluded.creator_address, public.token_metadata_registry.creator_address),
         name = coalesce(nullif(excluded.name, ''), public.token_metadata_registry.name),
         symbol = coalesce(nullif(excluded.symbol, ''), public.token_metadata_registry.symbol),
         description = coalesce(excluded.description, public.token_metadata_registry.description),
         logo_uri = coalesce(excluded.logo_uri, public.token_metadata_registry.logo_uri),
         metadata_uri = coalesce(excluded.metadata_uri, public.token_metadata_registry.metadata_uri),
         external_url = coalesce(excluded.external_url, public.token_metadata_registry.external_url),
         website = coalesce(excluded.website, public.token_metadata_registry.website),
         x_account = coalesce(excluded.x_account, public.token_metadata_registry.x_account),
         telegram = coalesce(excluded.telegram, public.token_metadata_registry.telegram),
         discord = coalesce(excluded.discord, public.token_metadata_registry.discord),
         metadata = public.token_metadata_registry.metadata || excluded.metadata`,
      [
        chainId,
        campaignAddress || null,
        tokenAddress || null,
        creatorAddress || null,
        name || null,
        symbol || null,
        description,
        logoUri,
        metadataUri,
        externalUrl,
        website,
        xAccount,
        telegram,
        discord,
        JSON.stringify({
          mirroredAt: new Date().toISOString(),
          rawSource: "campaigns_upsert",
        }),
      ],
    );
  } catch (error) {
    if (error?.code === "42P01" || error?.code === "42703") {
      console.warn("[api/campaigns/upsert] token metadata registry unavailable; skipping metadata mirror");
      return;
    }
    console.warn("[api/campaigns/upsert] metadata mirror failed", error);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);

  try {
    const b = await readJson(req);
    const chainId = Number(b.chainId);
    const campaignAddress = cleanAddress(b.campaignAddress);
    const tokenAddress = cleanAddress(b.tokenAddress);
    const creatorAddress = cleanAddress(b.creatorAddress);
    const name = cleanText(b.name, 64);
    const symbol = cleanText(b.symbol, 16);

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(campaignAddress)) return json(res, 400, { error: "Invalid campaignAddress" });
    if (!isAddress(tokenAddress)) return json(res, 400, { error: "Invalid tokenAddress" });
    if (!isAddress(creatorAddress)) return json(res, 400, { error: "Invalid creatorAddress" });

    await pool.query(
      `INSERT INTO campaigns (chain_id, campaign_address, token_address, creator_address, name, symbol)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (chain_id, campaign_address)
       DO UPDATE SET
         token_address = EXCLUDED.token_address,
         creator_address = EXCLUDED.creator_address,
         name = EXCLUDED.name,
         symbol = EXCLUDED.symbol,
         updated_at = NOW()`,
      [chainId, campaignAddress, tokenAddress, creatorAddress, name, symbol]
    );

    await mirrorTokenMetadata(req, b);

    return json(res, 200, {
      ok: true,
      metadataUri: metadataUrlFromRequest(req, chainId, tokenAddress, campaignAddress) || null,
    });
  } catch (e) {
    console.error("[api/campaigns/upsert]", e);
    return json(res, 500, { error: "Server error" });
  }
}
