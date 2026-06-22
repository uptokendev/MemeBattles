import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function externalPlacements(chainId) {
  const raw = String(process.env.SPONSORED_PLACEMENTS_JSON || process.env.VITE_SPONSORED_PLACEMENTS_JSON || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    return items.filter((item) => item && (item.chainId == null || Number(item.chainId) === Number(chainId))).map((item, index) => ({
      chainId: item.chainId ?? chainId,
      campaignAddress: String(item.campaignAddress || item.campaign || `external-sponsored-${index}`),
      tokenAddress: item.tokenAddress ?? null,
      creatorAddress: item.creatorAddress ?? null,
      name: String(item.name || item.title || "Sponsored project"),
      symbol: String(item.symbol || item.ticker || "SPON"),
      logoUri: item.logoUri || item.logoURI || item.logoUrl || item.imageUrl || null,
      isActive: true,
      marketcapBnb: Number(item.marketcapBnb || 0),
      vol24hBnb: Number(item.vol24hBnb || item.volumeBnb || 0),
      holderCount: Number(item.holderCount || 0),
      raisedTotalBnb: Number(item.raisedTotalBnb || 0),
      votes24h: Number(item.votes24h || 0),
      votesAllTime: Number(item.votesAllTime || 0),
      placementType: "external",
      placementLabel: String(item.placementLabel || item.slotLabel || "Sponsored"),
      placementPriority: Number(item.priority || 1000 + index),
      targetUrl: item.targetUrl || item.url || item.websiteUrl || null,
      startsAt: item.startsAt || null,
      endsAt: item.endsAt || null,
      bio: item.bio || item.summary || item.description || null,
      websiteUrl: item.websiteUrl || item.targetUrl || item.url || null,
    }));
  } catch (error) {
    console.warn("[api/sponsored] invalid SPONSORED_PLACEMENTS_JSON", error);
    return [];
  }
}

async function dbPlacements(limit) {
  const result = await pool.query(
    `select
       coalesce(sp.chain_id, 97) as "chainId",
       coalesce(sp.campaign_address, sp.website_url, sa.website_url, concat('sponsored-placement-', sp.id)) as "campaignAddress",
       sp.token_address as "tokenAddress",
       sp.creator_address as "creatorAddress",
       coalesce(sp.project_name, sa.project_name, 'Sponsored project') as "name",
       coalesce(sp.symbol, '') as "symbol",
       coalesce(sp.image_url, sa.image_url) as "logoUri",
       coalesce(sp.active, false) as "isActive",
       coalesce(sp.updated_at, sp.created_at, sa.updated_at, sa.created_at) as "lastActivityAt",
       coalesce(sp.project_type, 'external') as "placementType",
       coalesce(sp.placement_label, sp.slot_code, sa.preferred_slot, 'Homepage rail') as "placementLabel",
       coalesce(sp.priority, 1000) as "placementPriority",
       coalesce(sp.target_url, sp.website_url, sa.website_url) as "targetUrl",
       sp.starts_at as "startsAt",
       sp.ends_at as "endsAt",
       coalesce(sp.bio, sa.bio) as "bio",
       coalesce(sp.website_url, sa.website_url) as "websiteUrl"
     from public.sponsored_placements sp
     left join public.sponsorship_applications sa on sa.id = sp.application_id
     where coalesce(sp.active, false) = true
       and coalesce(sp.payment_status, 'pending') in ('paid', 'verified')
       and (sp.starts_at is null or sp.starts_at <= now())
       and (sp.ends_at is null or sp.ends_at >= now())
     order by coalesce(sp.priority, 1000) asc, sp.starts_at asc nulls first, sp.created_at desc nulls last
     limit $1`,
    [limit],
  );
  return result.rows;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  const q = getQuery(req);
  const chainId = toInt(q.chainId, 97);
  const limit = clamp(toInt(q.limit, 8), 1, 24);
  if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

  try {
    const placements = (await dbPlacements(limit)).filter((item) => Number(item.chainId ?? chainId) === Number(chainId));
    const items = placements.length ? placements : externalPlacements(chainId).slice(0, limit);
    return json(res, 200, { items: items.slice(0, limit), updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/sponsored] query failed", error);
    return json(res, 200, { items: externalPlacements(chainId).slice(0, limit), updatedAt: new Date().toISOString(), warning: "Sponsored placement data is unavailable." });
  }
}
