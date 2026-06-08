import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json } from "../server/http.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMode(value) {
  const mode = String(value || "trending").toLowerCase();
  return mode === "new" || mode === "graduated" || mode === "draft" ? mode : "trending";
}

function emptyWarRoom(res, error) {
  console.error("[api/warRoom] query failed", error);
  return json(res, 200, { items: [], updatedAt: new Date().toISOString(), warning: "War Room campaign data is unavailable." });
}

async function watchlistState({ chainId, campaignAddress, userAddress }) {
  const user = normalizeAddress(userAddress);
  const campaign = normalizeAddress(campaignAddress);
  if (!isAddress(user)) return { supported: true, following: false, reason: "wallet_not_connected" };
  if (!isAddress(campaign)) return { supported: false, following: false, reason: "invalid_campaign_address" };

  const result = await pool.query(
    `select 1 from public.campaign_follows where chain_id = $1 and user_address = $2 and campaign_address = $3 limit 1`,
    [chainId, user, campaign],
  );
  return { supported: true, following: result.rows.length > 0, reason: result.rows.length > 0 ? null : "not_following" };
}

function detailPayload(row, watchlist) {
  const campaignAddress = normalizeAddress(row.campaignAddress);
  const tokenAddress = row.tokenAddress ? normalizeAddress(row.tokenAddress) : null;
  const isGraduated = Boolean(row.graduatedAtChain);
  const eligible = Boolean(row.isActive) && !isGraduated;
  return {
    campaign: row,
    chart: { source: isGraduated && tokenAddress ? "dex" : "bonding_curve", campaignAddress, tokenAddress, preferredTimeframe: isGraduated ? "5m" : "1m" },
    battleIntel: { status: eligible ? "eligible" : "unavailable", eligible, unavailableReason: eligible ? null : isGraduated ? "graduated_to_dex" : "campaign_not_active" },
    tradeContext: { mode: isGraduated ? "dex" : "bonding_curve", canBuy: Boolean(row.isActive), canSell: Boolean(row.isActive || isGraduated), slippagePct: 5 },
    watchlist,
    updatedAt: new Date().toISOString(),
  };
}

const SELECT_CAMPAIGN = `
  select
    c.chain_id as "chainId",
    c.campaign_address as "campaignAddress",
    c.token_address as "tokenAddress",
    c.creator_address as "creatorAddress",
    c.name as "name",
    c.symbol as "symbol",
    c.logo_uri as "logoUri",
    c.created_at_chain as "createdAtChain",
    c.graduated_at_chain as "graduatedAtChain",
    c.is_active as "isActive",
    ts.marketcap_bnb as "marketcapBnb",
    ts.vol_24h_bnb as "vol24hBnb",
    coalesce(va.votes_24h, 0) as "votes24h",
    coalesce(va.votes_all_time, 0) as "votesAllTime",
    coalesce(va.trending_score, 0) as "trendingScore",
    ca.last_activity_at as "lastActivityAt"
  from public.campaigns c
  left join public.token_stats ts on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
  left join public.vote_aggregates va on va.chain_id = c.chain_id and va.campaign_address = c.campaign_address
  left join public.campaign_activity ca on ca.chain_id = c.chain_id and ca.campaign_address = c.campaign_address
`;

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = toInt(q.chainId, 97);
    const detailAddress = normalizeAddress(q.campaignAddress || q.campaign || "");
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

    if (detailAddress) {
      const result = await pool.query(`${SELECT_CAMPAIGN} where c.chain_id = $1 and lower(c.campaign_address::text) = lower($2) limit 1`, [chainId, detailAddress]);
      if (!result.rows[0]) return json(res, 404, { error: "War Room campaign detail not found", campaignAddress: detailAddress, updatedAt: new Date().toISOString() });
      const watchlist = await watchlistState({ chainId, campaignAddress: detailAddress, userAddress: q.userAddress || q.user || q.wallet });
      return json(res, 200, detailPayload(result.rows[0], watchlist));
    }

    const limit = clamp(toInt(q.limit, 250), 1, 250);
    const mode = normalizeMode(q.mode);
    const search = String(q.search || "").trim();
    const filters = ["c.chain_id = $1", "c.campaign_address is not null"];
    const params = [chainId];
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(c.name ilike $${params.length} or c.symbol ilike $${params.length} or c.campaign_address::text ilike $${params.length} or c.creator_address::text ilike $${params.length})`);
    }
    if (mode === "graduated") filters.push("c.graduated_at_chain is not null");
    if (mode === "draft") filters.push("coalesce(c.is_active, false) = false and c.graduated_at_chain is null");
    params.push(limit);

    const orderBy = mode === "new"
      ? "c.created_at_chain desc nulls last, c.campaign_address asc"
      : mode === "graduated"
        ? "c.graduated_at_chain desc nulls last, coalesce(ca.last_activity_at, c.created_at_chain) desc nulls last, c.campaign_address asc"
        : "coalesce(va.trending_score, 0) desc, coalesce(ca.last_activity_at, c.created_at_chain) desc nulls last, coalesce(ts.marketcap_bnb, 0) desc, c.campaign_address asc";

    const result = await pool.query(`${SELECT_CAMPAIGN} where ${filters.join(" and ")} order by ${orderBy} limit $${params.length}`, params);
    return json(res, 200, { items: result.rows, updatedAt: new Date().toISOString() });
  } catch (error) {
    return emptyWarRoom(res, error);
  }
}
