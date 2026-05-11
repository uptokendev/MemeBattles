import express from "express";
import type { Express, Request, Response } from "express";
import { pool } from "./db.js";

const PUBLIC_DRAFT_STATUSES = ["promotion_published", "ready_to_launch", "scheduled"];
const ZERO_METRICS = { views: 0, follows: 0, comments: 0, reactions: 0, shares: 0, signedActions: 0 };
const DEFAULT_GRAD_TARGET_BNB = 50;

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTicker(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^\$+/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12);
}

function normalizeAddress(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(raw) ? raw : "";
}

function mapDraftRow(row: any) {
  if (!row) return null;
  return {
    id: String(row.id),
    chainId: Number(row.chain_id ?? row.chainId ?? 97),
    creatorWallet: String(row.creator_wallet ?? row.creatorWallet ?? "").toLowerCase(),
    name: String(row.name || ""),
    ticker: normalizeTicker(row.ticker),
    description: row.description || null,
    category: row.category || "meme",
    logoUrl: row.logo_url ?? row.logoUrl ?? null,
    websiteUrl: row.website_url ?? row.websiteUrl ?? null,
    xUrl: row.x_url ?? row.xUrl ?? null,
    otherUrl: row.other_url ?? row.otherUrl ?? null,
    slug: String(row.slug || ""),
    status: String(row.status || "draft"),
    visibility: String(row.visibility || "private"),
    campaignAddress: row.campaign_address ?? row.campaignAddress ?? null,
    tokenAddress: row.token_address ?? row.tokenAddress ?? null,
    deployTxHash: row.deploy_tx_hash ?? row.deployTxHash ?? null,
    archivedAt: row.archived_at ?? row.archivedAt ?? null,
    deployedAt: row.deployed_at ?? row.deployedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

function mapPromotionRow(row: any, draftId: string) {
  return {
    draftId,
    missionStatement: row?.mission_statement ?? row?.missionStatement ?? "",
    roadmap: Array.isArray(row?.roadmap) ? row.roadmap : [],
    launchStrategy: row?.launch_strategy ?? row?.launchStrategy ?? "",
    telegramUrl: row?.telegram_url ?? row?.telegramUrl ?? "",
    discordUrl: row?.discord_url ?? row?.discordUrl ?? "",
    xUrl: row?.x_url ?? row?.xUrl ?? "",
    websiteUrl: row?.website_url ?? row?.websiteUrl ?? "",
    docs: Array.isArray(row?.docs) ? row.docs : [],
    creatorNote: row?.creator_note ?? row?.creatorNote ?? "",
    bannerUrl: row?.banner_url ?? row?.bannerUrl ?? "",
    shareMessage: row?.share_message ?? row?.shareMessage ?? "",
    publishedAt: row?.published_at ?? row?.publishedAt ?? null,
    createdAt: row?.created_at ?? row?.createdAt ?? null,
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
  };
}

function popularityFromMetrics(metrics: any) {
  const m = { ...ZERO_METRICS, ...(metrics || {}) };
  const views = Number(m.views || 0);
  const follows = Number(m.follows || 0);
  const comments = Number(m.comments || 0);
  const reactions = Number(m.reactions || 0);
  const shares = Number(m.shares || 0);
  const signedActions = Number(m.signedActions ?? m.signed_actions ?? 0);
  const rankingScore = follows * 10 + comments * 5 + reactions * 3 + shares * 4 + signedActions * 7 + Math.min(views, 2500) * 0.35;
  const popularityPercentage = Math.max(0, Math.min(100, Math.round((rankingScore / 2200) * 100)));
  const heatLabel = popularityPercentage >= 90 ? "On Fire" : popularityPercentage >= 70 ? "Hot" : popularityPercentage >= 35 ? "Warming" : "Cold";
  return { views, follows, comments, reactions, shares, signedActions, popularityPercentage, heatLabel, rankingScore: Math.round(rankingScore) };
}

async function draftBundleById(id: string, viewer = "") {
  const draftRes = await pool.query("select * from public.campaign_drafts where id::text = $1 limit 1", [id]);
  const draft = mapDraftRow(draftRes.rows[0]);
  if (!draft) return null;
  if (draft.visibility === "private" && viewer && draft.creatorWallet !== viewer) return { forbidden: true };
  if (draft.visibility === "private" && !viewer) return { forbidden: true };

  const promoRes = await pool.query("select * from public.campaign_draft_promotion where draft_id = $1 limit 1", [draft.id]).catch(() => ({ rows: [] as any[] }));
  const metricsRes = await pool.query("select * from public.campaign_draft_metrics where draft_id = $1 limit 1", [draft.id]).catch(() => ({ rows: [] as any[] }));
  return { draft, promotion: mapPromotionRow(promoRes.rows[0], draft.id), popularity: popularityFromMetrics(metricsRes.rows[0]) };
}

async function draftBundleBySlug(slug: string, viewer = "", countView = false) {
  const draftRes = await pool.query("select * from public.campaign_drafts where slug = $1 limit 1", [slug]);
  const draft = mapDraftRow(draftRes.rows[0]);
  if (!draft) return null;
  if (draft.visibility === "private" && viewer && draft.creatorWallet !== viewer) return { forbidden: true };
  if (draft.visibility === "private" && !viewer) return { forbidden: true };

  if (countView) {
    await pool.query(
      "insert into public.campaign_draft_metrics (draft_id, views) values ($1, 1) on conflict (draft_id) do update set views = campaign_draft_metrics.views + 1, updated_at = now()",
      [draft.id],
    ).catch(() => undefined);
  }

  return draftBundleById(draft.id, viewer);
}

function mapCampaignRow(row: any, gradTargetBnb: number) {
  const graduatedAt = row.graduated_at_chain ? String(row.graduated_at_chain) : null;
  return {
    chainId: Number(row.chain_id),
    campaignAddress: String(row.campaign_address || "").toLowerCase(),
    tokenAddress: row.token_address ? String(row.token_address).toLowerCase() : null,
    creatorAddress: row.creator_address ? String(row.creator_address).toLowerCase() : null,
    name: row.name ?? null,
    symbol: row.symbol ?? null,
    logoUri: row.logo_uri ?? null,
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

function registerRouteParity(app: Express) {
  app.get("/api/campaigns", async (req: Request, res: Response, next) => {
    try {
      const chainId = toInt(req.query.chainId, 97);
      const limit = clamp(toInt(req.query.limit, 24), 1, 50);
      const cursor = clamp(toInt(req.query.cursor, 0), 0, 1_000_000);
      const tab = String(req.query.tab || "trending").toLowerCase();
      const requestedStatus = String(req.query.status || "all").toLowerCase();
      const effectiveStatus = tab === "ending" ? "live" : tab === "dex" ? "graduated" : requestedStatus;
      const searchRaw = String(req.query.search || "").trim();
      const search = searchRaw ? `%${searchRaw}%` : null;
      const gradTargetBnb = clamp(Number(req.query.gradTargetBnb || DEFAULT_GRAD_TARGET_BNB), 0.0001, 10_000);

      const params: any[] = [chainId, search, effectiveStatus, cursor, limit, gradTargetBnb];
      const { rows } = await pool.query(
        `select
           c.chain_id, c.campaign_address, c.token_address, c.creator_address,
           c.name, c.symbol, c.logo_uri, c.created_at_chain, c.graduated_at_chain,
           c.is_active,
           ts.last_price_bnb, ts.sold_tokens, ts.marketcap_bnb, ts.vol_24h_bnb,
           ca.last_activity_at,
           va.votes_24h, va.votes_all_time,
           0::numeric as raised_total_bnb,
           0::numeric as raised_10m_bnb,
           null::numeric as progress_pct,
           null::numeric as eta_sec
         from public.campaigns c
         left join public.token_stats ts on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
         left join public.campaign_activity ca on ca.chain_id = c.chain_id and ca.campaign_address = c.campaign_address
         left join public.vote_aggregates va on va.chain_id = c.chain_id and va.campaign_address = c.campaign_address
         where c.chain_id = $1
           and ($2::text is null or c.name ilike $2 or c.symbol ilike $2 or c.campaign_address::text ilike $2)
           and (
             $3::text = 'all'
             or ($3::text = 'live' and c.is_active = true and c.graduated_at_chain is null)
             or ($3::text = 'graduated' and c.graduated_at_chain is not null)
             or ($3::text = 'ended' and c.is_active = false and c.graduated_at_chain is null)
           )
         order by coalesce(ca.last_activity_at, c.created_at_chain) desc nulls last, c.campaign_address asc
         offset $4
         limit $5`,
        params,
      );

      const items = rows.map((row) => mapCampaignRow(row, gradTargetBnb));
      return res.json({ items, nextCursor: items.length === limit ? cursor + limit : null, pageSize: limit, updatedAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/drafts", async (req: Request, res: Response, next) => {
    try {
      const owner = normalizeAddress(req.query.owner);
      const result = owner
        ? await pool.query("select * from public.campaign_drafts where creator_wallet = $1 order by created_at desc limit 50", [owner])
        : await pool.query(
            "select * from public.campaign_drafts where visibility = 'public' and status = any($1::text[]) order by created_at desc limit 50",
            [PUBLIC_DRAFT_STATUSES],
          );
      return res.json({ items: result.rows.map(mapDraftRow).filter(Boolean) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/drafts/:draftId", async (req: Request, res: Response, next) => {
    try {
      const viewer = normalizeAddress(req.query.viewer);
      const bundle = await draftBundleById(String(req.params.draftId || ""), viewer);
      if (!bundle) return res.status(404).json({ error: "Draft not found" });
      if ((bundle as any).forbidden) return res.status(403).json({ error: "This draft is private." });
      return res.json(bundle);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/prepare/:slug", async (req: Request, res: Response, next) => {
    try {
      const viewer = normalizeAddress(req.query.viewer);
      const bundle = await draftBundleBySlug(String(req.params.slug || ""), viewer, true);
      if (!bundle) return res.status(404).json({ error: "Prepare page not found" });
      if ((bundle as any).forbidden) return res.status(403).json({ error: "This draft is private." });
      return res.json(bundle);
    } catch (error) {
      next(error);
    }
  });
}

const originalListen = express.application.listen;
express.application.listen = function patchedListen(this: Express, ...args: any[]) {
  const app = this as Express & { __mwzRouteParityRegistered?: boolean };
  if (!app.__mwzRouteParityRegistered) {
    app.__mwzRouteParityRegistered = true;
    registerRouteParity(app);
  }
  return originalListen.apply(this, args as any);
} as any;
