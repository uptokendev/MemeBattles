import express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { pool } from "./db.js";
import { ablyRest, tokenChannel } from "./ably.js";

function warroomChannel(chainId: number, campaign: string) {
  return `warroom:${chainId}:${campaign.toLowerCase()}`;
}

function normalizeCampaign(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isCampaignAddress(value: string) {
  return /^0x[a-f0-9]{40}$/.test(value);
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

const patchedTokenSummary = wrap(async (req, res) => {
  const campaign = normalizeCampaign(req.params.campaign);
  const chainId = Number(req.query.chainId || 97);

  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ error: "Invalid chainId" });
  }
  if (!isCampaignAddress(campaign)) {
    return res.status(400).json({ error: "Invalid campaign address" });
  }

  const result = await pool.query(
    `select
       ts.*,
       c.token_address,
       c.creator_address,
       c.name,
       c.symbol,
       coalesce(nullif(c.logo_uri, ''), draft_logo.logo_url) as logo_uri,
       coalesce(nullif(c.logo_uri, ''), draft_logo.logo_url) as "logoUri",
       draft_logo.logo_url as "draftLogoUrl"
     from public.token_stats ts
     left join public.campaigns c
       on c.chain_id = ts.chain_id
      and c.campaign_address = ts.campaign_address
     left join lateral (
       select d.logo_url
       from public.campaign_drafts d
       where d.logo_url is not null
         and lower(d.campaign_address::text) = lower(ts.campaign_address::text)
       order by d.updated_at desc nulls last, d.created_at desc nulls last
       limit 1
     ) draft_logo on true
     where ts.chain_id = $1
       and ts.campaign_address = $2
     limit 1`,
    [chainId, campaign],
  );

  if (result.rows[0]) return res.json(result.rows[0]);

  const fallback = await pool.query(
    `select
       c.chain_id,
       c.campaign_address,
       c.token_address,
       c.creator_address,
       c.name,
       c.symbol,
       coalesce(nullif(c.logo_uri, ''), draft_logo.logo_url) as logo_uri,
       coalesce(nullif(c.logo_uri, ''), draft_logo.logo_url) as "logoUri",
       draft_logo.logo_url as "draftLogoUrl"
     from public.campaigns c
     left join lateral (
       select d.logo_url
       from public.campaign_drafts d
       where d.logo_url is not null
         and lower(d.campaign_address::text) = lower(c.campaign_address::text)
       order by d.updated_at desc nulls last, d.created_at desc nulls last
       limit 1
     ) draft_logo on true
     where c.chain_id = $1
       and c.campaign_address = $2
     limit 1`,
    [chainId, campaign],
  );

  return res.json(fallback.rows[0] || null);
});

const originalGet = express.application.get;

express.application.get = function patchedGet(this: any, path: any, ...handlers: any[]) {
  if (path === "/api/ably/token") {
    return originalGet.call(this, path, patchedAblyToken);
  }
  if (path === "/api/token/:campaign/summary") {
    return originalGet.call(this, path, patchedTokenSummary);
  }
  return originalGet.call(this, path, ...handlers);
} as any;
