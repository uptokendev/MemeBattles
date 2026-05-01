import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json } from "../server/http.js";

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function absoluteUrl(req, path) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return path;
  return `${proto}://${host}${path}`;
}

function campaignUrl(req, chainId, campaignAddress, tokenAddress) {
  const identifier = tokenAddress || campaignAddress || "";
  return absoluteUrl(req, `/token/${identifier}?chainId=${chainId}`);
}

function metadataPayload(req, row) {
  const chainId = Number(row.chain_id);
  const campaignAddress = row.campaign_address ? String(row.campaign_address).toLowerCase() : null;
  const tokenAddress = row.token_address ? String(row.token_address).toLowerCase() : null;
  const logoUri = row.logo_uri || row.image || null;
  const externalUrl = row.external_url || campaignUrl(req, chainId, campaignAddress, tokenAddress);

  return {
    name: row.name || row.symbol || "MemeWarzone Token",
    symbol: row.symbol || "MWZ",
    description: row.description || row.metadata?.description || "Launched on MemeWarzone.",
    image: logoUri,
    image_url: logoUri,
    external_url: externalUrl,
    animation_url: row.metadata?.animation_url || null,
    attributes: [
      { trait_type: "Launchpad", value: "MemeWarzone" },
      { trait_type: "Chain ID", value: chainId },
      ...(campaignAddress ? [{ trait_type: "Campaign", value: campaignAddress }] : []),
      ...(tokenAddress ? [{ trait_type: "Token", value: tokenAddress }] : []),
    ],
    properties: {
      launchpad: "MemeWarzone",
      chainId,
      campaignAddress,
      tokenAddress,
      creatorAddress: row.creator_address ? String(row.creator_address).toLowerCase() : null,
      website: row.website || null,
      x: row.x_account || null,
      telegram: row.telegram || null,
      discord: row.discord || null,
      source: row.source || "memewarzone",
    },
  };
}

async function findMetadata({ chainId, address }) {
  const registry = await pool.query(
    `select *
       from public.token_metadata_registry
      where chain_id = $1
        and (lower(campaign_address) = $2 or lower(token_address) = $2)
      limit 1`,
    [chainId, address],
  );
  if (registry.rows[0]) return registry.rows[0];

  const campaigns = await pool.query(
    `select chain_id,
            campaign_address,
            token_address,
            creator_address,
            name,
            symbol,
            null::text as description,
            logo_uri,
            null::text as metadata_uri,
            null::text as external_url,
            website,
            x_account,
            null::text as telegram,
            null::text as discord,
            'campaigns'::text as source,
            '{}'::jsonb as metadata
       from public.campaigns
      where chain_id = $1
        and (lower(campaign_address) = $2 or lower(token_address) = $2)
      limit 1`,
    [chainId, address],
  );
  return campaigns.rows[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = toInt(req.params?.chainId || q.chainId, 97);
    const address = cleanAddress(req.params?.address || q.address || q.token || q.campaign);

    if (!address) return json(res, 400, { error: "Invalid or missing token/campaign address" });

    const row = await findMetadata({ chainId, address });
    if (!row) return json(res, 404, { error: "Token metadata not found" });

    res.setHeader("cache-control", "public, max-age=60, s-maxage=300");
    return json(res, 200, metadataPayload(req, row));
  } catch (error) {
    console.error("[api/token-metadata]", error);
    return json(res, 500, { error: "Server error" });
  }
}
