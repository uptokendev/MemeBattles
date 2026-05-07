#!/usr/bin/env node

const BASE_URL = (process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
const CHAIN_ID = process.env.CHECK_CHAIN_ID || process.env.VITE_TARGET_CHAIN_ID || process.env.VITE_DEFAULT_CHAIN_ID || "97";
const WALLET_ADDRESS = process.env.CHECK_WALLET_ADDRESS || "0x1111111111111111111111111111111111111111";
const CAMPAIGN_ADDRESS = process.env.CHECK_CAMPAIGN_ADDRESS || "0x0000000000000000000000000000000000000002";
const DRAFT_ID = process.env.CHECK_DRAFT_ID || "00000000-0000-4000-8000-000000000000";
const PREPARE_SLUG = process.env.CHECK_PREPARE_SLUG || "smoke-test-slug";

function url(path) {
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { __nonJson: text.slice(0, 300) };
  }
}

async function check({ name, method = "GET", path, body, allowed = [200], headers = {} }) {
  const res = await fetch(url(path), {
    method,
    headers: body ? { "content-type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await readJson(res)) || {};
  const ok = allowed.includes(res.status) && !json.__nonJson;
  const upstream = res.headers.get("x-mwz-api-upstream") || "local";
  return { name, method, path, status: res.status, ok, upstream, json };
}

const checks = [
  { name: "Health", path: "/healthz" },
  { name: "DB health", path: "/health" },

  // Core read surfaces that must work before Netlify can become static-only.
  { name: "Campaign feed", path: `/api/campaigns?chainId=${CHAIN_ID}&limit=5&tab=trending&sort=default&status=all` },
  { name: "Featured campaigns", path: `/api/featured?chainId=${CHAIN_ID}&limit=5` },
  { name: "Token trades through hybrid realtime path", path: `/api/token/${CAMPAIGN_ADDRESS}/trades?chainId=${CHAIN_ID}&limit=5`, allowed: [200, 404] },
  { name: "Token summary through hybrid realtime path", path: `/api/token/${CAMPAIGN_ADDRESS}/summary?chainId=${CHAIN_ID}`, allowed: [200, 404] },
  { name: "Vote counts", path: `/api/vote_counts?campaignAddress=${CAMPAIGN_ADDRESS}&chainId=${CHAIN_ID}` },
  { name: "Profile", path: `/api/profile?address=${WALLET_ADDRESS}&chainId=${CHAIN_ID}`, allowed: [200, 404] },
  { name: "Profile cabinet", path: `/api/profileCabinet?address=${WALLET_ADDRESS}&chainId=${CHAIN_ID}`, allowed: [200, 404] },
  { name: "Follows user counts", path: `/api/follows/user-counts?wallet=${WALLET_ADDRESS}&address=${WALLET_ADDRESS}&chainId=${CHAIN_ID}`, allowed: [200, 404] },

  // Prepare mode / promotion pages.
  { name: "Draft list", path: `/api/drafts?chainId=${CHAIN_ID}&limit=5`, allowed: [200] },
  { name: "Draft detail", path: `/api/drafts/${DRAFT_ID}`, allowed: [200, 404] },
  { name: "Prepare slug", path: `/api/prepare/${PREPARE_SLUG}`, allowed: [200, 404] },
  { name: "Draft ticker availability", path: `/api/drafts/ticker-availability?chainId=${CHAIN_ID}&symbol=SMOKE`, allowed: [200] },
  { name: "Prepare notifications", path: `/api/prepare-notifications?wallet=${WALLET_ADDRESS}&address=${WALLET_ADDRESS}&chainId=${CHAIN_ID}&limit=5`, allowed: [200, 404] },

  // Reward/recruiter/squad surfaces: stubs are acceptable now, JSON responses are required.
  { name: "Reward summary", path: `/api/rewards/me?address=${WALLET_ADDRESS}` },
  { name: "Reward history", path: `/api/rewards/me/history?address=${WALLET_ADDRESS}&limit=5` },
  { name: "Airdrop winners", path: "/api/airdrops/winners?limit=5" },
  { name: "Squad leaderboard", path: "/api/squads?limit=5" },
  { name: "Recruiters", path: "/api/recruiters?limit=5", allowed: [200, 404] },
  { name: "Wallet attribution", path: `/api/attribution/wallet/${WALLET_ADDRESS}`, allowed: [200, 404] },

  // Write-ish routes with harmless smoke bodies.
  {
    name: "Wallet connect attribution",
    method: "POST",
    path: "/api/attribution/wallet-connect",
    body: { walletAddress: WALLET_ADDRESS, chainId: Number(CHAIN_ID), sessionToken: "smoke", clientFingerprint: "smoke" },
    allowed: [200, 202, 404],
  },
  {
    name: "Routing status",
    path: `/api/routing/status?chainId=${CHAIN_ID}`,
    allowed: [200, 503],
  },
];

let failures = 0;
console.log(`API migration readiness: ${BASE_URL}`);
console.log(`chainId=${CHAIN_ID} wallet=${WALLET_ADDRESS} campaign=${CAMPAIGN_ADDRESS}`);
console.log("");

for (const item of checks) {
  try {
    const result = await check(item);
    const marker = result.ok ? "OK" : "FAIL";
    if (!result.ok) failures++;
    const code = result.json?.code ? ` code=${result.json.code}` : "";
    const err = result.json?.error ? ` error=${String(result.json.error).slice(0, 80)}` : "";
    console.log(`${marker} ${result.method} ${result.path} -> ${result.status} upstream=${result.upstream}${code}${err} :: ${result.name}`);
    if (!result.ok) console.log(JSON.stringify(result.json, null, 2));
  } catch (error) {
    failures++;
    console.log(`FAIL ${item.method || "GET"} ${item.path} :: ${item.name}`);
    console.log(String(error?.message || error));
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} migration readiness check(s) failed.`);
  process.exit(1);
}

console.log("All migration readiness checks returned expected JSON statuses.");
