import express from "express";
import cors from "cors";
import { ENV } from "./env.js";
import "dotenv/config";
import { pool } from "./db.js";
import { ablyRest, tokenChannel, leagueChannel, publishUserRankUpdated } from "./ably.js";
import { runIndexerOnce } from "./indexer.js";
import { startTelemetryReporter, type TelemetrySnapshot } from "./telemetry.js";
import { applyRecruiterDisputeOverride, captureReferralWindow, createOrUpdateRecruiter, getWalletAttributionState, linkWalletOnConnect, linkWalletToRecruiter, resolveRecruiterByCode, setRecruiterOgStatus, setRecruiterStatus } from "./rewards/attribution.js";
import { getCurrentWeeklyRewardEpoch, listRewardEpochs, listRewardEvents } from "./rewards/ingest.js";
import { createExclusionFlag, listEligibilityResults, listExclusionFlags, processRewardEligibilityForEpoch, resolveExclusionFlag } from "./rewards/eligibility.js";
import { AIRDROP_DRAW_PROGRAMS, AIRDROP_DRAW_STATUSES, listAirdropDraws, listAirdropWinners, publishAirdropDraw, runAirdropDrawForEpoch } from "./rewards/airdrops.js";
import { listRecruiterLeaderboard } from "./rewards/recruiterLeaderboard.js";
import { ELIGIBILITY_PROGRAMS, EXCLUSION_FLAG_SEVERITIES, ELIGIBILITY_REASON_CODES } from "./rewards/reasonCodes.js";
import { listRecruiterAdminActions, listRecruiterClaimableSettlements, recordRecruiterAdminAction, RECRUITER_ADMIN_ACTION_TYPES } from "./rewards/recruiterAdmin.js";
import { listClaimRollovers, listRewardClaims, recordRewardClaim, REWARD_PROGRAMS } from "./rewards/ledger.js";
import { CLAIM_REMINDER_KINDS, CLAIM_REMINDER_STATUSES, listClaimReminderDeliveries, listClaimReminderStates, processClaimReminders } from "./rewards/reminders.js";
import { getRewardClaimVaultPosture, getRewardPublicationState, getRewardRoutingDiagnostics, listRewardAdminActions, listRewardEpochProcessorStatuses, listRewardOpsAlerts, recordRewardAdminAction, setRewardPublicationState } from "./rewards/rewardOps.js";
import { createCampaignRouteAuthorization, createTradeRouteAuthorization, getRouteAuthorityAddress, getWalletRouteSnapshot } from "./rewards/routing.js";
import { getRewardAdminEpochSummary, getRecruiterSummaryByCode, getRecruiterSummaryByWalletAddress, getSquadSummaryByRecruiterCode, getWalletRewardSummary, listRecruiterClosureDiagnostics, listRecruiterSummaries, listRewardAdminEpochSummaries, listRewardProgramEpochReconciliations, listSquadSummaries, listWalletEligibilityHistory, listWalletRewardHistory } from "./rewards/readModels.js";
import { getSquadAllocationPreview } from "./rewards/squads.js";
import type { Request, Response, NextFunction, RequestHandler } from "express";

const app = express();
app.use(express.json({ limit: "256kb" }));

// ---------------------------------------------------------------------------
// Minimal in-process metrics (safe to expose)
// ---------------------------------------------------------------------------
let reqCount1m = 0;
let errCount1m = 0;

setInterval(() => {
  reqCount1m = 0;
  errCount1m = 0;
}, 60_000);

app.use((req, res, next) => {
  reqCount1m++;
  res.on("finish", () => {
    if (res.statusCode >= 500) errCount1m++;
  });
  next();
});

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const VALID_RANKS = ["Recruit", "Soldier", "Corporal", "Captain", "General"] as const;
const VALID_RECRUITER_STATUSES = ["active", "inactive", "closed", "suspended"] as const;
type ValidRank = (typeof VALID_RANKS)[number];

function normalizeAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

const PRIVATE_PUBLIC_REASON_CODES = new Set([
  "SELF_TRADING",
  "COMMON_CONTROL_CLUSTER",
  "CIRCULAR_TRADING",
  "WALLET_SPLITTING",
  "CREATOR_FUNDED_FAKE_DEMAND",
  "RECRUITER_FARMING_LOOP",
]);

function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sanitizePublicReasonCodes(values: unknown): string[] {
  const rawCodes = Array.isArray(values) ? values.map((value) => String(value)) : [];
  const safeCodes = rawCodes.filter((code) => !PRIVATE_PUBLIC_REASON_CODES.has(code));
  if (rawCodes.some((code) => PRIVATE_PUBLIC_REASON_CODES.has(code))) {
    safeCodes.push("REVIEW_REQUIRED");
  }
  return uniqStrings(safeCodes.filter((code) => (ELIGIBILITY_REASON_CODES as readonly string[]).includes(code)));
}

function toPublicWalletRewardSummary(summary: NonNullable<Awaited<ReturnType<typeof getWalletRewardSummary>>>) {
  return {
    walletAddress: summary.walletAddress,
    pendingByProgram: summary.pendingByProgram,
    claimableByProgram: summary.claimableByProgram,
    claimedByProgram: summary.claimedByProgram,
    totalClaimableAmount: summary.totalClaimableAmount,
    claimedLifetimeAmount: summary.claimedLifetimeAmount,
    lastClaimedAt: summary.lastClaimedAt,
    materializedAt: summary.materializedAt,
  };
}

