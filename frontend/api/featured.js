import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

const SORT_MAP = {
  trending: "trending_score",
  "24h": "votes_24h",
  "7d": "votes_7d",
  all: "votes_all_time",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    const sortKeyRaw = String(q.sort ?? "trending").toLowerCase();
    const sortCol = SORT_MAP[sortKeyRaw] ?? SORT_MAP.trending;
    const limit = Math.max(1, Math.min(50, Number(q.limit ?? 10)));

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

    // IMPORTANT: Featured list is a *paid* placement via UPvote.
    // We only surface campaigns that still exist in our campaigns table and are still in bonding
    // (not graduated), to prevent old-factory / old-campaign addresses from showing up.
    const { rows } = await pool.query(
      `SELECT
         va.chain_id AS "chainId",
         va.campaign_address AS "campaignAddress",
         c.token_address AS "tokenAddress",
         c.creator_address AS "creatorAddress",
         c.name AS "name",
         c.symbol AS "symbol",
         c.logo_uri AS "logoUri",
         c.created_at_chain AS "createdAtChain",
         c.graduated_at_chain AS "graduatedAtChain",
         va.votes_1h AS "votes1h",
         va.votes_24h AS "votes24h",
         va.votes_7d AS "votes7d",
         va.votes_all_time AS "votesAllTime",
         va.trending_score AS "trendingScore",
         va.last_vote_at AS "lastVoteAt"
       FROM vote_aggregates va
       INNER JOIN campaigns c
         ON c.chain_id = va.chain_id
        AND c.campaign_address = va.campaign_address
       WHERE va.chain_id = $1
         AND (c.graduated_at_chain IS NULL)
       ORDER BY ${sortCol} DESC NULLS LAST
       LIMIT $2`,
      [chainId, limit]
    );

    return json(res, 200, { items: rows });
  } catch (e) {
    console.error("[api/featured]", e);
    return json(res, 500, { error: "Server error" });
  }
}
