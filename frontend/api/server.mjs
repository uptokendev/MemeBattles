import express from "express";

import { pool } from "../server/db.js";
import { createRailwayProxyMiddleware } from "../server/railwayProxy.js";

import activityTrades from "./activity/trades.js";
import ablyToken from "./ably/token.js";
import authNonce from "./auth/nonce.js";
import campaignsUpsert from "./campaigns/upsert.js";
import campaigns from "./campaigns.js";
import comments from "./comments.js";
import chatHistory from "./chat/history.js";
import chatJoin from "./chat/join.js";
import chatRealtimeToken from "./chat/realtime-token.js";
import chatSend from "./chat/send.js";
import diagnostics from "./diagnostics.js";
import epochPools from "./epochPools.js";
import featured from "./featured.js";
import followsCampaignList from "./follows/campaign-list.js";
import followsCampaign from "./follows/campaign.js";
import followsUserCounts from "./follows/user-counts.js";
import followsUserList from "./follows/user-list.js";
import followsUser from "./follows/user.js";
import league from "./league.js";
import leaguePayouts from "./leaguePayouts.js";
import leagueRoot from "./leagueRoot.js";
import profile from "./profile.js";
import profileCabinet from "./profileCabinet.js";
import profilePortfolio from "./profile/portfolio.js";
import rewards from "./rewards.js";
import shareCard from "./shareCard.js";
import prepareShareCard from "./prepare-share-card.js";
import status from "./status.js";
import tokenMetadata from "./token-metadata.js";
import upload from "./upload.js";
import votes from "./votes.js";
import voteCounts from "./vote_counts.js";
import warMissionsProxy from "./war-missions/proxy.js";
import { contentAiGenerateVariants } from "./content-ai.js";
import {
  contentPlannerCalendar,
  contentPlannerCampaignById,
  contentPlannerCampaigns,
  contentPlannerPostById,
  contentPlannerPostVariants,
  contentPlannerPosts,
  contentPlannerSchedulesById,
  contentPlannerTags,
  contentPlannerVariantById,
  contentPlannerVariantSchedule,
} from "./content-planner.js";
import { draftDeploy } from "./dev-fix/draft-deploy.js";
import {
  followedDrafts,
  signedDraftComments,
  signedDraftFollow,
  signedDraftNotificationSubscription,
} from "./dev-fix/draft-engagement.js";
import { prepareNotifications } from "./dev-fix/prepare-notifications.js";
import { signedDraftById, signedPrepareBySlug } from "./dev-fix/draft-read.js";
import { tickerAvailability } from "./dev-fix/ticker-availability.js";
import { draftArchive, draftPromotion, drafts } from "./dev-fix/drafts.js";
import {
  attributionWallet,
  attributionWalletConnect,
  recruiterReferralCapture,
  recruiterSignupCodeAvailability,
  recruiterSignupNonce,
  recruiterSignupStatus,
  recruiterSignupSubmit,
  recruiterSummary,
  recruiterWalletSummary,
  recruiters,
} from "./dev-fix/attribution.js";
import {
  recruiterAuthNonce,
  recruiterAuthVerify,
  recruiterLogout,
  recruiterPortal,
} from "./dev-fix/recruiter-portal.js";
import { routingCreateAuthorization, routingStatus, routingTradeAuthorization } from "./dev-fix/route-auth.js";
import {
  airdropWinners,
  internalAirdropDrawRun,
  internalAirdropDraws,
  internalRewardAdminActions,
  internalRewardAlerts,
  internalRewardClaimVault,
  internalRewardEpochStatus,
  internalRewardPublications,
  internalRewardRouting,
  recruiterReplacements,
  rewardsClaims,
  rewardsEligibility,
  rewardsHistory,
  rewardsMe,
  squadMembers,
  squadSummary,
  squadsLeaderboard,
} from "./dev-fix/stubs.js";

const app = express();
app.disable("x-powered-by");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:8888",
  "https://memewar.zone",
  "https://www.memewar.zone",
  "https://memewarzone.netlify.app",
  "https://command-center.memewar.zone",
];

const allowedOrigins = new Set(
  DEFAULT_ALLOWED_ORIGINS.concat(
    String(process.env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  )
);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    const host = hostname.toLowerCase();
    if (host === "memewar.zone" || host === "www.memewar.zone" || host.endsWith(".memewar.zone")) return true;
    if (host.endsWith(".netlify.app")) return true;
  } catch {}
  return false;
}