function toPublicWalletHistoryItem(item: any) {
  return {
    id: item.id,
    epochId: item.epochId,
    chainId: item.chainId,
    epochType: item.epochType,
    startAt: item.startAt,
    endAt: item.endAt,
    program: item.program,
    grossAmount: item.grossAmount,
    netAmount: item.netAmount,
    status: item.status,
    claimableAt: item.claimableAt,
    claimDeadlineAt: item.claimDeadlineAt,
    claimedAt: item.claimedAt,
    expiredAt: item.expiredAt,
    cancelledAt: item.cancelledAt,
    claim: item.claim
      ? {
          id: item.claim.id,
          claimedAmount: item.claim.claimedAmount,
          claimTxHash: item.claim.claimTxHash,
          claimedAt: item.claim.claimedAt,
          status: item.claim.status,
        }
      : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toPublicRewardClaim(claim: any) {
  return {
    id: claim.id,
    walletAddress: claim.walletAddress,
    epochId: claim.epochId,
    program: claim.program,
    claimedAmount: claim.claimedAmount,
    claimTxHash: claim.claimTxHash,
    claimedAt: claim.claimedAt,
    status: claim.status,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  };
}

function toPublicEligibilityItem(item: any) {
  return {
    id: item.id,
    epochId: item.epochId,
    chainId: item.chainId,
    epochType: item.epochType,
    startAt: item.startAt,
    endAt: item.endAt,
    program: item.program,
    isEligible: item.isEligible,
    reasonCodes: sanitizePublicReasonCodes(item.reasonCodes),
    computedAt: item.computedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toPublicAttributionState(state: Awaited<ReturnType<typeof getWalletAttributionState>>) {
  return {
    walletAddress: state.walletAddress,
    hasActivity: state.hasActivity,
    recruiterLinkState: state.recruiterLinkState,
    recruiterCode: state.recruiter?.code ?? null,
    recruiterDisplayName: state.recruiter?.displayName ?? null,
    recruiterIsOg: Boolean(state.recruiter?.isOg),
    squadState: state.squadState,
  };
}

async function requirePublishedResource(
  res: Response,
  resourceType: "airdrop_winners" | "recruiter_leaderboard" | "squad_leaderboard",
  resourceKey = "default",
): Promise<boolean> {
  const state = await getRewardPublicationState(resourceType, resourceKey);
  if (!state.isPublished) {
    res.status(404).json({ error: "Not found" });
    return false;
  }
  return true;
}

function normalizeRank(value: unknown): ValidRank | null {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (!normalized) return null;

  const match = VALID_RANKS.find((rank) => rank.toLowerCase() === normalized);
  return match ?? null;
}

function rankIndex(value: unknown): number {
  const normalized = normalizeRank(value);
  return normalized ? VALID_RANKS.indexOf(normalized) : -1;
}

function requireInternalAuth(req: Request, res: Response): boolean {
  const expected = String(ENV.RANK_EVENTS_TOKEN || "").trim();
  if (!expected) {
    res.status(503).json({ ok: false, error: "Internal endpoints are disabled: RANK_EVENTS_TOKEN missing" });
    return false;
  }

  const token = readBearerToken(req);
  if (!token || token !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }

  return true;
}

function readBearerToken(req: Request): string {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return String(req.headers["x-rank-events-token"] || "").trim();
}

const allowedOrigins = new Set(
  [
   "http://localhost:5173",
   "http://localhost:3000",
   "http://localhost:8080",
   "http://localhost:8081",
   "https://memewarzone.netlify.app",
  "https://memewar.zone",
  "https://www.memewar.zone",
  ]
    .concat(
      String(process.env.CORS_ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
);


function isAllowedOrigin(origin?: string) {
  if (!origin) return true; // allow non-browser (curl, server-to-server)
  if (allowedOrigins.has(origin)) return true;

  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();

    // Local frontend dev / preview ports.
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }

    // Current production/custom domains
    if (host === "memewar.zone" || host === "www.memewar.zone" || host.endsWith(".memewar.zone")) {
      return true;
    }

    // Netlify deploy previews / branch deploys
    if (host.endsWith(".netlify.app")) {
      return true;
    }

    // Old Vercel previews
    if (
      host.endsWith(".vercel.app") &&
      (host.includes("memebattles") || host.includes("meme-battles") || host.includes("memewar"))
    ) {
      return true;
    }

    if (host.includes("meme-battles") || host.includes("memebattles") || host.includes("memewar")) {
      return true;
    }
  } catch {
    // ignore invalid origin
  }

  return false;
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: false,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
// Extremely lightweight health (no DB). Safe for frequent monitoring.
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("select 1 as ok");
    res.json({ ok: true, db: r.rows[0].ok });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * Ably token auth endpoint
 *
 * TokenDetails (per-campaign): /api/ably/token?chainId=97&campaign=0x...
 * League (global):             /api/ably/token?chainId=97&scope=league
 */
app.get("/api/ably/token", async (req, res) => {
  try {
    const chainId = Number(req.query.chainId || 97);
    const scope = String(req.query.scope || "token");

    if (scope === "league") {
      const channel = leagueChannel(chainId);
      const capability = { [channel]: ["subscribe"] };

      const tokenRequest = await ablyRest.auth.createTokenRequest({
        clientId: "public",
        capability: JSON.stringify(capability),
        ttl: 60 * 60 * 1000, // 1 hour
      });

      return res.json(tokenRequest);
    }

    const campaign = String(req.query.campaign || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(campaign)) {
      return res.status(400).json({ error: "Invalid campaign address" });
    }

    const channel = tokenChannel(chainId, campaign);
    const capability = { [channel]: ["subscribe"] };

    const tokenRequest = await ablyRest.auth.createTokenRequest({
      // IMPORTANT: clientId MUST be stable across re-auth on an existing connection.
      // Using a random clientId triggers Ably 40102 (mismatched clientId).
      clientId: "public",
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000, // 1 hour
    });

    return res.json(tokenRequest);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/internal/user-rank-updated", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;

  const chainId = Number(req.body?.chainId || 97);
  const address = normalizeAddress(req.body?.address ?? req.body?.userAddress ?? req.body?.wallet);
  const requestedOldRank = normalizeRank(req.body?.oldRank ?? req.body?.previousRank);
  const newRank = normalizeRank(req.body?.newRank ?? req.body?.rank);
  const rankPointsRaw = req.body?.rankPoints;
  const rankPoints = rankPointsRaw == null || rankPointsRaw === ""
    ? null
    : Number.isFinite(Number(rankPointsRaw))
      ? Number(rankPointsRaw)
      : null;

  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ ok: false, error: "Invalid chainId" });
  }
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ ok: false, error: "Invalid address" });
  }
  if (!newRank) {
    return res.status(400).json({ ok: false, error: "Invalid newRank" });
  }

  let storedPreviousRank: ValidRank | null = null;
  let persisted = false;

  try {
    const prev = await pool.query(
      `select current_rank from public.user_rank_state where chain_id=$1 and address=$2 limit 1`,
      [chainId, address]
    );
    storedPreviousRank = normalizeRank(prev.rows?.[0]?.current_rank ?? null);

    await pool.query(
      `insert into public.user_rank_state (chain_id, address, current_rank, previous_rank, rank_points, created_at, updated_at)
       values ($1, $2, $3, $4, $5, now(), now())
       on conflict (chain_id, address)
       do update set current_rank = excluded.current_rank,
                     previous_rank = excluded.previous_rank,
                     rank_points = excluded.rank_points,
                     updated_at = now()`,
      [chainId, address, newRank, requestedOldRank ?? storedPreviousRank, rankPoints]
    );
    persisted = true;
  } catch (e: any) {
    const code = e?.code;
    if (code !== "42P01" && code !== "42703") {
      throw e;
    }
  }

  const oldRank = requestedOldRank ?? storedPreviousRank;

  await publishUserRankUpdated(chainId, {
    address,
    oldRank,
    newRank,
    rankPoints,
    updatedAt: new Date().toISOString(),
  });

  return res.json({
    ok: true,
    persisted,
    chainId,
    address,
    oldRank,
    newRank,
    promoted: oldRank ? rankIndex(newRank) > rankIndex(oldRank) : null,
  });
}));

// ---------------------------------------------------------------------------
// Profile Activity (v1)
// ---------------------------------------------------------------------------

app.get("/internal/attribution/wallet/:wallet", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const walletAddress = normalizeAddress(req.params.wallet);
  const state = await getWalletAttributionState(walletAddress);
  res.json({ ok: true, state });
}));

app.post("/internal/recruiters/upsert", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;

  const statusRaw = String(req.body?.status || "active").trim().toLowerCase();
  if (!(VALID_RECRUITER_STATUSES as readonly string[]).includes(statusRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid recruiter status" });
  }

  const recruiter = await createOrUpdateRecruiter({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    code: req.body?.code,
    displayName: req.body?.displayName ?? null,
    isOg: Boolean(req.body?.isOg),
    status: statusRaw as (typeof VALID_RECRUITER_STATUSES)[number],
  });

  const adminAction = await recordRecruiterAdminAction({
    recruiterId: recruiter.id,
    walletAddress: recruiter.walletAddress,
    actionType: "recruiter_upsert",
    actedBy: req.body?.actedBy ?? null,
    reason: req.body?.reason ?? null,
    detailsJson: {
      code: recruiter.code,
      displayName: recruiter.displayName,
      isOg: recruiter.isOg,
      status: recruiter.status,
    },
  });

  res.json({ ok: true, recruiter, adminAction });
}));

app.post("/internal/attribution/referral/capture", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;

  let recruiterId = Number(req.body?.recruiterId || 0);
  if (!Number.isFinite(recruiterId) || recruiterId <= 0) {
    const recruiterCode = String(req.body?.recruiterCode || req.body?.code || "").trim();
    if (!recruiterCode) {
      return res.status(400).json({ ok: false, error: "recruiterId or recruiterCode required" });
    }
    const recruiter = await resolveRecruiterByCode(recruiterCode);
    if (!recruiter) return res.status(404).json({ ok: false, error: "Recruiter not found" });
    recruiterId = recruiter.id;
  }

  const referral = await captureReferralWindow({
    recruiterId,
    walletAddress: req.body?.walletAddress ?? null,
    clientFingerprint: req.body?.clientFingerprint ?? null,
    sessionToken: req.body?.sessionToken ?? null,
    expiresAt: req.body?.expiresAt ? new Date(String(req.body.expiresAt)) : undefined,
    metadata: req.body?.metadata ?? null,
  });

  res.json({ ok: true, referral });
}));

app.post("/internal/attribution/wallet-connect", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const result = await linkWalletOnConnect({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    sessionToken: req.body?.sessionToken ?? null,
    clientFingerprint: req.body?.clientFingerprint ?? null,
    linkedAt: req.body?.linkedAt ? new Date(String(req.body.linkedAt)) : undefined,
  });
  res.json({ ok: true, ...result });
}));

app.post("/internal/attribution/link", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;

  let recruiterId = Number(req.body?.recruiterId || 0);
  if (!Number.isFinite(recruiterId) || recruiterId <= 0) {
    const recruiterCode = String(req.body?.recruiterCode || req.body?.code || "").trim();
    if (!recruiterCode) {
      return res.status(400).json({ ok: false, error: "recruiterId or recruiterCode required" });
    }
    const recruiter = await resolveRecruiterByCode(recruiterCode);
    if (!recruiter) return res.status(404).json({ ok: false, error: "Recruiter not found" });
    recruiterId = recruiter.id;
  }

  const result = await linkWalletToRecruiter({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    recruiterId,
    linkSource: (String(req.body?.linkSource || "manual").trim() || "manual") as any,
    linkedAt: req.body?.linkedAt ? new Date(String(req.body.linkedAt)) : undefined,
  });
  res.json({ ok: true, ...result });
}));

