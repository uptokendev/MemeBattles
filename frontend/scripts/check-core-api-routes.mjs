#!/usr/bin/env node

const BASE_URL = (process.env.API_BASE_URL || process.env.VITE_REALTIME_API_BASE || "http://127.0.0.1:3001").replace(/\/+$/, "");
const CHAIN_ID = process.env.CHECK_CHAIN_ID || process.env.VITE_DEFAULT_CHAIN_ID || process.env.VITE_TARGET_CHAIN_ID || "97";
const FACTORY_ADDRESS = process.env.CHECK_FACTORY_ADDRESS || process.env.VITE_FACTORY_ADDRESS_97 || process.env.VITE_FACTORY_ADDRESS || "";
const WALLET_ADDRESS = process.env.CHECK_WALLET_ADDRESS || "0x0000000000000000000000000000000000000001";
const CAMPAIGN_ADDRESS = process.env.CHECK_CAMPAIGN_ADDRESS || "0x0000000000000000000000000000000000000002";

function url(path) {
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { __nonJson: text.slice(0, 300) };
  }
}

async function check(name, method, path, body, options = {}) {
  const res = await fetch(url(path), {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await readJson(res);
  const allowedStatuses = options.allowedStatuses || [200];
  const ok = allowedStatuses.includes(res.status) && !json.__nonJson;
  const upstream = res.headers.get("x-mwz-api-upstream") || "local";
  return { name, method, path, status: res.status, ok, upstream, json };
}

const checks = [
  ["Campaign feed", "GET", "/api/campaigns?limit=1", null, { allowedStatuses: [200, 500] }],
  ["Reward summary", "GET", `/api/rewards/me?address=${WALLET_ADDRESS}`, null],
  ["Reward history", "GET", `/api/rewards/me/history?address=${WALLET_ADDRESS}&limit=1`, null],
  ["Reward claims", "GET", `/api/rewards/me/claims?address=${WALLET_ADDRESS}&limit=1`, null],
  ["Reward eligibility", "GET", `/api/rewards/me/eligibility?address=${WALLET_ADDRESS}&limit=1`, null],
  ["Airdrop winners", "GET", "/api/airdrops/winners?limit=1", null],
  ["Squad leaderboard", "GET", "/api/squads?limit=1", null],
  ["Squad members", "GET", "/api/squads/members?limit=1", null],
  ["Recruiter leaderboard", "GET", "/api/recruiters?limit=1", null, { allowedStatuses: [200, 404] }],
  ["Wallet attribution", "GET", `/api/attribution/wallet/${WALLET_ADDRESS}`, null],
  ["Wallet connect attribution", "POST", "/api/attribution/wallet-connect", { walletAddress: WALLET_ADDRESS, sessionToken: "smoke", clientFingerprint: "smoke" }],
  ["Routing status", "GET", `/api/routing/status?chainId=${CHAIN_ID}${FACTORY_ADDRESS ? `&factoryAddress=${FACTORY_ADDRESS}` : ""}`, null],
  ["Create authorization", "POST", "/api/routing/create-authorization", { walletAddress: WALLET_ADDRESS, chainId: Number(CHAIN_ID), factoryAddress: FACTORY_ADDRESS || WALLET_ADDRESS }, { allowedStatuses: [200, 503] }],
  ["Trade authorization", "POST", "/api/routing/trade-authorization", { walletAddress: WALLET_ADDRESS, chainId: Number(CHAIN_ID), campaignAddress: CAMPAIGN_ADDRESS }, { allowedStatuses: [200, 503] }],
];

let failures = 0;
console.log(`Core API smoke test: ${BASE_URL}`);
console.log(`chainId=${CHAIN_ID} wallet=${WALLET_ADDRESS}`);

for (const args of checks) {
  try {
    const result = await check(...args);
    const marker = result.ok ? "OK" : "FAIL";
    if (!result.ok) failures++;
    const extra = result.json?.code ? ` code=${result.json.code}` : "";
    console.log(`${marker} ${result.method} ${result.path} -> ${result.status} upstream=${result.upstream}${extra} :: ${result.name}`);
    if (!result.ok) {
      console.log(JSON.stringify(result.json, null, 2));
    }
  } catch (error) {
    failures++;
    console.log(`FAIL ${args[1]} ${args[2]} :: ${args[0]}`);
    console.log(String(error?.message || error));
  }
}

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed.`);
  process.exit(1);
}

console.log("\nAll smoke checks returned expected JSON statuses.");
