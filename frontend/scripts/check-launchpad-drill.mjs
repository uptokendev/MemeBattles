#!/usr/bin/env node

import "../api/load-local-env.mjs";

const SOLANA_CHAIN_ID = 101;
const DEFAULT_BNB_CHAIN_IDS = [56, 97];

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

function firstRawEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return { name, value };
  }
  return { name: "unset", value: "" };
}

function parseChainIds(raw) {
  const values = String(raw || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return values.length ? Array.from(new Set(values)) : DEFAULT_BNB_CHAIN_IDS;
}

function url(base, path) {
  return `${base.value}${path.startsWith("/") ? path : `/${path}`}`;
}

function requireConfigured(label, value, envNames) {
  if (value) return;
  console.error(`${label} is required for the launchpad drill.`);
  console.error(`Set one of: ${envNames.join(", ")}`);
  process.exitCode = 1;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { __nonJson: text.slice(0, 500) };
  }
}

async function check({ label, base, method = "GET", path, body, headers, allowedStatuses = [200], inspect }) {
  const startedAt = Date.now();
  const res = await fetch(url(base, path), {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await readJson(res);
  const ok = allowedStatuses.includes(res.status) && !json.__nonJson && (!inspect || inspect(json));
  const marker = ok ? "OK" : "FAIL";
  const detail = json?.code ? ` code=${json.code}` : json?.error ? ` error=${json.error}` : "";
  console.log(`${marker} ${method} ${path} -> ${res.status} ${Date.now() - startedAt}ms :: ${label}${detail}`);
  if (!ok) console.log(JSON.stringify(json, null, 2));
  return ok;
}

function campaignFeedLooksValid(json) {
  return Array.isArray(json?.items) && typeof json?.updatedAt === "string";
}

function safetyLooksValid(json) {
  const snapshot = json?.snapshot;
  return Boolean(json?.ok === true && snapshot && Array.isArray(snapshot.checks) && snapshot.chainId === SOLANA_CHAIN_ID);
}

function listLooksValid(json) {
  return json?.ok === true && Array.isArray(json?.items);
}

const frontendEnvNames = [
  "RAILWAY_FRONTEND_API_BASE_URL",
  "FRONTEND_RAILWAY_API_BASE_URL",
  "MEMEWARZONE_FRONTEND_API_BASE_URL",
  "VITE_API_BASE_URL",
  "API_BASE_URL",
];
const tokenEnvNames = [
  "RAILWAY_TOKEN_API_BASE_URL",
  "TOKEN_RAILWAY_API_BASE_URL",
  "RAILWAY_INDEXER_URL",
  "VITE_REALTIME_API_BASE",
  "TOKEN_API_BASE_URL",
];
const tokenNames = ["CHECK_INTERNAL_TOKEN", "RANK_EVENTS_TOKEN", "VITE_RANK_EVENTS_TOKEN"];

const frontend = firstEnv(frontendEnvNames);
const token = firstEnv(tokenEnvNames);
const internalToken = firstRawEnv(tokenNames);
const bnbChainIds = parseChainIds(process.env.CHECK_BNB_CHAIN_IDS || process.env.VITE_ALLOWED_CHAIN_IDS);
const wallet = firstRawEnv(["CHECK_WALLET_ADDRESS", "WALLET_ADDRESS", "VITE_DEV_WALLET_ADDRESS"]);
const campaign = firstRawEnv(["CHECK_CAMPAIGN_ADDRESS", "CAMPAIGN_ADDRESS", "VITE_DEV_CAMPAIGN_ADDRESS"]);
const factory = firstRawEnv(["CHECK_FACTORY_ADDRESS", "VITE_FACTORY_ADDRESS_97", "VITE_FACTORY_ADDRESS"]);
const solanaWallet = firstRawEnv(["CHECK_SOLANA_WALLET", "SOLANA_WALLET_ADDRESS", "VITE_SOLANA_DEV_WALLET"]);
const solanaCampaign = firstRawEnv(["CHECK_SOLANA_CAMPAIGN", "SOLANA_CAMPAIGN_ADDRESS", "VITE_SOLANA_DEV_CAMPAIGN"]);

requireConfigured("frontend Railway/API base URL", frontend.value, frontendEnvNames);
requireConfigured("token/indexer Railway base URL", token.value, tokenEnvNames);
requireConfigured("internal token", internalToken.value, tokenNames);
if (process.exitCode) process.exit(process.exitCode);

const internalHeaders = { authorization: `Bearer ${internalToken.value}` };
const checks = [];

checks.push({ label: "Frontend health", base: frontend, path: "/healthz" });
checks.push({ label: "Token/indexer health", base: token, path: "/healthz" });

for (const chainId of bnbChainIds) {
  checks.push({
    label: `BNB campaign feed chain ${chainId}`,
    base: frontend,
    path: `/api/campaigns?chainId=${chainId}&limit=3`,
    inspect: campaignFeedLooksValid,
  });
  checks.push({
    label: `BNB routing status chain ${chainId}`,
    base: frontend,
    path: `/api/routing/status?chainId=${chainId}${factory.value ? `&factoryAddress=${encodeURIComponent(factory.value)}` : ""}${wallet.value ? `&walletAddress=${encodeURIComponent(wallet.value)}` : ""}`,
    allowedStatuses: [200, 503],
  });
}

if (wallet.value && factory.value) {
  const chainId = bnbChainIds.includes(97) ? 97 : bnbChainIds[0];
  checks.push({
    label: "BNB launch preflight create",
    base: frontend,
    method: "POST",
    path: "/api/launchpad/preflight-create",
    body: { walletAddress: wallet.value, chainId, factoryAddress: factory.value },
    allowedStatuses: [200, 403, 503],
  });
}

if (wallet.value && campaign.value) {
  const chainId = bnbChainIds.includes(97) ? 97 : bnbChainIds[0];
  checks.push({
    label: "BNB launch preflight buy",
    base: frontend,
    method: "POST",
    path: "/api/launchpad/preflight-buy",
    body: { walletAddress: wallet.value, chainId, campaignAddress: campaign.value },
    allowedStatuses: [200, 403, 503],
  });
  checks.push({
    label: "BNB launch preflight sell",
    base: frontend,
    method: "POST",
    path: "/api/launchpad/preflight-sell",
    body: { walletAddress: wallet.value, chainId, campaignAddress: campaign.value },
    allowedStatuses: [200, 403, 503],
  });
}

checks.push({
  label: "Solana campaign feed",
  base: frontend,
  path: `/api/campaigns?chainId=${SOLANA_CHAIN_ID}&limit=3`,
  inspect: campaignFeedLooksValid,
});
checks.push({
  label: "Solana ops safety snapshot",
  base: token,
  path: "/internal/solana/ops/safety",
  headers: internalHeaders,
  inspect: safetyLooksValid,
});
checks.push({
  label: "Solana admin action queue",
  base: token,
  path: "/internal/solana/ops/admin-actions?limit=10",
  headers: internalHeaders,
  inspect: listLooksValid,
});
checks.push({
  label: "Solana payout intents",
  base: token,
  path: "/internal/solana/payout-intents?limit=10",
  headers: internalHeaders,
  inspect: listLooksValid,
});
checks.push({
  label: "Solana reward claims",
  base: token,
  path: `/internal/rewards/claims?chainId=${SOLANA_CHAIN_ID}&limit=10`,
  headers: internalHeaders,
  inspect: listLooksValid,
});
checks.push({
  label: "Solana recruiter settlements",
  base: token,
  path: `/internal/recruiters/claimable-settlements?chainId=${SOLANA_CHAIN_ID}&limit=10`,
  headers: internalHeaders,
  inspect: listLooksValid,
});

if (solanaWallet.value) {
  checks.push({
    label: "Solana wallet verification challenge",
    base: token,
    method: "POST",
    path: "/api/solana/wallet-verification/challenge",
    body: { walletAddress: solanaWallet.value },
    allowedStatuses: [200, 400, 503],
  });
}

if (process.env.LAUNCHPAD_DRILL_MUTATE === "1") {
  checks.push({
    label: "Create Solana safety-note admin action",
    base: token,
    method: "POST",
    path: "/internal/solana/ops/admin-actions",
    headers: internalHeaders,
    body: {
      actionType: "safety_note",
      targetKind: "program",
      requestedBy: "launchpad-drill",
      reason: "Launchpad drill safety-note probe",
      requestedFlags: { dryRun: true, source: "check-launchpad-drill" },
    },
    inspect: (json) => json?.ok === true && json?.action?.status === "requested",
  });
}

if (process.env.LAUNCHPAD_DRILL_MUTATE === "1" && solanaCampaign.value) {
  checks.push({
    label: "Queue Solana campaign pause admin action",
    base: token,
    method: "POST",
    path: "/internal/solana/ops/admin-actions",
    headers: internalHeaders,
    body: {
      actionType: "campaign_pause",
      targetKind: "campaign",
      targetAddress: solanaCampaign.value,
      requestedBy: "launchpad-drill",
      reason: "Launchpad drill campaign-pause probe",
      requestedFlags: { paused: true, dryRun: true, source: "check-launchpad-drill" },
    },
    inspect: (json) => json?.ok === true && json?.action?.status === "requested",
  });
}

let failures = 0;
console.log("Launchpad drill smoke test");
console.log(`frontend: ${frontend.value} (${frontend.name})`);
console.log(`token:    ${token.value} (${token.name})`);
console.log(`bnb:      ${bnbChainIds.join(", ")}`);
console.log(`solana:   ${SOLANA_CHAIN_ID}`);
console.log(`mutate:   ${process.env.LAUNCHPAD_DRILL_MUTATE === "1" ? "enabled" : "disabled"}`);
console.log("");

for (const item of checks) {
  try {
    const ok = await check(item);
    if (!ok) failures += 1;
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${item.method || "GET"} ${item.path} :: ${item.label}`);
    console.log(String(error?.message || error));
  }
}

if (failures > 0) {
  console.error(`\n${failures} launchpad drill check(s) failed.`);
  process.exit(1);
}

console.log("\nLaunchpad drill checks are green.");