app.post("/internal/recruiters/:recruiterId/status", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const recruiterId = Number(req.params.recruiterId || 0);
  const statusRaw = String(req.body?.status || "").trim().toLowerCase();
  if (!Number.isFinite(recruiterId) || recruiterId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid recruiterId" });
  }
  if (!(VALID_RECRUITER_STATUSES as readonly string[]).includes(statusRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid recruiter status" });
  }

  const result = await setRecruiterStatus({
    recruiterId,
    status: statusRaw as (typeof VALID_RECRUITER_STATUSES)[number],
    detachMembers: Boolean(req.body?.detachMembers),
    detachReason: req.body?.detachReason ?? null,
    changedAt: req.body?.changedAt ? new Date(String(req.body.changedAt)) : undefined,
  });

  const adminAction = await recordRecruiterAdminAction({
    recruiterId,
    walletAddress: result.recruiter.walletAddress,
    actionType: "status_change",
    actedBy: req.body?.actedBy ?? null,
    reason: req.body?.reason ?? req.body?.detachReason ?? null,
    detailsJson: {
      status: result.recruiter.status,
      detachMembers: Boolean(req.body?.detachMembers),
      detachReason: req.body?.detachReason ?? null,
      detachedWalletCount: result.detachedWalletCount,
    },
  });

  res.json({ ok: true, ...result, adminAction });
}));

app.post("/internal/recruiters/:recruiterId/og-tag", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const recruiterId = Number(req.params.recruiterId || 0);
  if (!Number.isFinite(recruiterId) || recruiterId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid recruiterId" });
  }

  const recruiter = await setRecruiterOgStatus({
    recruiterId,
    isOg: Boolean(req.body?.isOg),
  });

  const adminAction = await recordRecruiterAdminAction({
    recruiterId,
    walletAddress: recruiter.walletAddress,
    actionType: "og_tag_update",
    actedBy: req.body?.actedBy ?? null,
    reason: req.body?.reason ?? null,
    detailsJson: {
      isOg: recruiter.isOg,
      code: recruiter.code,
    },
  });

  res.json({ ok: true, recruiter, adminAction });
}));

app.post("/internal/recruiters/dispute-override", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;

  let recruiterId = Number(req.body?.recruiterId || 0);
  if (!Number.isFinite(recruiterId) || recruiterId <= 0) {
    const recruiterCode = String(req.body?.recruiterCode || req.body?.code || "").trim();
    if (!recruiterCode) {
      return res.status(400).json({ ok: false, error: "recruiterId or recruiterCode required" });
    }
    const recruiter = await resolveRecruiterByCode(recruiterCode);
    if (!recruiter) return res.status(404).json({ ok: false, error: "Recruiter not found" });
    recruiterId = recruiter.id;
  }

  const result = await applyRecruiterDisputeOverride({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    recruiterId,
    linkedAt: req.body?.linkedAt ? new Date(String(req.body.linkedAt)) : undefined,
    reason: req.body?.detachReason ?? req.body?.reason ?? null,
  });

  const adminAction = await recordRecruiterAdminAction({
    recruiterId: result.recruiter.id,
    walletAddress: result.state.walletAddress,
    actionType: "dispute_override",
    actedBy: req.body?.actedBy ?? null,
    reason: req.body?.reason ?? req.body?.detachReason ?? null,
    detailsJson: {
      previousRecruiterId: result.previousRecruiter?.id ?? null,
      previousRecruiterCode: result.previousRecruiter?.code ?? null,
      recruiterId: result.recruiter.id,
      recruiterCode: result.recruiter.code,
      recruiterLinkState: result.state.recruiterLinkState,
      squadState: result.state.squadState,
      hasActivity: result.state.hasActivity,
    },
  });

  res.json({ ok: true, ...result, adminAction });
}));

app.get("/internal/recruiters/admin-actions", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const recruiterId = req.query.recruiterId != null && String(req.query.recruiterId).trim() !== "" ? Number(req.query.recruiterId) : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const recruiterCode = req.query.recruiterCode ? String(req.query.recruiterCode) : null;
  const actionType = req.query.actionType != null && String(req.query.actionType).trim() !== "" ? String(req.query.actionType).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (recruiterId != null && !Number.isFinite(recruiterId)) {
    return res.status(400).json({ ok: false, error: "Invalid recruiterId" });
  }
  if (actionType != null && !(RECRUITER_ADMIN_ACTION_TYPES as readonly string[]).includes(actionType)) {
    return res.status(400).json({ ok: false, error: "Invalid recruiter admin action type" });
  }

  const items = await listRecruiterAdminActions({
    recruiterId,
    walletAddress,
    recruiterCode,
    actionType: actionType as any,
    limit,
  });
  res.json({ ok: true, items });
}));

app.get("/internal/recruiters/claimable-settlements", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const recruiterId = req.query.recruiterId != null && String(req.query.recruiterId).trim() !== "" ? Number(req.query.recruiterId) : null;
  const recruiterCode = req.query.recruiterCode ? String(req.query.recruiterCode) : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const chainId = req.query.chainId != null && String(req.query.chainId).trim() !== "" ? Number(req.query.chainId) : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (recruiterId != null && !Number.isFinite(recruiterId)) {
    return res.status(400).json({ ok: false, error: "Invalid recruiterId" });
  }
  if (chainId != null && !Number.isFinite(chainId)) {
    return res.status(400).json({ ok: false, error: "Invalid chainId" });
  }

  const items = await listRecruiterClaimableSettlements({
    epochId,
    recruiterId,
    recruiterCode,
    walletAddress,
    chainId,
    limit,
  });
  res.json({ ok: true, items });
}));

app.post("/api/recruiters/:code/referral/capture", wrap(async (req, res) => {
  const recruiter = await resolveRecruiterByCode(req.params.code);
  if (!recruiter) return res.status(404).json({ ok: false, error: "Recruiter not found" });

  const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};
  const referral = await captureReferralWindow({
    recruiterId: recruiter.id,
    walletAddress: req.body?.walletAddress ?? null,
    clientFingerprint: req.body?.clientFingerprint ?? null,
    sessionToken: req.body?.sessionToken ?? null,
    metadata: { source: "public_referral_capture", ...metadata },
  });

  res.json({
    ok: true,
    recruiter: {
      code: recruiter.code,
      displayName: recruiter.displayName,
      isOg: recruiter.isOg,
      status: recruiter.status,
    },
    referral,
  });
}));

app.get("/api/recruiters", wrap(async (req, res) => {
  if (!(await requirePublishedResource(res, "recruiter_leaderboard"))) return;
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const status = req.query.status != null && String(req.query.status).trim() !== "" ? String(req.query.status).trim() : null;
  const leaderboard = await listRecruiterLeaderboard({ status, limit });
  res.json({ ok: true, recruiters: leaderboard.recruiters, weights: leaderboard.weights });
}));

app.post("/api/attribution/wallet-connect", wrap(async (req, res) => {
  const result = await linkWalletOnConnect({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    sessionToken: req.body?.sessionToken ?? null,
    clientFingerprint: req.body?.clientFingerprint ?? null,
    linkedAt: req.body?.linkedAt ? new Date(String(req.body.linkedAt)) : undefined,
  });

  res.json({
    ok: true,
    changed: result.changed,
    errorCode: result.errorCode,
    state: toPublicAttributionState(result.state),
  });
}));

app.get("/api/attribution/wallet/:wallet", wrap(async (req, res) => {
  const walletAddress = normalizeAddress(req.params.wallet);
  const state = await getWalletAttributionState(walletAddress);
  res.json({ ok: true, state: toPublicAttributionState(state) });
}));

app.get("/api/recruiter-routing/wallet/:wallet", wrap(async (req, res) => {
  const walletAddress = normalizeAddress(req.params.wallet);
  const routing = await getWalletRouteSnapshot(walletAddress);
  res.json({ ok: true, routing, routeAuthority: getRouteAuthorityAddress() });
}));

app.post("/api/recruiter-routing/trade-authorization", wrap(async (req, res) => {
  const authorization = await createTradeRouteAuthorization({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    campaignAddress: req.body?.campaignAddress ?? req.body?.campaign,
    chainId: Number(req.body?.chainId),
  });
  res.json({ ok: true, authorization, routeAuthority: getRouteAuthorityAddress() });
}));

app.post("/api/recruiter-routing/create-authorization", wrap(async (req, res) => {
  const authorization = await createCampaignRouteAuthorization({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    factoryAddress: req.body?.factoryAddress ?? req.body?.factory,
    chainId: Number(req.body?.chainId),
  });
  res.json({ ok: true, authorization, routeAuthority: getRouteAuthorityAddress() });
}));

app.get("/internal/rewards/epochs/current", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const chainId = Number(req.query.chainId || 97);
  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ ok: false, error: "Invalid chainId" });
  }

  const epoch = await getCurrentWeeklyRewardEpoch(chainId);
  res.json({ ok: true, epoch });
}));

