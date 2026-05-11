import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

const DEFAULT_GRAD_TARGET_BNB = 50;

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeTab(v) {
  const t = String(v || "trending").toLowerCase();
  return t === "new" || t === "ending" || t === "dex" ? t : "trending";
}

function normalizeStatus(v) {
  const s = String(v || "all").toLowerCase();
  return s === "live" || s === "graduated" || s === "ended" ? s : "all";
}

function mapCampaignRow(row, gradTargetBnb) {
  const graduatedAt = row.graduated_at_chain ? String(row.graduated_at_chain) : null;
  return {
    chainId: Number(row.chain_id),
    campaignAddress: String(row.campaign_address ?? "").toLowerCase(),
    tokenAddress: row.token_address ? String(row.token_address).toLowerCase() : null,
    creatorAddress: row.creator_address ? String(row.creator_address).toLowerCase() : null,
    name: row.name ?? null,
    symbol: row.symbol ?? null,
    logoUri: row.logo_uri ?? null,
    logoUrl: row.logo_uri ?? null,
    createdAtChain: row.created_at_chain ? String(row.created_at_chain) : null,
    graduatedAtChain: graduatedAt,
    isDexTrading: Boolean(graduatedAt),
    isActive: Boolean(row.is_active),
    status: graduatedAt ? "graduated" : row.is_active ? "live" : "ended",
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
    lastPriceBnb: row.last_price_bnb != null ? String(row.last_price_bnb) : null,
    soldTokens: row.sold_tokens != null ? String(row.sold_tokens) : null,
    marketcapBnb: row.marketcap_bnb != null ? String(row.marketcap_bnb) : null,
    vol24hBnb: row.vol_24h_bnb != null ? String(row.vol_24h_bnb) : null,
    votes24h: row.votes_24h != null ? Number(row.votes_24h) : 0,
    votesAllTime: row.votes_all_time != null ? Number(row.votes_all_time) : 0,
    raisedTotalBnb: row.raised_total_bnb != null ? String(row.raised_total_bnb) : "0",
    raised10mBnb: row.raised_10m_bnb != null ? String(row.raised_10m_bnb) : "0",
    progressPct: row.progress_pct != null ? Number(row.progress_pct) : null,
    etaSec: row.eta_sec != null ? Number(row.eta_sec) : null,
    gradTargetBnb,
  };
}

async function fetchMinimalCampaigns({ chainId, limit, cursor, tab, status, search, gradTargetBnb }) {
  const effectiveStatus = tab === "ending" ? "live" : tab === "dex" ? "graduated" : status;
  const params = [chainId];
  let where = "where c.chain_id = $1";

  if (search) {
    params.push(`%${search}%`);
    where += ` and (c.name ilike $${params.length} or c.symbol ilike $${params.length} or c.campaign_address::text ilike $${params.length})`;
  }

  if (effectiveStatus === "live") {
    where += " and c.is_active = true";
  } else if (effectiveStatus === "graduated") {
    where += " and c.graduated_at_chain is not null";
  } else if (effectiveStatus === "ended") {
    where += " and c.is_active = false and c.graduated_at_chain is null";
  }

  params.push(cursor, limit);
  const offsetParam = params.length - 1;
  const limitParam = params.length;

  const r = await pool.query(
    `select
       c.chain_id,
       c.campaign_address,
       c.token_address,
       c.creator_address,
       c.name,
       c.symbol,
       nullif(c.logo_uri, '') as logo_uri,
       c.created_at_chain,
       c.graduated_at_chain,
       c.is_active,
       null::timestamp as last_activity_at,
       null::numeric as last_price_bnb,
       null::numeric as sold_tokens,
       null::numeric as marketcap_bnb,
       null::numeric as vol_24h_bnb,
       0::integer as votes_24h,
       0::integer as votes_all_time,
       0::numeric as raised_total_bnb,
       0::numeric as raised_10m_bnb,
       null::numeric as progress_pct,
       null::numeric as eta_sec
     from public.campaigns c
     ${where}
     order by c.created_at_chain desc nulls last, c.campaign_address asc
     offset $${offsetParam}
     limit $${limitParam}`,
    params,
  );

  return r.rows.map((row) => mapCampaignRow(row, gradTargetBnb));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  const q = getQuery(req);
  const chainId = toInt(q.chainId, 97);
  const limit = clamp(toInt(q.limit, 24), 1, 500);
  const cursor = clamp(toInt(q.cursor, 0), 0, 1_000_000);
  const tab = normalizeTab(q.tab);
  const status = normalizeStatus(q.status);
  const search = String(q.search || "").trim();
  const gradTargetBnb = clamp(Number(q.gradTargetBnb || DEFAULT_GRAD_TARGET_BNB), 0.0001, 10_000);

  try {
    const items = await fetchMinimalCampaigns({ chainId, limit, cursor, tab, status, search, gradTargetBnb });
    return json(res, 200, {
      items,
      nextCursor: items.length === limit ? cursor + limit : null,
      pageSize: limit,
      updatedAt: new Date().toISOString(),
      mode: "minimal",
    });
  } catch (e) {
    console.error("[api/campaigns] minimal feed failed", e);
    return json(res, 500, { error: "Campaign feed failed", message: String(e?.message || e) });
  }
}
