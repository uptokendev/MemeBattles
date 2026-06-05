import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

function assertIncludes(source, expected, label, failures) {
  if (!source.includes(expected)) failures.push(`${label}: missing ${expected}`);
}

function assertNotIncludes(source, forbidden, label, failures) {
  if (source.includes(forbidden)) failures.push(`${label}: forbidden ${forbidden}`);
}

const failures = [];
const app = read("src/App.tsx");
const config = read("src/features/postgrad/config.ts");
const identityRoutes = read("src/features/postgrad/identityRoutes.ts");
const tokenRoutes = read("src/features/postgrad/tokenRoutes.ts");
const navigation = read("src/constants/navigation.ts");
const server = read("api/server.mjs");
const envExample = read(".env.example");

const requiredUiRoutes = [
  'path="/arena"',
  'path="/arena/battles"',
  'path="/arena/leagues"',
  'path="/arena/events"',
  'path="/war-room"',
  'path="/battle/:id"',
  'path="/tournament/:id"',
  'path="/sponsorships/apply"',
  'path="/profile/:wallet/command/arena-ops"',
  'path="/token/:campaignAddress"',
];

for (const route of requiredUiRoutes) assertIncludes(app, route, "App routes", failures);

const requiredRedirects = [
  'path="/events" element={<Navigate to="/arena/events" replace />} />',
  'path="/league" element={<Navigate to="/arena/leagues" replace />} />',
];
for (const route of requiredRedirects) assertIncludes(app, route, "legacy redirects", failures);

assertNotIncludes(app, 'path="/arena/token', "Arena token route", failures);
assertNotIncludes(app, 'element={<MockTokenDetails', "Mock token details route", failures);
assertIncludes(identityRoutes, "return `/token/${encodeURIComponent(value)}`;", "canonical token route", failures);
assertIncludes(tokenRoutes, "getPostGradTokenDetailRoute", "Arena token route helper", failures);

const requiredArenaNav = [
  '{ label: "Overview", path: "/arena" }',
  '{ label: "Battles", path: "/arena/battles" }',
  '{ label: "Leagues", path: "/arena/leagues" }',
  '{ label: "Events", path: "/arena/events" }',
];
for (const item of requiredArenaNav) assertIncludes(navigation, item, "Arena navigation", failures);

assertIncludes(config, "mocks: readFlag(import.meta.env.VITE_ENABLE_POSTGRAD_MOCKS, false)", "mock-data opt-in", failures);

const backendFlags = [
  "POSTGRAD_ARENA_OPS_ENABLED",
  "POSTGRAD_BATTLES_ENABLED",
  "POSTGRAD_EVENTS_ENABLED",
  "POSTGRAD_LEAGUE_ENABLED",
  "POSTGRAD_WAR_POOLS_ENABLED",
  "POSTGRAD_SPONSORSHIPS_ENABLED",
  "POSTGRAD_WAR_ROOM_ENABLED",
];

const gatewayMode =
  server.includes("devpostgrad API gateway") &&
  server.includes("createRailwayProxyMiddleware") &&
  server.includes("devpostgrad does not host the live API");

if (!gatewayMode) {
  for (const flag of backendFlags) assertIncludes(server, flag, "backend readiness gates", failures);
}

for (const flag of backendFlags) assertIncludes(envExample, `${flag}=false`, "env example backend flags", failures);

const frontendFlags = [
  "VITE_ENABLE_POSTGRAD=false",
  "VITE_ENABLE_POSTGRAD_ARENA=false",
  "VITE_ENABLE_POSTGRAD_WAR_ROOM=false",
  "VITE_ENABLE_POSTGRAD_BATTLE=false",
  "VITE_ENABLE_POSTGRAD_EVENTS=false",
  "VITE_ENABLE_POSTGRAD_LEAGUE=false",
  "VITE_ENABLE_POSTGRAD_TOURNAMENT=false",
  "VITE_ENABLE_POSTGRAD_MOCKS=false",
];
for (const flag of frontendFlags) assertIncludes(envExample, flag, "env example frontend flags", failures);

if (failures.length) {
  console.error("Postgrad routing readiness check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mode = gatewayMode ? "devpostgrad gateway" : "local API server";
console.log(`Postgrad routing readiness check passed in ${mode} mode.`);
