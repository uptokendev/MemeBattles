import express from "express";
import serverless from "serverless-http";

import ablyToken from "../../api/ably/token.js";
import authNonce from "../../api/auth/nonce.js";
import campaignsUpsert from "../../api/campaigns/upsert.js";
import campaigns from "../../api/campaigns.js";
import comments from "../../api/comments.js";
import chatHistory from "../../api/chat/history.js";
import chatJoin from "../../api/chat/join.js";
import chatRealtimeToken from "../../api/chat/realtime-token.js";
import chatSend from "../../api/chat/send.js";
import diagnostics from "../../api/diagnostics.js";
import epochPools from "../../api/epochPools.js";
import featured from "../../api/featured.js";
import followsCampaignList from "../../api/follows/campaign-list.js";
import followsCampaign from "../../api/follows/campaign.js";
import followsUserCounts from "../../api/follows/user-counts.js";
import followsUserList from "../../api/follows/user-list.js";
import followsUser from "../../api/follows/user.js";
import league from "../../api/league.js";
import leaguePayouts from "../../api/leaguePayouts.js";
import leagueRoot from "../../api/leagueRoot.js";
import profile from "../../api/profile.js";
import profileCabinet from "../../api/profileCabinet.js";
import rewards from "../../api/rewards.js";
import shareCard from "../../api/shareCard.js";
import status from "../../api/status.js";
import upload from "../../api/upload.js";
import votes from "../../api/votes.js";
import voteCounts from "../../api/vote_counts.js";
import {
  attributionWallet,
  attributionWalletConnect,
  recruiterReferralCapture,
  recruiterSummary,
  recruiterWalletSummary,
  recruiters,
} from "../../api/dev-fix/attribution.js";
import { routingCreateAuthorization, routingStatus, routingTradeAuthorization } from "../../api/dev-fix/route-auth.js";
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
  recruiterSignupCodeAvailability,
  recruiterSignupNonce,
  recruiterSignupStatus,
  recruiterSignupSubmit,
  rewardsClaims,
  rewardsEligibility,
  rewardsHistory,
  rewardsMe,
  squadMembers,
  squadSummary,
  squadsLeaderboard,
} from "../../api/dev-fix/stubs.js";

const app = express();
app.disable("x-powered-by");

app.use((req, _res, next) => {
  const url = String(req.url || "");
  req.url =
    url.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "")
      .replace(/^\/api(?=\/|$)/, "") || "/";
  next();
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

function wrap(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
}

app.all("/ably/token", wrap(ablyToken));
app.all("/auth/nonce", wrap(authNonce));
app.all("/campaigns/upsert", wrap(campaignsUpsert));
app.all("/campaigns", wrap(campaigns));
app.all("/comments", wrap(comments));
app.all("/chat/history", wrap(chatHistory));
app.all("/chat/join", wrap(chatJoin));
app.all("/chat/realtime-token", wrap(chatRealtimeToken));
app.all("/chat/send", wrap(chatSend));
app.all("/diagnostics", wrap(diagnostics));
app.all("/epochPools", wrap(epochPools));
app.all("/featured", wrap(featured));
app.all("/follows/campaign-list", wrap(followsCampaignList));
app.all("/follows/campaign", wrap(followsCampaign));
app.all("/follows/user-counts", wrap(followsUserCounts));
app.all("/follows/user-list", wrap(followsUserList));
app.all("/follows/user", wrap(followsUser));
app.all("/league", wrap(league));
app.all("/leaguePayouts", wrap(leaguePayouts));
app.all("/leagueRoot", wrap(leagueRoot));
app.all("/profile", wrap(profile));
app.all("/profileCabinet", wrap(profileCabinet));
app.all("/rewards", wrap(rewards));
app.all("/shareCard", wrap(shareCard));
app.all("/status", wrap(status));
app.all("/upload", wrap(upload));
app.all("/votes", wrap(votes));
app.all("/vote_counts", wrap(voteCounts));

// DEV-FIX-API Phase 1: route alignment stubs.
// These routes intentionally return JSON-safe empty states until the real
// reward/squad persistence is implemented.
app.all("/rewards/me", wrap(rewardsMe));
app.all("/rewards/me/history", wrap(rewardsHistory));
app.all("/rewards/me/claims", wrap(rewardsClaims));
app.all("/rewards/me/eligibility", wrap(rewardsEligibility));

app.all("/airdrops/winners", wrap(airdropWinners));

app.all("/squads", wrap(squadsLeaderboard));
app.all("/squads/members", wrap(squadMembers));
app.all("/squads/:code/summary", wrap(squadSummary));

// DEV-FIX-API Phase 4: DB-backed recruiter and attribution routes.
app.all("/recruiters", wrap(recruiters));
app.all("/recruiters/wallet/:wallet/summary", wrap(recruiterWalletSummary));
app.all("/recruiters/:code/summary", wrap(recruiterSummary));
app.all("/recruiters/:code/replacements", wrap(recruiterReplacements));
app.all("/recruiters/:code/referral/capture", wrap(recruiterReferralCapture));

app.all("/attribution/wallet-connect", wrap(attributionWalletConnect));
app.all("/attribution/wallet/:wallet", wrap(attributionWallet));

// DEV-FIX-API Phase 2/3: route-auth signature responses and status checks.
app.all("/routing/status", wrap(routingStatus));
app.all("/routing/create-authorization", wrap(routingCreateAuthorization));
app.all("/routing/trade-authorization", wrap(routingTradeAuthorization));
// Temporary backwards-compatible aliases for current frontend clients.
app.all("/recruiter-routing/status", wrap(routingStatus));
app.all("/recruiter-routing/create-authorization", wrap(routingCreateAuthorization));
app.all("/recruiter-routing/trade-authorization", wrap(routingTradeAuthorization));

app.all("/recruiter-signup/status", wrap(recruiterSignupStatus));
app.all("/recruiter-signup/code-availability", wrap(recruiterSignupCodeAvailability));
app.all("/recruiter-signup/nonce", wrap(recruiterSignupNonce));
app.all("/recruiter-signup", wrap(recruiterSignupSubmit));

// Preferred API namespace for internal reward ops.
app.all("/internal/rewards/publications", wrap(internalRewardPublications));
app.all("/internal/rewards/ops/routing", wrap(internalRewardRouting));
app.all("/internal/rewards/ops/claim-vault", wrap(internalRewardClaimVault));
app.all("/internal/rewards/ops/epoch-status", wrap(internalRewardEpochStatus));
app.all("/internal/rewards/ops/alerts", wrap(internalRewardAlerts));
app.all("/internal/rewards/ops/admin-actions", wrap(internalRewardAdminActions));
app.all("/internal/rewards/airdrops/draws", wrap(internalAirdropDraws));
app.all("/internal/rewards/airdrops/epochs/:epochId/draws/run", wrap(internalAirdropDrawRun));

app.use((req, res) => {
  res.status(404).json({ error: `Unknown API route: ${req.path}` });
});

app.use((err, _req, res, _next) => {
  console.error("[netlify/functions/api] unhandled", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Server error" });
});

export const handler = serverless(app);
