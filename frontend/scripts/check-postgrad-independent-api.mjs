import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

function requireIncludes(source, expected, label, failures) {
  if (!source.includes(expected)) failures.push(`${label}: missing ${expected}`);
}

function requireExcludes(source, forbidden, label, failures) {
  if (source.includes(forbidden)) failures.push(`${label}: should not include ${forbidden}`);
}

const failures = [];
const server = read("api/server.mjs");
const envExample = read(".env.example");
const packageJson = read("package.json");

const requiredServerTerms = [
  ["import { pool } from \"../server/db.js\"", "database-backed API server"],
  ["app.use(\"/api/upload\", wrap(upload))", "raw upload route mounted before body parsers"],
  ["app.get(\"/healthz\"", "Railway healthz endpoint"],
  ["app.get(\"/health\"", "database health endpoint"],
  ["express.json({ limit: process.env.API_JSON_LIMIT || \"10mb\" })", "live payload limit default"],
  ["router.all(\"/drafts\", wrap(drafts))", "Prepare Mode drafts route"],
  ["router.all(\"/prepare/:slug\", wrap(signedPrepareBySlug))", "Prepare slug route"],
  ["router.all(\"/campaigns\", wrap(campaigns))", "campaigns route"],
  ["router.all(\"/token-metadata\", wrap(tokenMetadata))", "token metadata route"],
  ["router.all(\"/league\", wrap(league))", "league route"],
  ["wrap(postgrad)", "postgrad route multiplexer"],
  ["router.all(\"/wm-quiz-submit\", wrap(wmQuizSubmit))", "War Missions quiz route"],
  ["router.all(\"/internal/rewards/publications\", wrap(internalRewardPublications))", "internal rewards route"],
];

for (const [expected, label] of requiredServerTerms) {
  requireIncludes(server, expected, label, failures);
}

requireExcludes(server, "devpostgrad API gateway", "old proxy gateway banner", failures);
requireExcludes(server, "devpostgrad does not host the live API", "old proxy-only 404 hint", failures);
requireExcludes(envExample, "API_RAILWAY_PROXY=true", "independent Railway env defaults", failures);
requireExcludes(envExample, "RAILWAY_FRONTEND_API_BASE_URL=https://memewarzonefrontend-production.up.railway.app", "live dev Railway upstream", failures);
requireExcludes(envExample, "RAILWAY_API_BASE_URL=https://memebattles-production.up.railway.app", "legacy live Railway upstream", failures);

const requiredEnvTerms = [
  ["DATABASE_URL=", "shared database placeholder"],
  ["API_RAILWAY_PROXY=false", "proxy disabled by default"],
  ["VITE_API_BASE_URL=https://your-devpostgrad-api.up.railway.app", "staging API base placeholder"],
  ["CORS_ALLOWED_ORIGINS=", "staging CORS configuration"],
  ["POSTGRAD_ARENA_OPS_ENABLED=false", "postgrad DB readiness flags"],
  ["Do not point devpostgrad back at the live dev Railway API", "live dev safety note"],
];

for (const [expected, label] of requiredEnvTerms) {
  requireIncludes(envExample, expected, label, failures);
}

requireIncludes(packageJson, '"check:api-imports"', "relative import check script", failures);
requireIncludes(packageJson, '"check:postgrad-api-preservation"', "preservation check script", failures);
requireIncludes(packageJson, '"check:postgrad-independent-api"', "independent API check script", failures);

if (failures.length) {
  console.error("Postgrad independent API readiness check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Postgrad independent API readiness check passed.");
