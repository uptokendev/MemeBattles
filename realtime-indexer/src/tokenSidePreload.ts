import express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ablyRest, tokenChannel, warroomChannel } from "./ably.js";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { startSolanaIndexerLoop } from "./solanaIndexer.js";
import { registerSolanaOpsRoutes } from "./solanaOpsRoutes.js";
import { registerRewardOpsRoutes } from "./rewardOpsRoutes.js";
import {
  createSolanaWalletVerificationChallenge,
  listSolanaPayoutIntents,
  listSolanaRecruiterClaimableSettlements,
  listSolanaRewardClaims,
  recordSolanaRewardClaim,
  updateSolanaPayoutIntentStatus,
  verifySolanaWalletChallenge,
  type SolanaPayoutStatus,
} from "./rewards/solanaPayoutRails.js";

const SOLANA_CHAIN_ID = 101;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_PATCHED_ROUTES = Symbol.for("memewarzone.solanaPayoutRoutesRegistered");

function isSolanaChain(chainId: number) {
  return chainId === SOLANA_CHAIN_ID;
}

function normalizeCampaign(value: unknown, chainId: number) {
  const raw = String(value || "").trim();
  return isSolanaChain(chainId) ? raw : raw.toLowerCase();
}

function outputAddress(value: unknown, chainId: number) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return isSolanaChain(chainId) ? raw : raw.toLowerCase();
}

function normalizeWallet(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (EVM_ADDRESS_RE.test(raw)) return raw.toLowerCase();
  if (isSolanaAddress(raw)) return raw;
  return raw;
}

function isSolanaAddress(value: unknown) {
  const raw = String(value || "").trim();
  return raw.length >= 32 && raw.length <= 44 && SOLANA_ADDRESS_RE.test(raw);
}

function isCampaignAddress(value: string, chainId: number) {
  if (isSolanaChain(chainId)) return isSolanaAddress(value);
  return /^0x[a-f0-9]{40}$/.test(value);
}

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function readBearerToken(req: Request): string {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) return authHeader.slice(7).trim();
  return String(req.headers["x-rank-events-token"] || "").trim();
}

function requireInternalAuth(req: Request, res: Response): boolean {
  const expected = String(ENV.RANK_EVENTS_TOKEN || "").trim();
  if (!expected) {
    res.status(503).json({ ok: false, error: "Internal endpoints are disabled: RANK_EVENTS_TOKEN missing" });
    return false;
  }
  if (readBearerToken(req) !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};

async function safeQuery(sql: string, params: any[] = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    console.warn("[tokenSidePreload] optional query failed", error);
    return { rows: [] as any[] };
  }
}

function emptyWalletRewardSummary(walletAddress: string) {
  return {
    walletAddress,
    pendingByProgram: {},
    claimableByProgram: {},
    totalEarnedByProgram: {},
    claimableTotalRaw: "0",
    pendingTotalRaw: "0",
    totalEarnedRaw: "0",
    claimedByProgram: {},
    totalClaimableAmount: "0",
    claimedLifetimeAmount: "0",
    lastClaimedAt: null,
    materializedAt: null,
    updatedAt: null,
  };
}

