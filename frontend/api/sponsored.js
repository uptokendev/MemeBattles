import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function safeEmptySponsored(res, error) {
  console.error("[api/sponsored] sponsored placement query failed; returning empty sponsored feed", error);
  return json(res, 200, {
    items: [],
    updatedAt: new Date().toISOString(),
    warning: "Sponsored placement data is not available yet.",
  });
}

function readExternalPlacements(chainId) {
  const raw = String(process.env.SPONSORED_PLACEMENTS_JSON || process.env.VITE_SPONSORED_PLACEMENTS_JSON || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    return items
      .filter((item) => item && typeof item === "object")
      .filter((item) => item.chainId == null || Number(item.chainId) === Number(chainId))
      .map((item, index) => {
        const now = Date.now();
        const startsAtMs = item.startsAt ? Date.parse(String(item.startsAt)) : Number.NaN;
        const endsAtMs = item.endsAt ? Date.parse(String(item.endsAt)) : Number.NaN;
        if (Number.isFinite(startsAtMs) && startsAtMs > now) return null;
        if (Number.isFinite(endsAtMs) && endsAtMs < now) return null;

        const campaignAddress = String(item.campaignAddress || item.campaign || item.targetUrl || `external-sponsored-${index}`).trim();
        if (!campaignAddress) return null;

        return {
          chainId: item.chainId ?? chainId,
          campaignAddress,
          tokenAddress: item.tokenAddress ?? null,
          creatorAddress: item.creatorAddress ?? null,
          name: String(item.name || item.title || "Sponsored project"),
          symbol: String(item.symbol || item.ticker || "SPON"),
          logoUri: item.logoUri || item.logoURI || item.logoUrl || null,
          createdAtChain: item.startsAt || null,
          graduatedAtChain: null,
          isActive: true,
          marketcapBnb: Number(item.marketcapBnb || 0),
          vol24hBnb: Number(item.vol24hBnb || item.volumeBnb || 0),
          holderCount: Number(item.holderCount || 0),
          raisedTotalBnb: Number(item.raisedTotalBnb || 0),
          votes24h: Number(item.votes24h || 0),
          votesAllTime: Number(item.votesAllTime || 0),
          lastActivityAt: item.updatedAt || item.startsAt || null,
          placementType: "external",
          placementLabel: String(item.placementLabel || "Sponsored"),
          placementPriority: Number(item.priority || 1000 + index),
          targetUrl: item.targetUrl || item.url || null,
          startsAt: item.startsAt || null,
          endsAt: item.endsAt || null,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.warn("[api/sponsored] failed to parse SPONSORED_PLACEMENTS_JSON", error);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = toInt(q.chainId, 97);
    const limit = clamp(toInt(q.limit, 8), 1, 24);

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

    const externalPlacements = readExternalPlacements(chainId);
    const internalLimit = Math.max(0, limit - externalPlacements.length);
    let rows = [];

    if (internalLimit > 0) {
      const result = await pool.query(
        `SELECT
           c.chain_id AS "chainId",
           c.campaign_address AS "campaignAddress",
           c.token_address AS "tokenAddress",
           c.creator_address AS "creatorAddress",
           c.name AS "name",
           c.symbol AS "symbol",
           c.logo_uri AS "logoUri",
           c.created_at_chain AS "createdAtChain",
           c.graduated_at_chain AS "graduatedAtChain",
           c.is_active AS "isActive",
           ts.marketcap_bnb AS "marketcapBnb",
           ts.vol_24h_bnb AS "vol24hBnb",
           COALESCE(rt.holder_count, 0) AS "holderCount",
           rt.raised_total_bnb AS "raisedTotalBnb",
           COALESCE(va.votes_24h, 0) AS "votes24h",
           COALESCE(va.votes_all_time, 0) AS "votesAllTime",
           ca.last_activity_at AS "lastActivityAt",
           'internal'::text AS "placementType",
           'Sponsored'::text AS "placementLabel",
           10000::int AS "placementPriority",
           null::text AS "targetUrl",
           null::text AS "startsAt",
           null::text AS "endsAt"
         FROM campaigns c
         LEFT JOIN token_stats ts
           ON ts.chain_id = c.chain_id
          AND ts.campaign_address = c.campaign_address
         LEFT JOIN vote_aggregates va
           ON va.chain_id = c.chain_id
          AND va.campaign_address = c.campaign_address
         LEFT JOIN campaign_activity ca
           ON ca.chain_id = c.chain_id
          AND ca.campaign_address = c.campaign_address
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(
               SUM(CASE WHEN t.side = 'buy' THEN t.bnb_amount ELSE -t.bnb_amount END),
               0
             ) AS raised_total_bnb,
             COALESCE(COUNT(DISTINCT t.wallet) FILTER (WHERE t.side = 'buy'), 0) AS holder_count
           FROM curve_trades t
           WHERE t.chain_id = c.chain_id
             AND t.campaign_address = c.campaign_address
         ) rt ON TRUE
         WHERE c.chain_id = $1
           AND c.campaign_address IS NOT NULL
           AND c.graduated_at_chain IS NULL
           AND COALESCE(c.is_active, false) = true
         ORDER BY
           COALESCE(ca.last_activity_at, c.created_at_chain) DESC NULLS LAST,
           COALESCE(ts.marketcap_bnb, 0) DESC,
           COALESCE(va.votes_24h, 0) DESC,
           c.created_at_chain DESC NULLS LAST,
           c.campaign_address ASC
         LIMIT $2`,
        [chainId, internalLimit],
      );
      rows = result.rows;
    }

    const items = externalPlacements.concat(rows).slice(0, limit);
    return json(res, 200, {
      items,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return safeEmptySponsored(res, error);
  }
}