app.get("/internal/rewards/epochs", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const chainId = Number(req.query.chainId || 97);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ ok: false, error: "Invalid chainId" });
  }

  const epochs = await listRewardEpochs(chainId, limit);
  res.json({ ok: true, epochs });
}));

app.get("/internal/rewards/events", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const chainId = Number(req.query.chainId || 97);
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ ok: false, error: "Invalid chainId" });
  }
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }

  const events = await listRewardEvents({
    chainId,
    epochId,
    campaignAddress: req.query.campaignAddress ? String(req.query.campaignAddress) : null,
    walletAddress: req.query.walletAddress ? String(req.query.walletAddress) : null,
    txHash: req.query.txHash ? String(req.query.txHash) : null,
    limit,
  });

  res.json({ ok: true, events });
}));

app.get("/internal/rewards/eligibility", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const programRaw = req.query.program != null ? String(req.query.program).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (programRaw != null && !(ELIGIBILITY_PROGRAMS as readonly string[]).includes(programRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid eligibility program" });
  }

  const results = await listEligibilityResults({
    epochId,
    walletAddress,
    program: (programRaw as any) ?? null,
    limit,
  });
  res.json({ ok: true, results });
}));

app.get("/internal/rewards/exclusions", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const programRaw = req.query.program != null ? String(req.query.program).trim() : null;
  const severityRaw = req.query.severity != null ? String(req.query.severity).trim() : null;
  const onlyOpen = String(req.query.onlyOpen || "true").trim().toLowerCase() !== "false";
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (programRaw != null && !(ELIGIBILITY_PROGRAMS as readonly string[]).includes(programRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid exclusion program" });
  }
  if (severityRaw != null && !(EXCLUSION_FLAG_SEVERITIES as readonly string[]).includes(severityRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid exclusion severity" });
  }

  const flags = await listExclusionFlags({
    epochId,
    walletAddress,
    program: (programRaw as any) ?? null,
    severity: (severityRaw as any) ?? null,
    onlyOpen,
    limit,
  });
  res.json({ ok: true, flags });
}));

app.post("/internal/rewards/exclusions", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.body?.epochId != null && String(req.body.epochId).trim() !== "" ? Number(req.body.epochId) : null;
  const programRaw = req.body?.program != null && String(req.body.program).trim() !== "" ? String(req.body.program).trim() : null;
  const severityRaw = String(req.body?.severity || "").trim();
  const flagTypeRaw = String(req.body?.flagType || "").trim();
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (programRaw != null && !(ELIGIBILITY_PROGRAMS as readonly string[]).includes(programRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid exclusion program" });
  }
  if (!(EXCLUSION_FLAG_SEVERITIES as readonly string[]).includes(severityRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid exclusion severity" });
  }
  if (!(ELIGIBILITY_REASON_CODES as readonly string[]).includes(flagTypeRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid exclusion flag type" });
  }

  const flag = await createExclusionFlag({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    epochId,
    program: (programRaw as any) ?? null,
    flagType: flagTypeRaw as any,
    severity: severityRaw as any,
    detailsJson: req.body?.detailsJson ?? req.body?.details ?? null,
    metadata: req.body?.metadata ?? null,
  });
  const adminAction = await recordRewardAdminAction({
    actionType: "exclusion_create",
    resourceType: "exclusion_flag",
    resourceKey: String(flag.id),
    actedBy: req.body?.actedBy ?? null,
    reason: req.body?.reason ?? null,
    detailsJson: {
      epochId,
      program: (programRaw as any) ?? null,
      flagType: flagTypeRaw,
      severity: severityRaw,
      walletAddress: flag.walletAddress,
    },
  });
  res.json({ ok: true, flag, adminAction });
}));

app.post("/internal/rewards/exclusions/:exclusionFlagId/resolve", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const exclusionFlagId = Number(req.params.exclusionFlagId || 0);
  if (!Number.isFinite(exclusionFlagId) || exclusionFlagId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid exclusionFlagId" });
  }

  const flag = await resolveExclusionFlag({
    exclusionFlagId,
    resolvedBy: req.body?.resolvedBy ?? null,
    resolutionNote: req.body?.resolutionNote ?? null,
    resolvedAt: req.body?.resolvedAt ? new Date(String(req.body.resolvedAt)) : undefined,
  });
  if (!flag) return res.status(404).json({ ok: false, error: "Exclusion flag not found" });
  const adminAction = await recordRewardAdminAction({
    actionType: "exclusion_resolve",
    resourceType: "exclusion_flag",
    resourceKey: String(flag.id),
    actedBy: req.body?.resolvedBy ?? null,
    reason: req.body?.resolutionNote ?? null,
    detailsJson: {
      walletAddress: flag.walletAddress,
      resolvedAt: flag.resolvedAt,
      resolutionNote: flag.resolutionNote,
    },
  });
  res.json({ ok: true, flag, adminAction });
}));

app.post("/internal/rewards/epochs/:epochId/process-eligibility", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = Number(req.params.epochId || 0);
  if (!Number.isFinite(epochId) || epochId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }

  const result = await processRewardEligibilityForEpoch(epochId);
  res.json({ ok: true, ...result });
}));

app.get("/internal/rewards/claims", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const programRaw = req.query.program != null ? String(req.query.program).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (programRaw != null && !(REWARD_PROGRAMS as readonly string[]).includes(programRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid reward program" });
  }

  const claims = await listRewardClaims({
    epochId,
    walletAddress,
    program: (programRaw as any) ?? null,
    limit,
  });
  res.json({ ok: true, claims });
}));

app.post("/internal/rewards/claims/record", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = Number(req.body?.epochId || 0);
  const programRaw = String(req.body?.program || "").trim();
  if (!Number.isFinite(epochId) || epochId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (!(REWARD_PROGRAMS as readonly string[]).includes(programRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid reward program" });
  }

  const result = await recordRewardClaim({
    walletAddress: req.body?.walletAddress ?? req.body?.wallet,
    epochId,
    program: programRaw as any,
    claimTxHash: req.body?.claimTxHash ?? null,
    claimedAt: req.body?.claimedAt ? new Date(String(req.body.claimedAt)) : undefined,
    metadata: req.body?.metadata ?? null,
  });
  res.json({ ok: true, ...result });
}));

app.get("/internal/rewards/reminders", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const reminderKindRaw = req.query.reminderKind != null ? String(req.query.reminderKind).trim() : null;
  const statusRaw = req.query.status != null ? String(req.query.status).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (reminderKindRaw != null && !(CLAIM_REMINDER_KINDS as readonly string[]).includes(reminderKindRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid reminder kind" });
  }
  if (statusRaw != null && !(CLAIM_REMINDER_STATUSES as readonly string[]).includes(statusRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid reminder status" });
  }

  const reminders = await listClaimReminderStates({
    walletAddress,
    reminderKind: (reminderKindRaw as any) ?? null,
    status: (statusRaw as any) ?? null,
    limit,
  });
  res.json({ ok: true, reminders });
}));

app.get("/internal/rewards/reminders/deliveries", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const reminderStateId = req.query.reminderStateId != null && String(req.query.reminderStateId).trim() !== "" ? Number(req.query.reminderStateId) : null;
  const reminderKindRaw = req.query.reminderKind != null ? String(req.query.reminderKind).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (reminderStateId != null && !Number.isFinite(reminderStateId)) {
    return res.status(400).json({ ok: false, error: "Invalid reminderStateId" });
  }
  if (reminderKindRaw != null && !(CLAIM_REMINDER_KINDS as readonly string[]).includes(reminderKindRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid reminder kind" });
  }

  const deliveries = await listClaimReminderDeliveries({
    walletAddress,
    reminderStateId,
    reminderKind: (reminderKindRaw as any) ?? null,
    limit,
  });
  res.json({ ok: true, deliveries });
}));

app.post("/internal/rewards/reminders/process", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const limit = req.body?.limit != null ? Number(req.body.limit) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit <= 0)) {
    return res.status(400).json({ ok: false, error: "Invalid limit" });
  }

  const result = await processClaimReminders(
    req.body?.asOf ? new Date(String(req.body.asOf)) : new Date(),
    limit != null ? Math.min(limit, 500) : undefined,
  );
  res.json({ ok: true, ...result });
}));

app.get("/internal/rewards/rollovers", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const fromLedgerEntryId = req.query.fromLedgerEntryId != null && String(req.query.fromLedgerEntryId).trim() !== "" ? Number(req.query.fromLedgerEntryId) : null;
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (fromLedgerEntryId != null && !Number.isFinite(fromLedgerEntryId)) {
    return res.status(400).json({ ok: false, error: "Invalid fromLedgerEntryId" });
  }
  if (program != null && !(REWARD_PROGRAMS as readonly string[]).includes(program)) {
    return res.status(400).json({ ok: false, error: "Invalid reward program" });
  }
  const rollovers = await listClaimRollovers({ fromLedgerEntryId, program: program as any, limit });
  res.json({ ok: true, rollovers });
}));