function normalizeRecruiterSummary(row: any) {
  if (!row) return null;
  return {
    recruiterId: Number(row.recruiter_id ?? row.id ?? 0),
    walletAddress: normalizeWallet(row.wallet_address ?? row.walletAddress),
    code: String(row.code ?? row.recruiter_code ?? ""),
    displayName: row.display_name ?? row.displayName ?? null,
    isOg: Boolean(row.is_og ?? row.isOg ?? false),
    status: String(row.status ?? "active"),
    closedAt: row.closed_at ?? row.closedAt ?? null,
    linkedWalletCount: Number(row.linked_wallet_count ?? row.linkedWalletCount ?? 0),
    linkedCreatorsCount: Number(row.linked_creators_count ?? row.linkedCreatorsCount ?? 0),
    linkedTradersCount: Number(row.linked_traders_count ?? row.linkedTradersCount ?? 0),
    activeSquadMemberCount: Number(row.active_squad_member_count ?? row.activeSquadMemberCount ?? 0),
    referredEventCount: Number(row.referred_event_count ?? row.referredEventCount ?? 0),
    referredVolumeRaw: String(row.referred_volume_raw ?? row.referredVolumeRaw ?? "0"),
    recruiterRouteAmountRaw: String(row.recruiter_route_amount_raw ?? row.recruiterRouteAmountRaw ?? "0"),
    lastReferredEventAt: row.last_referred_event_at ?? row.lastReferredEventAt ?? null,
    latestLinkedActivityAt: row.latest_linked_activity_at ?? row.latestLinkedActivityAt ?? null,
    pendingEarningsRaw: String(row.pending_earnings_raw ?? row.pendingEarningsRaw ?? "0"),
    claimableEarningsRaw: String(row.claimable_earnings_raw ?? row.claimableEarningsRaw ?? "0"),
    totalEarnedRaw: String(row.total_earned_raw ?? row.totalEarnedRaw ?? "0"),
    claimedLifetimeRaw: String(row.claimed_lifetime_raw ?? row.claimedLifetimeRaw ?? "0"),
    lastClaimedAt: row.last_claimed_at ?? row.lastClaimedAt ?? null,
    weightedScore: Number(row.weighted_score ?? row.weightedScore ?? 0),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    materializedAt: row.materialized_at ?? row.materializedAt ?? null,
  };
}

async function findRecruiterByWallet(walletAddress: string) {
  const normalized = normalizeWallet(walletAddress);
  if (!normalized) return null;
  const result = await safeQuery(
    `select * from public.recruiters where lower(wallet_address::text) = lower($1) order by updated_at desc nulls last, created_at desc nulls last limit 1`,
    [normalized],
  );
  return normalizeRecruiterSummary(result.rows?.[0]);
}

