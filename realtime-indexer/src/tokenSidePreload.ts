import express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ablyRest, tokenChannel } from "./ably.js";
import { pool } from "./db.js";

function warroomChannel(chainId: number, campaign: string) {
  return `warroom:${chainId}:${campaign.toLowerCase()}`;
}

function normalizeCampaign(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isCampaignAddress(value: string) {
  return /^0x[a-f0-9]{40}$/.test(value);
}

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};

const patchedAblyToken = wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const scope = String(req.query.scope || "token").toLowerCase();

  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ error: "Invalid chainId" });
  }

  if (scope === "league") {
    const channel = `league:${chainId}`;
    const tokenRequest = await ablyRest.auth.createTokenRequest({
      clientId: "public",
      capability: JSON.stringify({ [channel]: ["subscribe"] }),
      ttl: 60 * 60 * 1000,
    });
    return res.json(tokenRequest);
  }

  const campaign = normalizeCampaign(req.query.campaign);
  if (!isCampaignAddress(campaign)) {
    return res.status(400).json({ error: "Invalid campaign address" });
  }

  const capability = {
    [tokenChannel(chainId, campaign)]: ["subscribe"],
    [warroomChannel(chainId, campaign)]: ["subscribe"],
  };

  const tokenRequest = await ablyRest.auth.createTokenRequest({
    clientId: "public",
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000,
  });

  return res.json(tokenRequest);
});

const patchedCampaigns = wrap(async (req, res) => {
  const chainId = toInt(req.query.chainId, 97);
  const limit = clamp(toInt(req.query.limit, 24), 1, 500);
  const cursor = clamp(toInt(req.query.cursor, 0), 0, 1_000_000);
  const searchRaw = String(req.query.search || "").trim();
  const search = searchRaw ? `%${searchRaw}%` : null;

  try {
    const result = await pool.query(
      `select
         c.chain_id,
         c.campaign_address,
         c.token_address,
         c.creator_address,
         c.name,
         c.symbol,
         c.logo_uri,
         c.created_at_chain,
         c.graduated_at_chain,
         c.is_active,
         ts.marketcap_bnb,
         ts.last_price_bnb,
         ts.vol_24h_bnb,
         coalesce(va.votes_24h, 0) as votes_24h,
         coalesce(va.votes_all_time, 0) as votes_all_time
       from public.campaigns c
       left join public.token_stats ts
         on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
       left join public.vote_aggregates va
         on va.chain_id = c.chain_id and va.campaign_address = c.campaign_address
       where c.chain_id = $1
         and ($2::text is null or (
           c.name ilike $2
           or c.symbol ilike $2
           or c.campaign_address::text ilike $2
         ))
       order by coalesce(ts.updated_at, c.created_at_chain, now()) desc,
                c.created_at_chain desc nulls last,
                c.campaign_address asc
       offset $3
       limit $4`,
      [chainId, search, cursor, limit],
    );

    const items = result.rows.map((row: any) => ({
      chainId: Number(row.chain_id),
      campaignAddress: String(row.campaign_address || "").toLowerCase(),
      tokenAddress: row.token_address ? String(row.token_address).toLowerCase() : null,
      creatorAddress: row.creator_address ? String(row.creator_address).toLowerCase() : null,
      name: row.name ?? null,
      symbol: row.symbol ?? null,
      logoUri: row.logo_uri ?? null,
      createdAtChain: row.created_at_chain ? String(row.created_at_chain) : null,
      graduatedAtChain: row.graduated_at_chain ? String(row.graduated_at_chain) : null,
      isDexTrading: Boolean(row.graduated_at_chain),
      isActive: Boolean(row.is_active),
      status: row.graduated_at_chain ? "graduated" : row.is_active ? "live" : "ended",
      marketcapBnb: row.marketcap_bnb != null ? String(row.marketcap_bnb) : null,
      lastPriceBnb: row.last_price_bnb != null ? String(row.last_price_bnb) : null,
      vol24hBnb: row.vol_24h_bnb != null ? String(row.vol_24h_bnb) : null,
      votes24h: Number(row.votes_24h || 0),
      votesAllTime: Number(row.votes_all_time || 0),
    }));

    return res.json({
      items,
      nextCursor: items.length === limit ? cursor + limit : null,
      pageSize: limit,
      updatedAt: new Date().toISOString(),
      source: "realtime-indexer-compat",
    });
  } catch (error) {
    console.error("[tokenSidePreload] /api/campaigns compatibility route failed", error);
    return res.json({
      items: [],
      nextCursor: null,
      pageSize: 0,
      updatedAt: new Date().toISOString(),
      source: "realtime-indexer-compat-empty",
      warning: "Campaign feed is temporarily unavailable.",
    });
  }
});

// Express' application.get has overloaded signatures. Capturing it without an
// explicit type lets TypeScript infer an ambiguous overload union, which breaks
// the .call() sites below during Railway builds.
const originalGet = express.application.get as unknown as (
  this: typeof express.application,
  path: any,
  ...handlers: any[]
) => any;

express.application.get = function patchedGet(this: any, path: any, ...handlers: any[]) {
  if (path === "/api/ably/token") {
    return originalGet.call(this, path, patchedAblyToken);
  }
  if (path === "/api/campaigns") {
    return originalGet.call(this, path, patchedCampaigns);
  }
  return originalGet.call(this, path, ...handlers);
} as any;