app.get("/internal/rewards/read-models/wallet/:wallet", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const summary = await getWalletRewardSummary(req.params.wallet);
  if (!summary) return res.status(404).json({ ok: false, error: "Wallet reward summary not found" });
  res.json({ ok: true, summary });
}));

app.get("/internal/rewards/read-models/recruiters", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const status = req.query.status != null && String(req.query.status).trim() !== "" ? String(req.query.status).trim() : null;
  const recruiters = await listRecruiterSummaries({ status, limit });
  res.json({ ok: true, recruiters });
}));

app.get("/internal/rewards/read-models/recruiters/:code", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const recruiter = await getRecruiterSummaryByCode(req.params.code);
  if (!recruiter) return res.status(404).json({ ok: false, error: "Recruiter summary not found" });
  res.json({ ok: true, recruiter });
}));

app.get("/internal/rewards/read-models/squads", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const status = req.query.status != null && String(req.query.status).trim() !== "" ? String(req.query.status).trim() : null;
  const squads = await listSquadSummaries({ status, limit });
  res.json({ ok: true, squads });
}));

app.get("/internal/rewards/read-models/squads/:recruiterCode", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const squad = await getSquadSummaryByRecruiterCode(req.params.recruiterCode);
  if (!squad) return res.status(404).json({ ok: false, error: "Squad summary not found" });
  res.json({ ok: true, squad });
}));

app.get("/internal/rewards/admin/epochs", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const chainId = req.query.chainId != null && String(req.query.chainId).trim() !== "" ? Number(req.query.chainId) : null;
  const status = req.query.status != null && String(req.query.status).trim() !== "" ? String(req.query.status).trim() : null;
  if (chainId != null && !Number.isFinite(chainId)) {
    return res.status(400).json({ ok: false, error: "Invalid chainId" });
  }
  const epochs = await listRewardAdminEpochSummaries({ chainId, status, limit });
  res.json({ ok: true, epochs });
}));

app.get("/internal/rewards/admin/epochs/:epochId", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = Number(req.params.epochId || 0);
  if (!Number.isFinite(epochId) || epochId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  const epoch = await getRewardAdminEpochSummary(epochId);
  if (!epoch) return res.status(404).json({ ok: false, error: "Reward admin epoch summary not found" });
  res.json({ ok: true, epoch });
}));

app.get("/internal/rewards/admin/reconciliations", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (program != null && !(REWARD_PROGRAMS as readonly string[]).includes(program)) {
    return res.status(400).json({ ok: false, error: "Invalid reward program" });
  }
  const items = await listRewardProgramEpochReconciliations({ epochId, program: program as any, limit });
  res.json({ ok: true, items });
}));

app.get("/internal/rewards/admin/closures", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const status = req.query.status != null && String(req.query.status).trim() !== "" ? String(req.query.status).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const items = await listRecruiterClosureDiagnostics({ status, limit });
  res.json({ ok: true, items });
}));

app.get("/internal/rewards/airdrops/draws", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  const status = req.query.status != null && String(req.query.status).trim() !== "" ? String(req.query.status).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (program != null && !(AIRDROP_DRAW_PROGRAMS as readonly string[]).includes(program)) {
    return res.status(400).json({ ok: false, error: "Invalid airdrop program" });
  }
  if (status != null && !(AIRDROP_DRAW_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({ ok: false, error: "Invalid draw status" });
  }
  const items = await listAirdropDraws({ epochId, program: program as any, status: status as any, limit });
  res.json({ ok: true, items });
}));

app.get("/internal/rewards/airdrops/winners", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (program != null && !(AIRDROP_DRAW_PROGRAMS as readonly string[]).includes(program)) {
    return res.status(400).json({ ok: false, error: "Invalid airdrop program" });
  }
  const items = await listAirdropWinners({ epochId, program: program as any, walletAddress, limit });
  res.json({ ok: true, items });
}));

app.post("/internal/rewards/airdrops/epochs/:epochId/draws/run", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const epochId = Number(req.params.epochId || 0);
  const program = req.body?.program != null && String(req.body.program).trim() !== "" ? String(req.body.program).trim() : null;
  const publish = Boolean(req.body?.publish);
  if (!Number.isFinite(epochId) || epochId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid epochId" });
  }
  if (program != null && !(AIRDROP_DRAW_PROGRAMS as readonly string[]).includes(program)) {
    return res.status(400).json({ ok: false, error: "Invalid airdrop program" });
  }

  const programs = program ? [program as any] : [...AIRDROP_DRAW_PROGRAMS];
  const results = [];
  for (const currentProgram of programs) {
    const result = await runAirdropDrawForEpoch({
      epochId,
      program: currentProgram,
      seed: req.body?.seed ?? null,
      createdBy: req.body?.actedBy ?? null,
      publish,
    });
    results.push(result);
    await recordRewardAdminAction({
      actionType: "draw_run",
      resourceType: "airdrop_draw",
      resourceKey: String(result.draw.id),
      actedBy: req.body?.actedBy ?? null,
      reason: req.body?.reason ?? null,
      detailsJson: {
        epochId,
        program: currentProgram,
        drawId: result.draw.id,
        published: publish,
        winnerCount: result.winners.length,
      },
    });
    if (publish) {
      await recordRewardAdminAction({
        actionType: "draw_publish",
        resourceType: "airdrop_draw",
        resourceKey: String(result.draw.id),
        actedBy: req.body?.actedBy ?? null,
        reason: req.body?.reason ?? null,
        detailsJson: {
          epochId,
          program: currentProgram,
          drawId: result.draw.id,
        },
      });
    }
  }

  res.json({ ok: true, results });
}));

app.post("/internal/rewards/airdrops/draws/:drawId/publish", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const drawId = Number(req.params.drawId || 0);
  if (!Number.isFinite(drawId) || drawId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid drawId" });
  }
  const draw = await publishAirdropDraw(drawId, req.body?.actedBy ?? null);
  if (!draw) return res.status(404).json({ ok: false, error: "Draw not found" });
  await recordRewardAdminAction({
    actionType: "draw_publish",
    resourceType: "airdrop_draw",
    resourceKey: String(draw.id),
    actedBy: req.body?.actedBy ?? null,
    reason: req.body?.reason ?? null,
    detailsJson: {
      epochId: draw.epochId,
      program: draw.program,
      drawId: draw.id,
    },
  });
  res.json({ ok: true, draw });
}));

app.get("/internal/rewards/publications", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const resourceType = req.query.resourceType != null && String(req.query.resourceType).trim() !== "" ? String(req.query.resourceType).trim() : null;
  const resourceKey = req.query.resourceKey != null && String(req.query.resourceKey).trim() !== "" ? String(req.query.resourceKey).trim() : "default";
  if (resourceType == null) {
    const states = await Promise.all([
      getRewardPublicationState("airdrop_winners"),
      getRewardPublicationState("recruiter_leaderboard"),
      getRewardPublicationState("squad_leaderboard"),
    ]);
    return res.json({ ok: true, items: states });
  }
  if (!["airdrop_winners", "recruiter_leaderboard", "squad_leaderboard"].includes(resourceType)) {
    return res.status(400).json({ ok: false, error: "Invalid resourceType" });
  }
  const item = await getRewardPublicationState(resourceType as any, resourceKey);
  res.json({ ok: true, item });
}));

app.post("/internal/rewards/publications", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const resourceType = String(req.body?.resourceType || "").trim();
  const resourceKey = String(req.body?.resourceKey || "default").trim() || "default";
  if (!["airdrop_winners", "recruiter_leaderboard", "squad_leaderboard"].includes(resourceType)) {
    return res.status(400).json({ ok: false, error: "Invalid resourceType" });
  }
  const state = await setRewardPublicationState({
    resourceType: resourceType as any,
    resourceKey,
    isPublished: Boolean(req.body?.isPublished),
    changedBy: req.body?.actedBy ?? null,
    reason: req.body?.reason ?? null,
    metadataJson: req.body?.metadataJson ?? null,
  });
  const adminAction = await recordRewardAdminAction({
    actionType: "publication_change",
    resourceType,
    resourceKey,
    actedBy: req.body?.actedBy ?? null,
    reason: req.body?.reason ?? null,
    detailsJson: {
      isPublished: state.isPublished,
      metadataJson: state.metadataJson,
    },
  });
  res.json({ ok: true, state, adminAction });
}));

app.get("/internal/rewards/ops/routing", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const chainId = req.query.chainId != null && String(req.query.chainId).trim() !== "" ? Number(req.query.chainId) : 97;
  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ ok: false, error: "Invalid chainId" });
  }
  const diagnostics = await getRewardRoutingDiagnostics(chainId);
  res.json({ ok: true, diagnostics });
}));