const patchedAblyToken = wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const scope = String(req.query.scope || "token").toLowerCase();

  if (scope === "live") {
    const liveChannel = String(req.query.channel || "").toLowerCase();
    if (!/^live:[a-z0-9._-]+$/.test(liveChannel)) {
      return res.status(400).json({ error: "Invalid live channel name" });
    }
    const liveClientId = String(req.query.clientId || "public");
    const tokenRequest = await ablyRest.auth.createTokenRequest({
      clientId: liveClientId,
      capability: JSON.stringify({
        [liveChannel]: ["subscribe", "publish", "presence", "history"],
      }),
      ttl: 60 * 60 * 1000,
    });
    return res.json(tokenRequest);
  }

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

  const campaign = normalizeCampaign(req.query.campaign, chainId);
  if (!isCampaignAddress(campaign, chainId)) {
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
         c.meta,
         coalesce(cms.market_stage, c.market_stage) as market_stage,
         coalesce(cms.dex_pair_address, c.meta->'solanaGraduation'->>'pool') as dex_pool,
         c.meta->'solanaGraduation'->>'position' as dex_position,
         ts.marketcap_bnb,
         ts.last_price_bnb,
         ts.vol_24h_bnb,
         coalesce(va.votes_24h, 0) as votes_24h,
         coalesce(va.votes_all_time, 0) as votes_all_time
       from public.campaigns c
       left join public.campaign_market_state cms
         on cms.chain_id = c.chain_id and cms.campaign_address = c.campaign_address
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

    const items = result.rows.map((row: any) => {
      const rowChainId = Number(row.chain_id);
      const marketStage = String(row.market_stage || "").trim();
      const isDexTrading = Boolean(
        row.graduated_at_chain ||
          row.dex_pool ||
          row.dex_position ||
          (marketStage && !["BONDING", "LIVE", "ENDED"].includes(marketStage.toUpperCase())),
      );
      return {
        chainId: rowChainId,
        campaignAddress: outputAddress(row.campaign_address, rowChainId),
        tokenAddress: row.token_address ? outputAddress(row.token_address, rowChainId) : null,
        creatorAddress: row.creator_address ? outputAddress(row.creator_address, rowChainId) : null,
        name: row.name ?? null,
        symbol: row.symbol ?? null,
        logoUri: row.logo_uri ?? null,
        createdAtChain: row.created_at_chain ? String(row.created_at_chain) : null,
        graduatedAtChain: row.graduated_at_chain ? String(row.graduated_at_chain) : null,
        marketStage: marketStage || null,
        dexPool: row.dex_pool ? outputAddress(row.dex_pool, rowChainId) : null,
        dexPosition: row.dex_position ? outputAddress(row.dex_position, rowChainId) : null,
        isDexTrading,
        isActive: Boolean(row.is_active),
        status: isDexTrading ? "graduated" : row.is_active ? "live" : "ended",
        marketcapBnb: row.marketcap_bnb != null ? String(row.marketcap_bnb) : null,
        lastPriceBnb: row.last_price_bnb != null ? String(row.last_price_bnb) : null,
        vol24hBnb: row.vol_24h_bnb != null ? String(row.vol_24h_bnb) : null,
        votes24h: Number(row.votes_24h || 0),
        votesAllTime: Number(row.votes_all_time || 0),
      };
    });

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

const walletRewardSummary = wrap(async (req, res) => {
  const walletAddress = normalizeWallet(req.query.walletAddress || req.query.wallet || req.params.walletAddress);
  if (!walletAddress) return res.status(400).json({ ok: false, error: "walletAddress is required" });
  res.json({ ok: true, summary: emptyWalletRewardSummary(walletAddress) });
});

const recruiterSignupStatus = wrap(async (req, res) => {
  const walletAddress = normalizeWallet(req.query.walletAddress || req.query.wallet || req.params.walletAddress);
  if (!walletAddress) return res.status(400).json({ ok: false, error: "walletAddress is required" });
  const recruiter = await findRecruiterByWallet(walletAddress);
  res.json({
    ok: true,
    walletAddress,
    isRecruiter: Boolean(recruiter),
    recruiter,
    canStartSignup: !recruiter,
    signupApiAvailable: false,
    warning: recruiter ? undefined : "Recruiter signup is opening soon.",
  });
});

const recruiterWalletSummary = wrap(async (req, res) => {
  const walletAddress = normalizeWallet(req.params.walletAddress || req.query.walletAddress);
  if (!walletAddress) return res.status(400).json({ ok: false, error: "walletAddress is required" });
  const recruiter = await findRecruiterByWallet(walletAddress);
  if (!recruiter) return res.status(404).json({ ok: false, error: "Recruiter not found" });
  res.json({ ok: true, summary: recruiter });
});

const patchedSolanaClaimRecord = wrap(async (req, res, next) => {
  const chainId = Number(req.body?.chainId || 0);
  if (chainId !== SOLANA_CHAIN_ID && !isSolanaAddress(req.body?.walletAddress ?? req.body?.wallet)) return next();
  if (!requireInternalAuth(req, res)) return;

  const result = await recordSolanaRewardClaim({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    epochId: Number(req.body?.epochId || 0),
    program: String(req.body?.program || "") as any,
    payoutSignature: req.body?.payoutSignature ?? req.body?.claimTxHash ?? null,
    claimedAt: req.body?.claimedAt ? new Date(String(req.body.claimedAt)) : undefined,
    metadata: req.body?.metadata ?? null,
    requireVerifiedWallet: req.body?.requireVerifiedWallet !== false,
  });
  res.json({ ok: true, ...result });
});

const patchedSolanaClaims = wrap(async (req, res, next) => {
  const chainId = req.query.chainId != null && String(req.query.chainId).trim() !== "" ? Number(req.query.chainId) : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  if (chainId !== SOLANA_CHAIN_ID && !isSolanaAddress(walletAddress)) return next();
  if (!requireInternalAuth(req, res)) return;

  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const programRaw = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const claims = await listSolanaRewardClaims({
    epochId,
    walletAddress,
    program: programRaw as any,
    limit,
  });
  res.json({ ok: true, claims });
});

const patchedSolanaClaimableSettlements = wrap(async (req, res, next) => {
  const chainId = req.query.chainId != null && String(req.query.chainId).trim() !== "" ? Number(req.query.chainId) : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  if (chainId !== SOLANA_CHAIN_ID && !isSolanaAddress(walletAddress)) return next();
  if (!requireInternalAuth(req, res)) return;

  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const recruiterId = req.query.recruiterId != null && String(req.query.recruiterId).trim() !== "" ? Number(req.query.recruiterId) : null;
  const recruiterCode = req.query.recruiterCode ? String(req.query.recruiterCode) : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const items = await listSolanaRecruiterClaimableSettlements({
    epochId,
    recruiterId,
    recruiterCode,
    walletAddress,
    limit,
  });
  res.json({ ok: true, items });
});

const solanaWalletChallenge = wrap(async (req, res) => {
  const challenge = await createSolanaWalletVerificationChallenge({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    ttlSeconds: req.body?.ttlSeconds != null ? Number(req.body.ttlSeconds) : undefined,
  });
  res.json({ ok: true, challenge });
});

const solanaWalletVerify = wrap(async (req, res) => {
  const verification = await verifySolanaWalletChallenge({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    signature: req.body?.signature,
    nonce: req.body?.nonce ?? null,
  });
  res.json({ ok: true, verification });
});

const solanaPayoutIntents = wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  const status = req.query.status != null && String(req.query.status).trim() !== "" ? String(req.query.status).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const items = await listSolanaPayoutIntents({ epochId, walletAddress, program: program as any, status: status as any, limit });
  res.json({ ok: true, items });
});

