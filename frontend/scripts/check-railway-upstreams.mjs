import "../api/load-local-env.mjs";

const DEFAULT_CHAIN_IDS = [56, 97];

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function firstEnv(names) {
  for (const name of names) {
    const value = normalizeUrl(process.env[name]);
    if (value) return { name, value };
  }
  return { name: "unset", value: "" };
}

function requireUpstream(label, upstream, envNames) {
  if (upstream.value) return;
  console.error(`${label} Railway base URL is required for devpostgrad smoke checks.`);
  console.error(`Set one of: ${envNames.join(", ")}`);
  process.exitCode = 1;
}

function parseChainIds(raw) {
  const values = String(raw || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return values.length ? Array.from(new Set(values)) : DEFAULT_CHAIN_IDS;
}

function firstRawEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return { name, value };
  }
  return { name: "unset", value: "" };
}

function summarizeJson(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data?.items)) return "";

    const statusCounts = new Map();
    const chainCounts = new Map();
    const visibilityCounts = new Map();
    let withCampaignAddress = 0;

    for (const item of data.items) {
      const status = item?.status || "missing";
      const chainId = item?.chainId ?? "missing";
      const visibility = item?.visibility || "missing";
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      chainCounts.set(chainId, (chainCounts.get(chainId) || 0) + 1);
      visibilityCounts.set(visibility, (visibilityCounts.get(visibility) || 0) + 1);
      if (item?.campaignAddress) withCampaignAddress += 1;
    }

    const formatCounts = (counts) =>
      Array.from(counts.entries())
        .map(([key, count]) => `${key}:${count}`)
        .join(", ") || "none";

    const fields = [`items=${data.items.length}`, `chains=${formatCounts(chainCounts)}`];
    if (statusCounts.size) fields.push(`statuses=${formatCounts(statusCounts)}`);
    if (visibilityCounts.size) fields.push(`visibility=${formatCounts(visibilityCounts)}`);
    if (withCampaignAddress) fields.push(`withCampaignAddress=${withCampaignAddress}`);
    return fields.join("; ");
  } catch {
    return "";
  }
}

const frontendEnvNames = [
  "RAILWAY_FRONTEND_API_BASE_URL",
  "FRONTEND_RAILWAY_API_BASE_URL",
  "MEMEWARZONE_FRONTEND_API_BASE_URL",
  "VITE_API_BASE_URL",
  "RAILWAY_API_BASE_URL",
];
const tokenEnvNames = [
  "RAILWAY_TOKEN_API_BASE_URL",
  "TOKEN_RAILWAY_API_BASE_URL",
  "RAILWAY_INDEXER_URL",
  "VITE_REALTIME_API_BASE",
];
const frontend = firstEnv(frontendEnvNames);
const token = firstEnv(tokenEnvNames);
const chainIds = parseChainIds(process.env.CHECK_CHAIN_IDS || process.env.VITE_ALLOWED_CHAIN_IDS);
const draftOwner = firstRawEnv(["CHECK_DRAFT_OWNER", "DRAFT_OWNER", "WALLET_ADDRESS", "VITE_DEV_WALLET_ADDRESS"]);

requireUpstream("frontend", frontend, frontendEnvNames);
requireUpstream("token/indexer", token, tokenEnvNames);
if (process.exitCode) process.exit(process.exitCode);

const checks = [
  ["frontend", frontend, "/healthz"],
  ...chainIds.flatMap((chainId) => [
    ["frontend", frontend, `/api/campaigns?chainId=${chainId}&limit=3`],
    ["frontend", frontend, `/api/drafts?chainId=${chainId}&limit=50`],
    ...(draftOwner.value
      ? [["frontend", frontend, `/api/drafts?owner=${encodeURIComponent(draftOwner.value)}&chainId=${chainId}&limit=50`]]
      : []),
    ["frontend", frontend, `/api/token-metadata?chainId=${chainId}&address=0x0000000000000000000000000000000000000000`],
    ["frontend", frontend, `/api/epochPools?chainId=${chainId}`],
  ]),
  ["frontend", frontend, "/api/prepare-notifications?limit=1"],
  ["token", token, "/healthz"],
];

async function probe(label, upstream, path) {
  const url = `${upstream.value}${path}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const preview = text.replace(/\s+/g, " ").slice(0, 180);
    const summary = summarizeJson(text);
    console.log(`${label.padEnd(8)} ${String(res.status).padEnd(3)} ${path}`);
    console.log(`  base: ${upstream.value} (${upstream.name})`);
    console.log(`  type: ${res.headers.get("content-type") || "unknown"}; ${Date.now() - startedAt}ms`);
    if (summary) console.log(`  summary: ${summary}`);
    if (preview) console.log(`  body: ${preview}`);
  } catch (error) {
    console.log(`${label.padEnd(8)} ERR ${path}`);
    console.log(`  base: ${upstream.value} (${upstream.name})`);
    console.log(`  error: ${error?.message || String(error)}`);
  }
}

console.log("Railway upstream diagnostic");
console.log(`frontend: ${frontend.value} (${frontend.name})`);
console.log(`token:    ${token.value} (${token.name})`);
console.log(`chains:   ${chainIds.join(", ")}`);
console.log(`owner:    ${draftOwner.value ? `${draftOwner.value} (${draftOwner.name})` : "not set"}`);
console.log("");

for (const [label, upstream, path] of checks) {
  await probe(label, upstream, path);
}