app.get("/internal/rewards/ops/claim-vault", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const posture = await getRewardClaimVaultPosture();
  res.json({ ok: true, posture });
}));

app.get("/internal/rewards/ops/epoch-status", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const items = await listRewardEpochProcessorStatuses(limit);
  res.json({ ok: true, items });
}));

app.get("/internal/rewards/ops/alerts", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const items = await listRewardOpsAlerts();
  res.json({ ok: true, items });
}));

app.get("/internal/rewards/ops/admin-actions", wrap(async (req, res) => {
  if (!requireInternalAuth(req, res)) return;
  const resourceType = req.query.resourceType != null && String(req.query.resourceType).trim() !== "" ? String(req.query.resourceType).trim() : null;
  const actionType = req.query.actionType != null && String(req.query.actionType).trim() !== "" ? String(req.query.actionType).trim() : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const items = await listRewardAdminActions({ resourceType, actionType, limit });
  res.json({ ok: true, items });
}));

app.get("/api/rewards/me", wrap(async (req, res) => {
  const address = String(req.query.address || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }
  const summary = await getWalletRewardSummary(address);
  if (!summary) return res.status(404).json({ error: "Wallet reward summary not found" });
  res.json(toPublicWalletRewardSummary(summary));
}));

app.get("/api/rewards/me/history", wrap(async (req, res) => {
  const address = String(req.query.address || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }
  const items = await listWalletRewardHistory(address, { limit, program: program as any });
  res.json({ items: items.map(toPublicWalletHistoryItem) });
}));

app.get("/api/rewards/me/claims", wrap(async (req, res) => {
  const address = String(req.query.address || "").trim().toLowerCase();
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ error: "Invalid epochId" });
  }
  if (program != null && !(REWARD_PROGRAMS as readonly string[]).includes(program)) {
    return res.status(400).json({ error: "Invalid reward program" });
  }
  const items = await listRewardClaims({ walletAddress: address, epochId, program: program as any, limit });
  const claims = items.map(toPublicRewardClaim);
  res.json({ items: claims, claims });
}));

app.get("/api/rewards/me/eligibility", wrap(async (req, res) => {
  const address = String(req.query.address || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }
  if (program != null && !(ELIGIBILITY_PROGRAMS as readonly string[]).includes(program)) {
    return res.status(400).json({ error: "Invalid eligibility program" });
  }
  const items = await listWalletEligibilityHistory(address, { limit, program: program as any });
  res.json({ items: items.map(toPublicEligibilityItem) });
}));

app.get("/api/airdrops/winners", wrap(async (req, res) => {
  if (!(await requirePublishedResource(res, "airdrop_winners"))) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const program = req.query.program != null && String(req.query.program).trim() !== "" ? String(req.query.program).trim() : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress) : null;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ error: "Invalid epochId" });
  }
  if (program != null && !(AIRDROP_DRAW_PROGRAMS as readonly string[]).includes(program)) {
    return res.status(400).json({ error: "Invalid airdrop program" });
  }
  const items = await listAirdropWinners({ epochId, program: program as any, walletAddress, publishedOnly: true, limit });
  res.json({ items });
}));

app.get("/api/squads", wrap(async (req, res) => {
  if (!(await requirePublishedResource(res, "squad_leaderboard"))) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ error: "Invalid epochId" });
  }
  const preview = await getSquadAllocationPreview(epochId ?? null);
  res.json({
    ok: true,
    epoch: preview.epoch,
    globalPoolAmount: preview.globalPoolAmount,
    carryoverAmount: preview.carryoverAmount,
    squads: preview.leaderboard,
  });
}));

app.get("/api/squads/members", wrap(async (req, res) => {
  if (!(await requirePublishedResource(res, "squad_leaderboard"))) return;
  const epochId = req.query.epochId != null && String(req.query.epochId).trim() !== "" ? Number(req.query.epochId) : null;
  const recruiterCode = req.query.recruiterCode != null && String(req.query.recruiterCode).trim() !== "" ? String(req.query.recruiterCode).trim().toLowerCase() : null;
  const walletAddress = req.query.walletAddress ? String(req.query.walletAddress).trim().toLowerCase() : null;
  const limit = Math.min(Number(req.query.limit || 200), 500);
  if (epochId != null && !Number.isFinite(epochId)) {
    return res.status(400).json({ error: "Invalid epochId" });
  }
  const preview = await getSquadAllocationPreview(epochId ?? null);
  const items = preview.members
    .filter((member) => !recruiterCode || String(member.recruiterCode ?? "").toLowerCase() === recruiterCode)
    .filter((member) => !walletAddress || member.walletAddress === walletAddress)
    .slice(0, limit);
  res.json({ ok: true, epoch: preview.epoch, items });
}));

app.get("/api/recruiters/:code/summary", wrap(async (req, res) => {
  const recruiter = await getRecruiterSummaryByCode(req.params.code);
  if (!recruiter) return res.status(404).json({ error: "Recruiter summary not found" });
  res.json(recruiter);
}));

app.get("/api/recruiters/wallet/:wallet/summary", wrap(async (req, res) => {
  const recruiter = await getRecruiterSummaryByWalletAddress(req.params.wallet);
  if (!recruiter) return res.status(404).json({ error: "Recruiter summary not found" });
  res.json(recruiter);
}));

app.get("/api/recruiters/:code/replacements", wrap(async (req, res) => {
  const recruiter = await getRecruiterSummaryByCode(req.params.code);
  if (!recruiter) return res.status(404).json({ ok: false, error: "Recruiter summary not found" });

  const limit = Math.min(Number(req.query.limit || 5), 20);
  const replacements = (await listRecruiterSummaries({ status: "active", limit: limit + 1 }))
    .filter((item) => item.code.toLowerCase() !== recruiter.code.toLowerCase())
    .slice(0, limit);

  res.json({
    ok: true,
    recruiter: {
      recruiterId: recruiter.recruiterId,
      code: recruiter.code,
      displayName: recruiter.displayName,
      status: recruiter.status,
      closedAt: recruiter.closedAt,
    },
    replacements,
  });
}));

app.get("/api/squads/:recruiterCode/summary", wrap(async (req, res) => {
  if (!(await requirePublishedResource(res, "squad_leaderboard"))) return;
  const squad = await getSquadSummaryByRecruiterCode(req.params.recruiterCode);
  if (!squad) return res.status(404).json({ error: "Squad summary not found" });
  res.json(squad);
}));

// Trades activity (bonding curve buys/sells) for a wallet.
// GET /api/activity/trades?chainId=97&address=0x...&limit=50&cursor=BLOCK:LOG
app.get("/api/activity/trades", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const address = String(req.query.address || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const cursorRaw = String(req.query.cursor || "").trim();

  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ error: "Invalid chainId" });
  }
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  let cursorBlock: number | null = null;
  let cursorLog: number | null = null;
  if (cursorRaw) {
    const parts = cursorRaw.split(":");
    const b = Number(parts[0]);
    const l = Number(parts[1]);
    if (Number.isFinite(b) && Number.isFinite(l)) {
      cursorBlock = b;
      cursorLog = l;
    }
  }

  const params: any[] = [chainId, address];
  let whereCursor = "";
  if (cursorBlock != null && cursorLog != null) {
    params.push(cursorBlock, cursorLog);
    whereCursor = "and (t.block_number < $3 or (t.block_number = $3 and t.log_index < $4))";
  }

  params.push(limit);

  const r = await pool.query(
    `select
       t.tx_hash,
       t.log_index,
       t.block_number,
       t.block_time,
       t.side,
       t.wallet,
       t.token_amount,
       t.bnb_amount,
       t.price_bnb,
       t.campaign_address,
       c.name,
       c.symbol,
       c.logo_uri
     from public.curve_trades t
     left join public.campaigns c
       on c.chain_id = t.chain_id
      and c.campaign_address = t.campaign_address
     where t.chain_id = $1
       and t.wallet = $2
       ${whereCursor}
     order by t.block_number desc, t.log_index desc
     limit $${params.length}`,
    params
  );

  const items = (r.rows || []).map((row: any) => ({
    id: `${row.tx_hash}:${row.log_index}`,
    txHash: row.tx_hash,
    logIndex: Number(row.log_index),
    blockNumber: Number(row.block_number),
    blockTime: row.block_time,
    side: row.side,
    wallet: row.wallet,
    tokenAmount: row.token_amount,
    bnbAmount: row.bnb_amount,
    priceBnb: row.price_bnb,
    campaignAddress: row.campaign_address,
    campaignName: row.name ?? null,
    campaignSymbol: row.symbol ?? null,
    logoUri: row.logo_uri ?? null,
  }));

  const last = items[items.length - 1];
  const nextCursor = last ? `${last.blockNumber}:${last.logIndex}` : null;

  res.json({ items, nextCursor });
}));