const solanaPayoutIntentStatus = wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const payoutIntentId = Number(req.params.payoutIntentId || 0);
  const status = String(req.body?.status || "").trim() as SolanaPayoutStatus;
  const intent = await updateSolanaPayoutIntentStatus({
    payoutIntentId,
    status,
    payoutSignature: req.body?.payoutSignature ?? null,
    errorMessage: req.body?.errorMessage ?? null,
    metadata: req.body?.metadata ?? null,
  });
  res.json({ ok: true, intent });
});

const originalGet = express.application.get as unknown as (
  this: typeof express.application,
  path: any,
  ...handlers: any[]
) => any;
const originalPost = express.application.post as unknown as (
  this: typeof express.application,
  path: any,
  ...handlers: any[]
) => any;
const originalListen = express.application.listen as unknown as (
  this: typeof express.application,
  ...args: any[]
) => any;

express.application.get = function patchedGet(this: any, path: any, ...handlers: any[]) {
  if (path === "/api/ably/token") {
    return originalGet.call(this, path, patchedAblyToken);
  }
  if (path === "/api/campaigns") {
    return originalGet.call(this, path, patchedCampaigns);
  }
  if (path === "/internal/rewards/claims") {
    return originalGet.call(this, path, patchedSolanaClaims, ...handlers);
  }
  if (path === "/internal/recruiters/claimable-settlements") {
    return originalGet.call(this, path, patchedSolanaClaimableSettlements, ...handlers);
  }
  return originalGet.call(this, path, ...handlers);
} as any;

express.application.post = function patchedPost(this: any, path: any, ...handlers: any[]) {
  if (path === "/internal/rewards/claims/record") {
    return originalPost.call(this, path, patchedSolanaClaimRecord, ...handlers);
  }
  return originalPost.call(this, path, ...handlers);
} as any;

express.application.listen = function patchedListen(this: any, ...args: any[]) {
  if (!this[SOLANA_PATCHED_ROUTES]) {
    this[SOLANA_PATCHED_ROUTES] = true;
    originalPost.call(this, "/api/solana/wallet-verification/challenge", solanaWalletChallenge);
    originalPost.call(this, "/api/solana/wallet-verification/verify", solanaWalletVerify);
    originalGet.call(this, "/api/rewards/wallet", walletRewardSummary);
    originalGet.call(this, "/api/recruiters/signup/status", recruiterSignupStatus);
    originalGet.call(this, "/api/recruiters/wallet/:walletAddress/summary", recruiterWalletSummary);
    originalGet.call(this, "/internal/solana/payout-intents", solanaPayoutIntents);
    originalPost.call(this, "/internal/solana/payout-intents/:payoutIntentId/status", solanaPayoutIntentStatus);
    registerSolanaOpsRoutes(this);
    registerRewardOpsRoutes(this);
  }
  return originalListen.apply(this, args);
} as any;

startSolanaIndexerLoop();
