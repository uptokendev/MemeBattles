import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../server/http.js";

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

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeMode(value) {
  const mode = String(value || "trending").toLowerCase();
  return mode === "new" || mode === "graduated" || mode === "draft" || mode === "external" ? mode : "trending";
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
  const source = row.source || "internal";
  const campaignAddress = normalizeAddress(row.campaignAddress);
  const tokenAddress = row.tokenAddress ? normalizeAddress(row.tokenAddress) : null;
  const isExternal = source === "external";
  const isGraduated = Boolean(row.graduatedAtChain);
  const postGradEligible = !isExternal && Boolean(row.isActive) && isGraduated;
  const chartSource = isExternal || (isGraduated && tokenAddress) ? "dex" : "bonding_curve";
  const tradeMode = chartSource === "dex" ? "dex" : "bonding_curve";
  return {
    campaign: row,
    chart: { source: chartSource, campaignAddress, tokenAddress, preferredTimeframe: chartSource === "dex" ? "5m" : "1m", dexUrl: row.dexUrl || null },
    battleIntel: {
      status: postGradEligible ? "eligible" : "unavailable",
      eligible: postGradEligible,
      unavailableReason: postGradEligible ? null : isExternal ? "external_import_not_battle_enabled" : isGraduated ? "campaign_not_active" : "not_post_grad",
    },
    tradeContext: { mode: tradeMode, canBuy: isExternal || Boolean(row.isActive), canSell: isExternal || Boolean(row.isActive || isGraduated), slippagePct: 5, dexUrl: row.dexUrl || null },
    watchlist,
    updatedAt: new Date().toISOString(),
  };
}

const SELECT_CAMPAIGN = `
  select
    'internal' as "source",
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
    null::text as "websiteUrl",
    null::text as "dexUrl",
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

const SELECT_EXTERNAL = `
  select
    'external' as "source",
    e.chain_id as "chainId",
    lower(e.token_address::text) as "campaignAddress",
    lower(e.token_address::text) as "tokenAddress",
    lower(e.imported_by::text) as "creatorAddress",
    e.name as "name",
    e.symbol as "symbol",
    e.logo_uri as "logoUri",
    null::bigint as "createdAtChain",
    e.imported_at as "graduatedAtChain",
    true as "isActive",
    e.website_url as "websiteUrl",
    e.dex_url as "dexUrl",
    e.marketcap_bnb as "marketcapBnb",
    e.vol_24h_bnb as "vol24hBnb",
    0 as "votes24h",
    0 as "votesAllTime",
    coalesce(e.trending_score, 0) as "trendingScore",
    coalesce(e.updated_at, e.imported_at) as "lastActivityAt"
  from public.war_room_external_tokens e
`;

async function internalDetail(chainId, detailAddress) {
  const result = await pool.query(`${SELECT_CAMPAIGN} where c.chain_id = $1 and lower(c.campaign_address::text) = lower($2) limit 1`, [chainId, detailAddress]);
  return result.rows[0] || null;
}

async function externalDetail(chainId, detailAddress) {
  const result = await pool.query(`${SELECT_EXTERNAL} where e.chain_id = $1 and lower(e.token_address::text) = lower($2) and coalesce(e.active, true) = true limit 1`, [chainId, detailAddress]);
  return result.rows[0] || null;
}

async function externalTokens({ chainId, limit, search }) {
  const filters = ["e.chain_id = $1", "coalesce(e.active, true) = true"];
  const params = [chainId];
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(e.name ilike $${params.length} or e.symbol ilike $${params.length} or e.token_address::text ilike $${params.length})`);
  }
  params.push(limit);
  const result = await pool.query(`${SELECT_EXTERNAL} where ${filters.join(" and ")} order by coalesce(e.trending_score, 0) desc, coalesce(e.updated_at, e.imported_at) desc limit $${params.length}`, params);
  return result.rows;
}

async function internalTokens({ chainId, limit, mode, search }) {
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
  return result.rows;
}

