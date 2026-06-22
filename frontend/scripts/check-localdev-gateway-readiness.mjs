import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

const failures = [];
const server = read("api/server.mjs");
const envExample = read(".env.example");

if (server.includes("devpostgrad API gateway") || server.includes("devpostgrad does not host the live API")) {
  failures.push("devpostgrad should no longer run the proxy-only local gateway server");
}

if (!server.includes("createRailwayProxyMiddleware")) {
  failures.push("explicit opt-in Railway fallback middleware should remain available for local diagnostics");
}

if (!envExample.includes("API_RAILWAY_PROXY=false")) {
  failures.push("API_RAILWAY_PROXY must default to false in .env.example");
}

if (!envExample.includes("Only enable API_RAILWAY_PROXY for explicit, logged diagnostics")) {
  failures.push(".env.example must explain that proxy mode is diagnostic-only");
}

if (envExample.includes("devpostgrad does not host real API handlers locally")) {
  failures.push("old gateway explanation must be removed from .env.example");
}

if (failures.length) {
  console.error("Local dev gateway readiness check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Local dev gateway readiness check passed for independent API mode.");