// Comments activity for a wallet (authored comments).
// GET /api/activity/comments?chainId=97&address=0x...&limit=50&cursor=TS:ID
app.get("/api/activity/comments", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const address = String(req.query.address || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const cursorRaw = String(req.query.cursor || "").trim();

  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ error: "Invalid chainId" });
  }
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  let cursorTs: Date | null = null;
  let cursorId: number | null = null;
  if (cursorRaw) {
    const parts = cursorRaw.split(":");
    const ts = Number(parts[0]);
    const id = Number(parts[1]);
    if (Number.isFinite(ts) && Number.isFinite(id)) {
      cursorTs = new Date(ts * 1000);
      cursorId = id;
    }
  }

  const params: any[] = [chainId, address];
  let whereCursor = "";
  if (cursorTs && cursorId != null) {
    params.push(cursorTs, cursorId);
    whereCursor = "and (c.created_at < $3 or (c.created_at = $3 and c.id < $4))";
  }

  params.push(limit);

  const r = await pool.query(
    `select
       c.id,
       c.campaign_address,
       c.token_address,
       c.author_address,
       c.body,
       c.parent_id,
       c.created_at,
       camp.name,
       camp.symbol,
       camp.logo_uri
     from public.token_comments c
     left join public.campaigns camp
       on camp.chain_id = c.chain_id
      and camp.campaign_address = c.campaign_address
     where c.chain_id = $1
       and c.author_address = $2
       and c.status = 0
       ${whereCursor}
     order by c.created_at desc, c.id desc
     limit $${params.length}`,
    params
  );

  const items = (r.rows || []).map((row: any) => ({
    id: Number(row.id),
    campaignAddress: row.campaign_address,
    tokenAddress: row.token_address,
    authorAddress: row.author_address,
    body: row.body,
    parentId: row.parent_id,
    createdAt: row.created_at,
    campaignName: row.name ?? null,
    campaignSymbol: row.symbol ?? null,
    logoUri: row.logo_uri ?? null,
  }));

  const last = items[items.length - 1];
  const nextCursor = last
    ? `${Math.floor(new Date(last.createdAt).getTime() / 1000)}:${last.id}`
    : null;

  res.json({ items, nextCursor });
}));

// Created campaigns for a wallet.
// GET /api/activity/created?chainId=97&address=0x...&limit=50&cursor=TS:ADDR
app.get("/api/activity/created", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const address = String(req.query.address || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const cursorRaw = String(req.query.cursor || "").trim();

  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ error: "Invalid chainId" });
  }
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  let cursorTs: Date | null = null;
  let cursorAddr: string | null = null;
  if (cursorRaw) {
    const parts = cursorRaw.split(":");
    const ts = Number(parts[0]);
    const addr = String(parts[1] || "").toLowerCase();
    if (Number.isFinite(ts) && /^0x[a-f0-9]{40}$/.test(addr)) {
      cursorTs = new Date(ts * 1000);
      cursorAddr = addr;
    }
  }

  const params: any[] = [chainId, address];
  let whereCursor = "";
  if (cursorTs && cursorAddr) {
    params.push(cursorTs, cursorAddr);
    whereCursor = `and (
      coalesce(c.created_at_chain, c.created_at) < $3
      or (coalesce(c.created_at_chain, c.created_at) = $3 and c.campaign_address < $4)
    )`;
  }

  params.push(limit);

  const r = await pool.query(
    `select
       c.campaign_address,
       c.token_address,
       c.name,
       c.symbol,
       c.logo_uri,
       c.created_at_chain,
       c.created_at
     from public.campaigns c
     where c.chain_id = $1
       and c.creator_address = $2
       ${whereCursor}
     order by coalesce(c.created_at_chain, c.created_at) desc, c.campaign_address desc
     limit $${params.length}`,
    params
  );

  const items = (r.rows || []).map((row: any) => ({
    campaignAddress: row.campaign_address,
    tokenAddress: row.token_address,
    name: row.name ?? null,
    symbol: row.symbol ?? null,
    logoUri: row.logo_uri ?? null,
    createdAt: row.created_at_chain ?? row.created_at ?? null,
  }));

  const last = items[items.length - 1];
  const lastTs = last?.createdAt ? Math.floor(new Date(last.createdAt).getTime() / 1000) : null;
  const nextCursor = last && lastTs ? `${lastTs}:${last.campaignAddress}` : null;

  res.json({ items, nextCursor });
}));

// Interactions (Upvotes) for a wallet.
// GET /api/activity/interactions?chainId=97&address=0x...&limit=50&cursor=BLOCK:LOG
app.get("/api/activity/interactions", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const address = String(req.query.address || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const cursorRaw = String(req.query.cursor || "").trim();

  if (!Number.isFinite(chainId)) {
    return res.status(400).json({ error: "Invalid chainId" });
  }
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  let cursorBlock: number | null = null;
  let cursorLog: number | null = null;
  if (cursorRaw) {
    const parts = cursorRaw.split(":");
    const b = Number(parts[0]);
    const l = Number(parts[1]);
    if (Number.isFinite(b) && Number.isFinite(l)) {
      cursorBlock = b;
      cursorLog = l;
    }
  }

  const params: any[] = [chainId, address];
  let whereCursor = "";
  if (cursorBlock != null && cursorLog != null) {
    params.push(cursorBlock, cursorLog);
    whereCursor = "and (v.block_number < $3 or (v.block_number = $3 and v.log_index < $4))";
  }

  params.push(limit);

  const r = await pool.query(
    `select
       v.tx_hash,
       v.log_index,
       v.block_number,
       v.block_timestamp,
       v.campaign_address,
       v.voter_address,
       v.asset_address,
       v.amount_raw,
       v.meta,
       c.name,
       c.symbol,
       c.logo_uri
     from public.votes v
     left join public.campaigns c
       on c.chain_id = v.chain_id
      and c.campaign_address = v.campaign_address
     where v.chain_id = $1
       and v.voter_address = $2
       and v.status = 'confirmed'
       ${whereCursor}
     order by v.block_number desc, v.log_index desc
     limit $${params.length}`,
    params
  );

  const items = (r.rows || []).map((row: any) => ({
    id: `${row.tx_hash}:${row.log_index}`,
    txHash: row.tx_hash,
    logIndex: Number(row.log_index),
    blockNumber: Number(row.block_number),
    blockTime: row.block_timestamp,
    campaignAddress: row.campaign_address,
    voterAddress: row.voter_address,
    assetAddress: row.asset_address,
    amountRaw: row.amount_raw,
    meta: row.meta,
    campaignName: row.name ?? null,
    campaignSymbol: row.symbol ?? null,
    logoUri: row.logo_uri ?? null,
    type: "upvote",
  }));

  const last = items[items.length - 1];
  const nextCursor = last ? `${last.blockNumber}:${last.logIndex}` : null;

  res.json({ items, nextCursor });
}));

/**
 * Snapshot endpoints for TokenDetails
 */
app.get("/api/token/:campaign/summary", wrap(async (req, res) => {
  const campaign = String(req.params.campaign || "").toLowerCase();
  const chainId = Number(req.query.chainId || 97);

  const r = await pool.query(
    `select * from public.token_stats where chain_id=$1 and campaign_address=$2`,
    [chainId, campaign]
  );
  res.json(r.rows[0] || null);
}));

app.get("/api/token/:campaign/trades", wrap(async (req, res) => {
  const campaign = String(req.params.campaign || "").toLowerCase();
  const chainId = Number(req.query.chainId || 97);
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const r = await pool.query(
    `select
       tx_hash, log_index, block_number, block_time,
       side, wallet, token_amount, bnb_amount, price_bnb
     from public.curve_trades
     where chain_id=$1 and campaign_address=$2
     order by block_number desc, log_index desc
     limit $3`,
    [chainId, campaign, limit]
  );

  res.json(r.rows);
}));


