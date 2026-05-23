import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeMode(value) {
  const mode = String(value || "trending").toLowerCase();
  return mode === "new" || mode === "graduated" || mode === "draft" ? mode : "trending";
}

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function safeEmptyWarRoom(res, error) {
  console.error("[api/war-room] war room query failed; returning empty feed", error);
  return json(res, 200, {
    items: [],
    updatedAt: new Date().toISOString(),
    warning: "War Room campaign data is not available yet.",
  });
}

function buildWarRoomDetail(row) {
  const campaignAddress = normalizeAddress(row?.campaignAddress);
  const tokenAddress = row?.tokenAddress ? normalizeAddress(row.tokenAddress) : null;
  const isGraduated = Boolean(row?.graduatedAtChain);
  const isActive = Boolean(row?.isActive);
  const eligibleForBattle = isActive && !isGraduated;

  return {
    campaign: row,
    chart: {
      source: isGraduated && tokenAddress ? "dex" : "bonding_curve",
      campaignAddress,
      tokenAddress,
      preferredTimeframe: isGraduated ? "5m" : "1m",
    },
    battleIntel: {
      status: eligibleForBattle ? "eligible" : "unavailable",
      eligible: eligibleForBattle,
      unavailableReason: eligibleForBattle ? null : isGraduated ? "graduated_to_dex" : "campaign_not_active",
      summary: eligibleForBattle
        ? "This memecoin can be evaluated for Arena battle routing."
        : isGraduated
          ? "Graduated memecoins are tracked for market context but cannot open new bonding-curve battles."
          : "Inactive or draft memecoins are not eligible for Arena battle routing yet.",
    },
    tradeContext: {
      mode: isGraduated ? "dex" : "bonding_curve",
      canBuy: isActive,
      canSell: Boolean(isActive || isGraduated),
      slippagePct: 5,
    },
    watchlist: {
      supported: false,
      following: false,
      reason: "watchlist_state_not_connected",
    },
    updatedAt: new Date().toISOString(),
  };
}

async function loadWarRoomDetail(req, res, chainId) {
  const q = getQuery(req);
  const campaignAddress = normalizeAddress(req.params?.campaignAddress || req.params?.[0] || q.campaignAddress || q.campaign);
  if (!campaignAddress) return json(res, 400, { error: "Missing campaignAddress" });

  const { rows } = await pool.query(
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
       COALESCE(va.trending_score, 0) AS "trendingScore",
       ca.last_activity_at AS "lastActivityAt"
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
         COALESCE(SUM(CASE WHEN t.side = 'buy' THEN t.bnb_amount ELSE -t.bnb_amount END), 0) AS raised_total_bnb,
         COALESCE(COUNT(DISTINCT t.wallet) FILTER (WHERE t.side = 'buy'), 0) AS holder_count
       FROM curve_trades t
       WHERE t.chain_id = c.chain_id
         AND t.campaign_address = c.campaign_address
     ) rt ON TRUE
     WHERE c.chain_id = $1
       AND lower(c.campaign_address::text) = lower($2)
     LIMIT 1`,
    [chainId, campaignAddress],
  );

  if (!rows[0]) {
    return json(res, 404, {
      error: "War Room campaign detail not found",
      campaignAddress,
      updatedAt: new Date().toISOString(),
    });
  }

  return json(res, 200, buildWarRoomDetail(rows[0]));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = toInt(q.chainId, 97);
    const detailAddress = req.params?.campaignAddress || req.params?.[0] || q.campaignAddress || q.campaign;

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (detailAddress) return loadWarRoomDetail(req, res, chainId);

    const limit = clamp(toInt(q.limit, 250), 1, 250);
    const mode = normalizeMode(q.mode);
    const searchRaw = String(q.search || "").trim();
    const search = searchRaw ? `%${searchRaw}%` : null;

    const params = [chainId, search, limit];
    const filters = [
      "c.chain_id = $1",
      "c.campaign_address is not null",
      "($2::text is null or c.name ilike $2 or c.symbol ilike $2 or c.campaign_address::text ilike $2 or c.creator_address::text ilike $2)",
    ];

    if (mode === "graduated") {
      filters.push("c.graduated_at_chain is not null");
    } else if (mode === "draft") {
      filters.push("coalesce(c.is_active, false) = false");
      filters.push("c.graduated_at_chain is null");
    }

    const orderBy =
      mode === "new"
        ? `c.created_at_chain desc nulls last, c.campaign_address asc`
        : mode === "graduated"
          ? `c.graduated_at_chain desc nulls last, coalesce(ca.last_activity_at, c.created_at_chain) desc nulls last, c.campaign_address asc`
          : `coalesce(va.trending_score, 0) desc, coalesce(ca.last_activity_at, c.created_at_chain) desc nulls last, coalesce(ts.marketcap_bnb, 0) desc, c.campaign_address asc`;

    const { rows } = await pool.query(
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
         COALESCE(va.trending_score, 0) AS "trendingScore",
         ca.last_activity_at AS "lastActivityAt"
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
       WHERE ${filters.join(" and ")}
       ORDER BY ${orderBy}
       LIMIT $3`,
      params,
    );

    return json(res, 200, {
      items: rows,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return safeEmptyWarRoom(res, error);
  }
}