function sortFeed(items) {
  return items.sort((a, b) => {
    const score = Number(b.trendingScore || 0) - Number(a.trendingScore || 0);
    if (score) return score;
    return Date.parse(b.lastActivityAt || b.graduatedAtChain || 0) - Date.parse(a.lastActivityAt || a.graduatedAtChain || 0);
  });
}

async function handleGet(req, res) {
  const q = getQuery(req);
  const chainId = toInt(q.chainId, 97);
  const detailAddress = normalizeAddress(q.campaignAddress || q.campaign || q.tokenAddress || "");
  if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

  if (detailAddress) {
    const row = await internalDetail(chainId, detailAddress) || await externalDetail(chainId, detailAddress);
    if (!row) return json(res, 404, { error: "War Room token detail not found", campaignAddress: detailAddress, updatedAt: new Date().toISOString() });
    const watchlist = row.source === "external"
      ? { supported: false, following: false, reason: "external_token" }
      : await watchlistState({ chainId, campaignAddress: detailAddress, userAddress: q.userAddress || q.user || q.wallet });
    return json(res, 200, detailPayload(row, watchlist));
  }

  const limit = clamp(toInt(q.limit, 250), 1, 250);
  const mode = normalizeMode(q.mode);
  const search = String(q.search || "").trim();
  const includeExternal = String(q.includeExternal ?? "true").toLowerCase() !== "false";
  const internal = mode === "external" ? [] : await internalTokens({ chainId, limit, mode, search });
  const external = includeExternal && mode !== "draft" ? await externalTokens({ chainId, limit, search }) : [];
  const items = sortFeed([...internal, ...external]).slice(0, limit);
  return json(res, 200, { items, updatedAt: new Date().toISOString() });
}

async function handleImport(req, res) {
  const requiredToken = String(process.env.WAR_ROOM_IMPORT_TOKEN || "").trim();
  if (requiredToken && String(req.headers["x-war-room-import-token"] || "") !== requiredToken) {
    return json(res, 401, { ok: false, error: "Invalid War Room import token" });
  }

  const body = await readJson(req);
  const chainId = toInt(body?.chainId, 97);
  const tokenAddress = normalizeAddress(body?.tokenAddress || body?.address);
  const importedBy = normalizeAddress(body?.importedBy || body?.walletAddress || body?.userAddress);
  const name = cleanText(body?.name, "Imported memecoin");
  const symbol = cleanText(body?.symbol, "EXT").slice(0, 24).toUpperCase();
  if (!Number.isFinite(chainId)) return json(res, 400, { ok: false, error: "Invalid chainId" });
  if (!isAddress(tokenAddress)) return json(res, 400, { ok: false, error: "tokenAddress must be a valid address" });

  const result = await pool.query(
    `insert into public.war_room_external_tokens (chain_id, token_address, imported_by, name, symbol, logo_uri, website_url, dex_url, notes, source, active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'external',true)
     on conflict (chain_id, token_address) do update set
       imported_by = coalesce(excluded.imported_by, public.war_room_external_tokens.imported_by),
       name = excluded.name,
       symbol = excluded.symbol,
       logo_uri = excluded.logo_uri,
       website_url = excluded.website_url,
       dex_url = excluded.dex_url,
       notes = excluded.notes,
       active = true,
       updated_at = now()
     returning *`,
    [chainId, tokenAddress, isAddress(importedBy) ? importedBy : null, name, symbol, body?.logoUri || body?.logoUrl || null, body?.websiteUrl || null, body?.dexUrl || null, body?.notes || null],
  );
  const row = await externalDetail(chainId, result.rows[0].token_address);
  return json(res, 200, { ok: true, item: row, detail: detailPayload(row, { supported: false, following: false, reason: "external_token" }) });
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || new URL(req.url, "http://localhost").pathname);

  try {
    if (method === "GET" && path === "/war-room") return handleGet(req, res);
    if (method === "POST" && path === "/war-room/import") return handleImport(req, res);
    return method === "GET" || method === "POST" ? json(res, 404, { error: `Unknown War Room route: ${path}` }) : badMethod(res);
  } catch (error) {
    return emptyWarRoom(res, error);
  }
}
