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

const app = express();
app.disable("x-powered-by");

// CORS: allow the MW admin dashboard (and local dev) to call /api/*.
// Tokenized endpoints (e.g. /api/diagnostics) gate access; CORS just
// relaxes the browser same-origin check.
const ALLOWED_ORIGINS = new Set([
  "https://command-center.memewar.zone",
  "http://localhost:5173",
  "http://localhost:8888",
]);

app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, x-diagnostics-token"
    );
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

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

app.use((req, res) => {
  res.status(404).json({ error: `Unknown API route: ${req.path}` });
});

app.use((err, _req, res, _next) => {
  console.error("[netlify/functions/api] unhandled", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Server error" });
});

export const handler = serverless(app);
