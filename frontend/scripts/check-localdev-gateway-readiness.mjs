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

const failures = [];
const proxy = read("server/railwayProxy.js");
const envExample = read(".env.example");
const packageJson = read("package.json");

const requiredProxyTerms = [
  ["TOKEN_INDEXER_PATH_PREFIXES", "token/indexer route map"],
  ["FRONTEND_PRODUCT_PATH_PREFIXES", "frontend/product route map"],
  ["RAILWAY_FRONTEND_API_BASE_URL", "frontend/product upstream env"],
  ["RAILWAY_TOKEN_API_BASE_URL", "token/indexer upstream env"],
  ["RAILWAY_API_BASE_URL", "legacy single-upstream fallback"],
  ["selectRailwayUpstream", "upstream selector"],
  ["x-mwz-api-upstream-service", "debug upstream header"],
  ["RAILWAY_API_BASE_URL_MISSING", "clear missing-upstream response"],
  ["RAILWAY_API_UPSTREAM_FAILED", "clear strict upstream failure response"],
];

for (const [expected, label] of requiredProxyTerms) {
  requireIncludes(proxy, expected, label, failures);
}

const tokenIndexerRoutes = [
  "/api/campaigns",
  "/api/epochPools",
  "/api/token/",
  "/api/token-metadata",
  "/api/vote_counts",
  "/api/votes",
];

const frontendProductRoutes = [
  "/api/arena",
  "/api/war-room",
  "/api/sponsored",
  "/api/sponsorship-applications",
  "/api/profile",
  "/api/drafts",
  "/api/prepare",
];

for (const route of tokenIndexerRoutes) {
  requireIncludes(proxy, route, "token/indexer proxy route", failures);
  requireIncludes(envExample, route, "token/indexer env route summary", failures);
}

for (const route of frontendProductRoutes) {
  requireIncludes(proxy, route, "frontend/product proxy route", failures);
  requireIncludes(envExample, route, "frontend/product env route summary", failures);
}

const requiredEnvTerms = [
  ["API_RAILWAY_PROXY=true", "proxy enabled local env"],
  ["API_RAILWAY_PROXY_STRICT=true", "strict proxy local env"],
  ["RAILWAY_FRONTEND_API_BASE_URL=https://memewarzonefrontend-production.up.railway.app", "frontend/product Railway service"],
  ["RAILWAY_TOKEN_API_BASE_URL=https://memebattles-production.up.railway.app", "token/indexer Railway service"],
  ["VITE_ENABLE_POSTGRAD_MOCKS=false", "mock data disabled by default"],
  ["devpostgrad does not host real API handlers locally", "local gateway explanation"],
];

for (const [expected, label] of requiredEnvTerms) {
  requireIncludes(envExample, expected, label, failures);
}

requireIncludes(packageJson, '"check:localdev-gateway"', "package script", failures);

if (failures.length) {
  console.error("Local dev gateway readiness check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Local dev gateway readiness check passed.");
