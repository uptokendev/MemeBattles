import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "../api/server.mjs");
const server = fs.readFileSync(serverPath, "utf8");

const protectedRoutes = [
  ["/wm-x-oauth-start", "wmXOAuthStart"],
  ["/wm-x-oauth-callback", "wmXOAuthCallback"],
  ["/social-x-callback", "wmXOAuthCallback"],
  ["/wm-quiz-get", "wmQuizLoad"],
  ["/wm-quiz-load", "wmQuizLoad"],
  ["/wm-quiz-submit", "wmQuizSubmit"],
  ["/wm-referral-track", "wmReferralTrack"],
  ["/wm-referral-stats", "wmReferralStats"],
  ["/wm-admin-badge-award", "wmAdminBadgeAward"],
  ["/wm-admin-notifications-list", "wmAdminNotificationsList"],
  ["/wm-admin-recruiter-review", "wmAdminRecruiterReview"],
  ["/wm-admin-user-action", "wmAdminUserAction"],
  ["/wm-admin-quest-upsert", "wmAdminQuestUpsert"],
  ["/wm-admin-leaderboard-snapshot", "wmAdminLeaderboardSnapshot"],
  ["/wm-admin-prizes", "wmAdminPrizes"],
  ["/wm-daily-rollover", "wmDailyRollover"],
];

const gatewayMode =
  server.includes("devpostgrad API gateway") &&
  server.includes("createRailwayProxyMiddleware") &&
  server.includes("devpostgrad does not host the live API");

if (gatewayMode) {
  const forbiddenConcreteImports = protectedRoutes.filter(([, handler]) => server.includes(handler));
  if (forbiddenConcreteImports.length) {
    console.error("Postgrad API preservation check failed.");
    for (const [route, handler] of forbiddenConcreteImports) {
      console.error(`- devpostgrad gateway must not import ${handler} for ${route}; keep concrete API handlers on dev`);
    }
    process.exit(1);
  }

  console.log(`Postgrad API preservation check passed in devpostgrad gateway mode for ${protectedRoutes.length} protected War Missions routes.`);
  process.exit(0);
}

const missing = [];
for (const [route, handler] of protectedRoutes) {
  const expected = `router.all("${route}", wrap(${handler}))`;
  if (!server.includes(expected)) {
    missing.push(`${route} must remain wired to ${handler}`);
  }
}

const forbiddenProxyRoutes = protectedRoutes.filter(([route]) =>
  server.includes(`router.all("${route}", wrap(warMissionsProxy))`)
);

if (missing.length || forbiddenProxyRoutes.length) {
  console.error("Postgrad API preservation check failed.");
  for (const message of missing) console.error(`- ${message}`);
  for (const [route] of forbiddenProxyRoutes) {
    console.error(`- ${route} must not be replaced by warMissionsProxy without an approved migration`);
  }
  process.exit(1);
}

console.log(`Postgrad API preservation check passed for ${protectedRoutes.length} protected War Missions routes.`);
