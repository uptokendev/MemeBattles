#!/usr/bin/env node

const BASE_URL = (process.env.API_BASE_URL || process.env.VITE_REALTIME_API_BASE || "http://localhost:8888").replace(/\/+$/, "");
const CHAIN_ID = process.env.CHECK_CHAIN_ID || process.env.VITE_DEFAULT_CHAIN_ID || process.env.VITE_TARGET_CHAIN_ID || "97";
const FACTORY_ADDRESS = process.env.CHECK_FACTORY_ADDRESS || process.env.VITE_FACTORY_ADDRESS_97 || process.env.VITE_FACTORY_ADDRESS || "";
const WALLET_ADDRESS = process.env.CHECK_WALLET_ADDRESS || "";
const CAMPAIGN_ADDRESS = process.env.CHECK_CAMPAIGN_ADDRESS || "";

function url(path) {
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function fail(message, details) {
  console.error(`FAIL ${message}`);
  if (details !== undefined) {
    console.error(typeof details === "string" ? details : JSON.stringify(details, null, 2));
  }
  process.exitCode = 1;
}

function requireEnvLike(name, value) {
  if (!String(value || "").trim()) {
    fail(`Missing ${name}`);
  }
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function isSignature(value) {
  return /^0x[a-fA-F0-9]{130}$/.test(String(value || "").trim());
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { __nonJson: text.slice(0, 500) };
  }
}

async function request(name, method, path, body) {
  const res = await fetch(url(path), {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await readJson(res);
  if (json.__nonJson) {
    fail(`${name} returned non-JSON`, json.__nonJson);
    return { res, json };
  }
  return { res, json };
}

function assertStatusReady(json) {
  const requiredTrue = [
    "readyForCoreFlow",
    "signerConfigured",
    "rpcConfigured",
    "matchesOnchain",
  ];

  for (const key of requiredTrue) {
    if (json?.[key] !== true) {
      fail(`/api/routing/status ${key} is not true`, json);
    }
  }

  if (json?.status !== "ready") {
    fail(`/api/routing/status status is not ready`, json);
  }

  if (!isAddress(json?.routeAuthority)) {
    fail(`/api/routing/status routeAuthority is invalid`, json);
  }

  if (!isAddress(json?.onchainRouteAuthority)) {
    fail(`/api/routing/status onchainRouteAuthority is invalid`, json);
  }
}

function assertCreateAuthorization(json) {
  const auth = json?.authorization;
  if (!auth) return fail(`Create authorization missing authorization object`, json);
  if (!Number.isFinite(Number(auth.tradeRouteProfileId))) fail(`Create authorization missing tradeRouteProfileId`, json);
  if (!Number.isFinite(Number(auth.finalizeRouteProfileId))) fail(`Create authorization missing finalizeRouteProfileId`, json);
  if (!isSignature(auth.signature)) fail(`Create authorization signature is invalid`, json);
  const validUntilMs = Date.parse(auth.validUntil || "");
  if (!Number.isFinite(validUntilMs) || validUntilMs <= Date.now()) fail(`Create authorization validUntil is invalid or expired`, json);
  if (!isAddress(json?.routeAuthority)) fail(`Create authorization routeAuthority is invalid`, json);
}

function assertTradeAuthorization(json) {
  const auth = json?.authorization;
  if (!auth) return fail(`Trade authorization missing authorization object`, json);
  if (!Number.isFinite(Number(auth.routeProfileId))) fail(`Trade authorization missing routeProfileId`, json);
  if (!isSignature(auth.signature)) fail(`Trade authorization signature is invalid`, json);
  const validUntilMs = Date.parse(auth.validUntil || "");
  if (!Number.isFinite(validUntilMs) || validUntilMs <= Date.now()) fail(`Trade authorization validUntil is invalid or expired`, json);
  if (!isAddress(json?.routeAuthority)) fail(`Trade authorization routeAuthority is invalid`, json);
}

console.log(`Phase 3 core-flow readiness check: ${BASE_URL}`);
console.log(`chainId=${CHAIN_ID}`);
console.log(`factory=${FACTORY_ADDRESS || "<missing>"}`);
console.log(`wallet=${WALLET_ADDRESS || "<missing>"}`);
console.log(`campaign=${CAMPAIGN_ADDRESS || "<missing>"}`);

requireEnvLike("CHECK_FACTORY_ADDRESS or VITE_FACTORY_ADDRESS_97", FACTORY_ADDRESS);
requireEnvLike("CHECK_WALLET_ADDRESS", WALLET_ADDRESS);
requireEnvLike("CHECK_CAMPAIGN_ADDRESS", CAMPAIGN_ADDRESS);

if (!isAddress(FACTORY_ADDRESS)) fail("Factory address is invalid", FACTORY_ADDRESS);
if (!isAddress(WALLET_ADDRESS)) fail("Wallet address is invalid", WALLET_ADDRESS);
if (!isAddress(CAMPAIGN_ADDRESS)) fail("Campaign address is invalid", CAMPAIGN_ADDRESS);

if (process.exitCode) process.exit(process.exitCode);

const statusPath = `/api/routing/status?chainId=${encodeURIComponent(CHAIN_ID)}&factoryAddress=${encodeURIComponent(FACTORY_ADDRESS)}&walletAddress=${encodeURIComponent(WALLET_ADDRESS)}`;
const status = await request("Routing status", "GET", statusPath);
if (status.res.status !== 200) {
  fail(`Routing status returned ${status.res.status}`, status.json);
} else {
  assertStatusReady(status.json);
  console.log(`OK GET ${statusPath} -> ${status.res.status} :: route authority ready`);
}

const create = await request("Create authorization", "POST", "/api/routing/create-authorization", {
  walletAddress: WALLET_ADDRESS,
  chainId: Number(CHAIN_ID),
  factoryAddress: FACTORY_ADDRESS,
});
if (create.res.status !== 200) {
  fail(`Create authorization returned ${create.res.status}`, create.json);
} else {
  assertCreateAuthorization(create.json);
  console.log(`OK POST /api/routing/create-authorization -> ${create.res.status} :: valid signature`);
}

const trade = await request("Trade authorization", "POST", "/api/routing/trade-authorization", {
  walletAddress: WALLET_ADDRESS,
  chainId: Number(CHAIN_ID),
  campaignAddress: CAMPAIGN_ADDRESS,
});
if (trade.res.status !== 200) {
  fail(`Trade authorization returned ${trade.res.status}`, trade.json);
} else {
  assertTradeAuthorization(trade.json);
  console.log(`OK POST /api/routing/trade-authorization -> ${trade.res.status} :: valid signature`);
}

if (process.exitCode) {
  console.error("\nPhase 3 core-flow readiness check failed.");
  process.exit(process.exitCode);
}

console.log("\nPhase 3 core-flow API readiness is green.");
console.log("Next manual gate: create -> buy -> sell -> finalize readiness in the UI/wallet.");