app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-diagnostics-token, x-rank-events-token");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/", (_req, res) => res.json({ ok: true, service: "MemeWarzone API", healthz: "/healthz", api: "/api" }));
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("select 1 as ok");
    res.json({ ok: true, db: r.rows?.[0]?.ok ?? 1 });
  } catch (err) {
    console.error("[api/server] health failed", err);
    res.status(500).json({ ok: false, error: "DB health check failed" });
  }
});

app.use(express.json({ limit: process.env.API_JSON_LIMIT || "2mb" }));
app.use(express.urlencoded({ extended: false, limit: process.env.API_FORM_LIMIT || "2mb" }));
app.use(createRailwayProxyMiddleware({ serviceName: "local-api-gateway" }));

function wrap(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
}

const router = express.Router();

router.all("/activity/trades", wrap(activityTrades));
router.all("/ably/token", wrap(ablyToken));
router.all("/auth/nonce", wrap(authNonce));
router.all("/campaigns/upsert", wrap(campaignsUpsert));
router.all("/campaigns", wrap(campaigns));
router.all("/comments", wrap(comments));
router.all("/chat/history", wrap(chatHistory));
router.all("/chat/join", wrap(chatJoin));
router.all("/chat/realtime-token", wrap(chatRealtimeToken));
router.all("/chat/send", wrap(chatSend));
router.all("/diagnostics", wrap(diagnostics));
router.all("/epochPools", wrap(epochPools));
router.all("/featured", wrap(featured));
router.all("/follows/campaign-list", wrap(followsCampaignList));
router.all("/follows/campaign", wrap(followsCampaign));
router.all("/follows/user-counts", wrap(followsUserCounts));
router.all("/follows/user-list", wrap(followsUserList));
router.all("/follows/user", wrap(followsUser));
router.all("/league", wrap(league));
router.all("/leaguePayouts", wrap(leaguePayouts));
router.all("/leagueRoot", wrap(leagueRoot));
router.all("/profile", wrap(profile));
router.all("/profileCabinet", wrap(profileCabinet));
router.all("/profile/portfolio", wrap(profilePortfolio));
router.all("/shareCard", wrap(shareCard));
router.all("/prepare-share-card", wrap(prepareShareCard));
router.all("/status", wrap(status));
router.all("/token-metadata/:chainId/:address", wrap(tokenMetadata));
router.all("/token-metadata", wrap(tokenMetadata));
router.all("/upload", wrap(upload));
router.all("/votes", wrap(votes));
router.all("/vote_counts", wrap(voteCounts));
router.all("/content-ai/generate-variants", wrap(contentAiGenerateVariants));
router.all("/posts", wrap(contentPlannerPosts));
router.all("/posts/:id/variants", wrap(contentPlannerPostVariants));
router.all("/posts/:id", wrap(contentPlannerPostById));
router.all("/variants/:variantId/schedule", wrap(contentPlannerVariantSchedule));
router.all("/variants/:id", wrap(contentPlannerVariantById));
router.all("/calendar", wrap(contentPlannerCalendar));
router.all("/schedules/:id", wrap(contentPlannerSchedulesById));
router.all("/content-campaigns/:id", wrap(contentPlannerCampaignById));
router.all("/content-campaigns", wrap(contentPlannerCampaigns));
router.all("/content-tags", wrap(contentPlannerTags));
router.all("/drafts", wrap(drafts));
router.all("/drafts/followed", wrap(followedDrafts));
router.all("/drafts/ticker-availability", wrap(tickerAvailability));
router.all("/drafts/:draftId/promotion", wrap(draftPromotion));
router.all("/drafts/:draftId/archive", wrap(draftArchive));
router.all("/drafts/:draftId/deploy", wrap(draftDeploy));
router.all("/drafts/:draftId/follow", wrap(signedDraftFollow));
router.all("/drafts/:draftId/notifications", wrap(signedDraftNotificationSubscription));
router.all("/drafts/:draftId/comments", wrap(signedDraftComments));
router.all("/drafts/:draftId", wrap(signedDraftById));
router.all("/prepare/:slug", wrap(signedPrepareBySlug));
router.all("/prepare-notifications", wrap(prepareNotifications));
router.all("/rewards/me", wrap(rewardsMe));
router.all("/rewards/me/history", wrap(rewardsHistory));
router.all("/rewards/me/claims", wrap(rewardsClaims));
router.all("/rewards/me/eligibility", wrap(rewardsEligibility));
router.all("/rewards", wrap(rewards));
router.all("/airdrops/winners", wrap(airdropWinners));
router.all("/squads", wrap(squadsLeaderboard));
router.all("/squads/members", wrap(squadMembers));
router.all("/squads/:code/summary", wrap(squadSummary));
router.all("/recruiters", wrap(recruiters));
router.all("/recruiters/wallet/:wallet/summary", wrap(recruiterWalletSummary));
router.all("/recruiters/:code/summary", wrap(recruiterSummary));
router.all("/recruiters/:code/replacements", wrap(recruiterReplacements));
router.all("/recruiters/:code/referral/capture", wrap(recruiterReferralCapture));
router.all("/attribution/wallet-connect", wrap(attributionWalletConnect));
router.all("/attribution/wallet/:wallet", wrap(attributionWallet));
router.all("/routing/status", wrap(routingStatus));
router.all("/routing/create-authorization", wrap(routingCreateAuthorization));
router.all("/routing/trade-authorization", wrap(routingTradeAuthorization));
router.all("/recruiter-routing/status", wrap(routingStatus));
router.all("/recruiter-routing/create-authorization", wrap(routingCreateAuthorization));
router.all("/recruiter-routing/trade-authorization", wrap(routingTradeAuthorization));
router.all("/recruiter-auth-nonce", wrap(recruiterAuthNonce));
router.all("/recruiter-auth-verify", wrap(recruiterAuthVerify));
router.all("/recruiter-portal", wrap(recruiterPortal));
router.all("/recruiter-logout", wrap(recruiterLogout));
router.all("/recruiter-signup/status", wrap(recruiterSignupStatus));
router.all("/recruiter-signup/code-availability", wrap(recruiterSignupCodeAvailability));
router.all("/recruiter-signup/nonce", wrap(recruiterSignupNonce));
router.all("/recruiter-signup", wrap(recruiterSignupSubmit));
router.all("/wm-auth-nonce", wrap(warMissionsProxy));
router.all("/wm-auth-verify", wrap(warMissionsProxy));
router.all("/wm-profile", wrap(warMissionsProxy));
router.all("/wm-quests-list", wrap(warMissionsProxy));
router.all("/wm-quests-submit", wrap(warMissionsProxy));
router.all("/wm-social-status", wrap(warMissionsProxy));
router.all("/wm-social-link", wrap(warMissionsProxy));
router.all("/wm-x-oauth-start", wrap(warMissionsProxy));
router.all("/wm-x-oauth-callback", wrap(warMissionsProxy));
router.all("/social-x-callback", wrap(warMissionsProxy));
router.all("/wm-quiz-get", wrap(warMissionsProxy));
router.all("/wm-quiz-submit", wrap(warMissionsProxy));
router.all("/wm-referral-track", wrap(warMissionsProxy));
router.all("/wm-leaderboard-current", wrap(warMissionsProxy));
router.all("/wm-prizes-public", wrap(warMissionsProxy));
router.all("/wm-badges-list", wrap(warMissionsProxy));
router.all("/wm-admin-badge-award", wrap(warMissionsProxy));
router.all("/wm-admin-review-completion", wrap(warMissionsProxy));
router.all("/wm-admin-social-recheck", wrap(warMissionsProxy));
router.all("/wm-admin-notifications-list", wrap(warMissionsProxy));
router.all("/wm-admin-recruiter-review", wrap(warMissionsProxy));
router.all("/wm-admin-user-action", wrap(warMissionsProxy));
router.all("/wm-admin-quest-upsert", wrap(warMissionsProxy));
router.all("/wm-admin-leaderboard-snapshot", wrap(warMissionsProxy));
router.all("/wm-admin-prizes", wrap(warMissionsProxy));
router.all("/wm-daily-rollover", wrap(warMissionsProxy));
router.all("/internal/rewards/publications", wrap(internalRewardPublications));
router.all("/internal/rewards/ops/routing", wrap(internalRewardRouting));
router.all("/internal/rewards/ops/claim-vault", wrap(internalRewardClaimVault));
router.all("/internal/rewards/ops/epoch-status", wrap(internalRewardEpochStatus));
router.all("/internal/rewards/ops/alerts", wrap(internalRewardAlerts));
router.all("/internal/rewards/ops/admin-actions", wrap(internalRewardAdminActions));
router.all("/internal/rewards/airdrops/draws", wrap(internalAirdropDraws));
router.all("/internal/rewards/airdrops/epochs/:epochId/draws/run", wrap(internalAirdropDrawRun));

app.use("/api", router);
app.use((req, res) => res.status(404).json({ error: `Unknown route: ${req.path}` }));
app.use((err, _req, res, _next) => {
  console.error("[api/server] unhandled", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Server error" });
});

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
app.listen(port, "0.0.0.0", () => console.log(`[api/server] listening on 0.0.0.0:${port}`));
