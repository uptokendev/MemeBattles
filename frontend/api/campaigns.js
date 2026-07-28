import baseHandler from "./campaigns-base.js";

import { pool } from "../server/db.js";
import { getQuery } from "../server/http.js";
import { runJsonTransform } from "./dev-fix/json-transform.js";
import { reconcileScheduledDraftLifecycle } from "./dev-fix/scheduled-lifecycle.js";

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function matchesSearch(row, search) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.ticker, row.campaign_address, row.token_address, row.creator_wallet]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function lifecycleKey(chainId, campaignAddress) {
  return `${Number(chainId)}:${String(campaignAddress || "").toLowerCase()}`;
}

function applyLifecycle(item, row) {
  if (!row) return item;
  const draftCreatedAt = iso(row.created_at);
  const contractDeployedAt = iso(row.deployed_at) || item.createdAtChain || null;
  const scheduledLaunchAt = iso(row.scheduled_launch_at);
  const tradingLaunchAt = scheduledLaunchAt || item.createdAtChain || contractDeployedAt;
  return {
    ...item,
    draftCreatedAt,
    contractDeployedAt,
    scheduledLaunchAt,
    tradingLaunchAt,
    createdAtChain: tradingLaunchAt,
  };
}

function itemFromDraft(row) {
  const scheduledLaunchAt = iso(row.scheduled_launch_at);
  const contractDeployedAt = iso(row.deployed_at);
  const tradingLaunchAt = scheduledLaunchAt || contractDeployedAt;
  return {
    chainId: Number(row.chain_id),
    campaignAddress: String(row.campaign_address || "").toLowerCase(),
    tokenAddress: row.token_address ? String(row.token_address).toLowerCase() : null,
    creatorAddress: row.creator_wallet ? String(row.creator_wallet).toLowerCase() : null,
    name: row.name ?? null,
    symbol: row.ticker ?? null,
    logoUri: row.logo_url ?? null,
    website: row.website_url ?? null,
    xAccount: row.x_url ?? null,
    extraLink: row.other_url ?? null,
    draftCreatedAt: iso(row.created_at),
    contractDeployedAt,
    scheduledLaunchAt,
    tradingLaunchAt,
    createdAtChain: tradingLaunchAt,
    graduatedAtChain: null,
    isDexTrading: false,
    isActive: true,
    status: "live",
    lastActivityAt: null,
    lastPriceBnb: null,
    soldTokens: null,
    marketcapBnb: null,
    vol24hBnb: null,
    holderCount: 0,
    athMarketcapBnb: null,
    votes24h: 0,
    votesAllTime: 0,
    raisedTotalBnb: "0",
    raised10mBnb: "0",
    progressPct: 0,
    etaSec: null,
  };
}

async function loadLifecycleRows(chainId, campaignAddresses) {
  const addresses = Array.from(new Set((campaignAddresses || []).map((value) => String(value || "").toLowerCase()).filter(Boolean)));
  const result = await pool.query(
    `select *
       from public.campaign_drafts
      where chain_id = $1
        and campaign_address is not null
        and (
          lower(campaign_address) = any($2::text[])
          or (
            scheduled_launch_at is not null
            and scheduled_launch_at <= now()
            and status = 'deployed'
            and visibility = 'public'
          )
        )
      order by updated_at desc`,
    [Number(chainId), addresses],
  );

  const byCampaign = new Map();
  for (const row of result.rows) {
    const key = lifecycleKey(row.chain_id, row.campaign_address);
    if (!byCampaign.has(key)) byCampaign.set(key, row);
  }
  return { rows: result.rows, byCampaign };
}

export default async function handler(req, res) {
  await reconcileScheduledDraftLifecycle(pool);
  const query = getQuery(req);
  const chainId = Number(query.chainId || 97);
  const tab = String(query.tab || "trending").toLowerCase();
  const status = String(query.status || "all").toLowerCase();
  const sort = String(query.sort || "default").toLowerCase();

  return runJsonTransform(baseHandler, req, res, async (payload) => {
    if (!payload || !Array.isArray(payload.items)) return payload;

    const { rows, byCampaign } = await loadLifecycleRows(
      chainId,
      payload.items.map((item) => item?.campaignAddress),
    );
    const now = Date.now();
    const seen = new Set();
    const items = [];

    for (const item of payload.items) {
      const key = lifecycleKey(item.chainId ?? chainId, item.campaignAddress);
      const row = byCampaign.get(key);
      const scheduledMs = row?.scheduled_launch_at ? new Date(row.scheduled_launch_at).getTime() : NaN;
      if (Number.isFinite(scheduledMs) && scheduledMs > now) continue;
      seen.add(key);
      items.push(applyLifecycle(item, row));
    }

    const canAddLiveFallback = tab !== "dex" && status !== "graduated" && status !== "ended";
    if (canAddLiveFallback) {
      for (const row of rows) {
        if (!row.scheduled_launch_at || new Date(row.scheduled_launch_at).getTime() > now) continue;
        if (!matchesSearch(row, query.search)) continue;
        const key = lifecycleKey(row.chain_id, row.campaign_address);
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(itemFromDraft(row));
      }
    }

    if (tab === "new" || sort === "created_desc") {
      items.sort((a, b) => Date.parse(String(b.createdAtChain || 0)) - Date.parse(String(a.createdAtChain || 0)));
    } else if (sort === "created_asc") {
      items.sort((a, b) => Date.parse(String(a.createdAtChain || 0)) - Date.parse(String(b.createdAtChain || 0)));
    }

    return {
      ...payload,
      items,
      pageSize: items.length,
      updatedAt: new Date().toISOString(),
    };
  });
}