// ---------------------------------------------
// UP Only League (objective leaderboards)
// ---------------------------------------------
// /api/league?chainId=97&category=straight_up|fastest_graduation|largest_buy&period=weekly|monthly|all_time&limit=50
app.get("/api/league", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const category = String(req.query.category || "fastest_graduation");
  const period = String(req.query.period || "weekly");
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const periodFilterCampaign =
    period === "monthly"
      ? "c.graduated_at_chain >= date_trunc('month', now()) and c.graduated_at_chain < date_trunc('month', now()) + interval '1 month'"
      : period === "weekly"
      ? "c.graduated_at_chain >= date_trunc('week', now()) and c.graduated_at_chain < date_trunc('week', now()) + interval '1 week'"
      : "true";

  const periodFilterTrades =
    period === "monthly"
      ? "t.block_time >= date_trunc('month', now()) and t.block_time < date_trunc('month', now()) + interval '1 month'"
      : period === "weekly"
      ? "t.block_time >= date_trunc('week', now()) and t.block_time < date_trunc('week', now()) + interval '1 week'"
      : "true";

  if (category === "largest_buy") {
    // Largest single buy tx during bonding (measured in BNB, excludes creator/feeRecipient/campaign)
    const r = await pool.query(
      `select
         t.campaign_address,
         c.name,
         c.symbol,
         c.logo_uri,
         c.creator_address,
         c.fee_recipient_address,
         t.wallet as buyer_address,
         t.bnb_amount_raw as bnb_amount_raw,
         t.tx_hash,
         t.log_index,
         t.block_number,
         t.block_time
       from public.curve_trades t
       join public.campaigns c
         on c.chain_id=t.chain_id and c.campaign_address=t.campaign_address
       where t.chain_id=$1
         and t.side='buy'
         and ${periodFilterTrades}
         and lower(t.wallet) <> lower(c.creator_address)
         and (c.fee_recipient_address is null or lower(t.wallet) <> lower(c.fee_recipient_address))
         and lower(t.wallet) <> lower(c.campaign_address)
       order by (t.bnb_amount_raw::numeric) desc, t.block_number desc, t.log_index desc
       limit $2`,
      [chainId, limit]
    );

    return res.json({ chainId, category, period, items: r.rows });
  }

  const requireUniqueBuyers = category === "fastest_graduation";
  const extra: string[] = [];
  if (requireUniqueBuyers) extra.push("coalesce(s.unique_buyers,0) >= 25");
  if (category === "straight_up") extra.push("coalesce(s.sells_count,0) = 0");
  const extraWhere = extra.length ? `and ${extra.join(" and ")}` : "";

  const r = await pool.query(
    `with stats as (
       select
         t.chain_id,
         t.campaign_address,
         count(distinct case when t.side='buy' then t.wallet end) as unique_buyers,
         sum(case when t.side='sell' then 1 else 0 end) as sells_count,
         sum(case when t.side='buy' then (t.bnb_amount_raw::numeric) else 0 end) as buy_volume_raw
       from public.curve_trades t
       where t.chain_id=$1
       group by t.chain_id, t.campaign_address
     )
     select
       c.campaign_address,
       c.creator_address,
       c.fee_recipient_address,
       c.token_address,
       c.name,
       c.symbol,
       c.logo_uri,
       c.created_at_chain,
       c.graduated_at_chain,
       c.graduated_block,
       coalesce(s.unique_buyers,0)::int as unique_buyers,
       coalesce(s.sells_count,0)::int as sells_count,
       coalesce(s.buy_volume_raw,0)::text as buy_volume_raw,
       extract(epoch from (c.graduated_at_chain - c.created_at_chain))::bigint as duration_seconds
     from public.campaigns c
     left join stats s
       on s.chain_id=c.chain_id and s.campaign_address=c.campaign_address
     where c.chain_id=$1
       and c.created_at_chain is not null
       and c.graduated_at_chain is not null
       and ${periodFilterCampaign}
       ${extraWhere}
     order by duration_seconds asc nulls last, c.graduated_at_chain asc
     limit $2`,
    [chainId, limit]
  );

  return res.json({ chainId, category, period, items: r.rows });
}));

app.get("/api/token/:campaign/candles", wrap(async (req, res) => {
  const campaign = String(req.params.campaign || "").toLowerCase();
  const chainId = Number(req.query.chainId || 97);
  const tf = String(req.query.tf || "5s");
  const limit = Math.min(Number(req.query.limit || 200), 2000);

  const r = await pool.query(
    `select bucket_start, o,h,l,c,volume_bnb,trades_count
     from public.token_candles
     where chain_id=$1 and campaign_address=$2 and timeframe=$3
     order by bucket_start desc
     limit $4`,
    [chainId, campaign, tf, limit]
  );

  res.json(r.rows.reverse());
}));

// ---------------------------------------------
// Votes + Featured
// ---------------------------------------------

// /api/votes?chainId=97&campaignAddress=0x..&voter=0x..&limit=50
app.get("/api/votes", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const campaign = String(req.query.campaignAddress || "").toLowerCase();
  const voter = String(req.query.voter || "").toLowerCase();
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const where: string[] = ["chain_id=$1", "status='confirmed'"];
  const params: any[] = [chainId];
  let p = 2;

  if (campaign) {
    where.push(`campaign_address=$${p++}`);
    params.push(campaign);
  }
  if (voter) {
    where.push(`voter_address=$${p++}`);
    params.push(voter);
  }

  const r = await pool.query(
    `select
       chain_id,campaign_address,voter_address,asset_address,amount_raw,
       tx_hash,log_index,block_number,block_timestamp,meta
     from public.votes
     where ${where.join(" and ")}
     order by block_number desc, log_index desc
     limit $${p}`,
    [...params, limit]
  );

  res.json(r.rows);
}));

// /api/featured?chainId=97&sort=trending|24h|7d|all&limit=50
app.get("/api/featured", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const sort = String(req.query.sort || "trending");
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const orderBy =
    sort === "24h" ? "votes_24h desc" :
    sort === "7d" ? "votes_7d desc" :
    sort === "all" ? "votes_all_time desc" :
    "trending_score desc";

  const r = await pool.query(
    `select
       chain_id,campaign_address,
       votes_1h,votes_24h,votes_7d,votes_all_time,
       trending_score,last_vote_at,updated_at
     from public.vote_aggregates
     where chain_id=$1
     order by ${orderBy}, campaign_address asc
     limit $2`,
    [chainId, limit]
  );

  res.json(r.rows);
}));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API error:", err);
  res.status(500).json({ ok: false, error: err?.message || String(err) });
});
// Start server (Railway requires 0.0.0.0:PORT) :contentReference[oaicite:1]{index=1}
app.listen(ENV.PORT, "0.0.0.0", () => {
  console.log(`realtime-indexer listening on 0.0.0.0:${ENV.PORT}`);
});

// ---------------------------------------------------------------------------
// Telemetry snapshot (optional)
// ---------------------------------------------------------------------------
let lastIndexerRunAt = 0;
let lastIndexerErrorAt = 0;
let lastIndexerErrorMsg: string | null = null;

async function getLastIndexedBlock(chainId: number): Promise<number | null> {
  try {
    const r = await pool.query(
      `select cursor,last_indexed_block from public.indexer_state where chain_id=$1 and cursor in ('factory','votes')`,
      [chainId]
    );
    if (!r.rowCount) return null;
    // Conservative: take min of known cursors so lag isn't understated
    const vals = r.rows.map((x: any) => Number(x.last_indexed_block)).filter((n: any) => Number.isFinite(n));
    if (!vals.length) return null;
    return Math.min(...vals);
  } catch {
    return null;
  }
}

async function getRpcHeadBlock(): Promise<number | null> {
  const first = String(ENV.BSC_RPC_HTTP_97 || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)[0];
  if (!first) return null;
  try {
    const body = { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] };
    const resp = await fetch(first, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const j: any = await resp.json();
    const hex = j?.result;
    if (typeof hex !== "string" || !hex.startsWith("0x")) return null;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

startTelemetryReporter(async () => {
  const ts = Math.floor(Date.now() / 1000);
  const head = await getRpcHeadBlock();
  const last = await getLastIndexedBlock(97);
  const lag = head != null && last != null ? Math.max(0, head - last) : null;

  const snap: TelemetrySnapshot = {
    service: "realtime-indexer",
    ts,
    ok: true,
    rps_1m: reqCount1m / 60,
    errors_1m: errCount1m,
    head_block: head ?? undefined,
    last_indexed_block: last ?? undefined,
    lag_blocks: lag ?? undefined,
    last_indexer_run_ms_ago: lastIndexerRunAt ? Date.now() - lastIndexerRunAt : undefined,
    last_indexer_error_ms_ago: lastIndexerErrorAt ? Date.now() - lastIndexerErrorAt : undefined,
  };

  // If we have a recent error, mark ok=false but keep reporting.
  if (lastIndexerErrorAt && Date.now() - lastIndexerErrorAt < 5 * 60_000) {
    snap.ok = false;
  }

  return snap;
});

// Indexer loop
// NOTE: Keep this conservative for public RPCs. We also avoid overlap.
let running = false;
const INTERVAL_MS = ENV.INDEXER_INTERVAL_MS;

setInterval(async () => {
  if (running) return;
  running = true;
  try {
    lastIndexerRunAt = Date.now();
    await runIndexerOnce();
  } catch (e) {
    console.error("indexer loop error", e);
    lastIndexerErrorAt = Date.now();
    lastIndexerErrorMsg = String((e as any)?.message || e);
  } finally {
    running = false;
  }
}, INTERVAL_MS);
