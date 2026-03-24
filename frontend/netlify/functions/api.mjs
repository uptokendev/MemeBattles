import express from "express";
import serverless from "serverless-http";

import ablyToken from "../../api/ably/token.js";
import authNonce from "../../api/auth/nonce.js";
import campaigns from "../../api/campaigns.js";
import campaignsUpsert from "../../api/campaigns/upsert.js";
import comments from "../../api/comments.js";
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
import rewards from "../../api/rewards.js";
import status from "../../api/status.js";
import upload from "../../api/upload.js";
import voteCounts from "../../api/vote_counts.js";
import votes from "../../api/votes.js";

const app = express();
app.disable("x-powered-by");

// IMPORTANT:
// - Do NOT add express.json() globally.
// - Your existing handlers already parse JSON themselves.
// - /api/upload uses formidable and needs the raw request stream.
const router = express.Router();

router.all("/ably/token", ablyToken);
router.all("/auth/nonce", authNonce);
router.all("/campaigns/upsert", campaignsUpsert);
router.all("/campaigns", campaigns);
router.all("/comments", comments);
router.all("/diagnostics", diagnostics);
router.all("/epochPools", epochPools);
router.all("/featured", featured);
router.all("/follows/campaign-list", followsCampaignList);
router.all("/follows/campaign", followsCampaign);
router.all("/follows/user-counts", followsUserCounts);
router.all("/follows/user-list", followsUserList);
router.all("/follows/user", followsUser);
router.all("/league", league);
router.all("/leaguePayouts", leaguePayouts);
router.all("/leagueRoot", leagueRoot);
router.all("/profile", profile);
router.all("/rewards", rewards);
router.all("/status", status);
router.all("/upload", upload);
router.all("/vote_counts", voteCounts);
router.all("/votes", votes);

// Netlify Functions commonly invoke this handler with the function mount already
// stripped from the path, so requests arrive as "/campaigns", "/featured", etc.
// Mount at root for local Netlify Dev, and also keep "/api" for compatibility.
app.use(router);
app.use("/api", router);

export const handler = serverless(app);