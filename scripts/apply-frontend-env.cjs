#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const NETWORK_BY_CHAIN_ID = new Map([
  ["56", "bscMainnet"],
  ["97", "bscTestnet"],
]);
const ADDRESS_ENV_RE = /^(VITE_(FACTORY|CAMPAIGN_IMPLEMENTATION|TREASURY_ROUTER|TREASURY_VAULT|RECRUITER_REWARDS_VAULT|COMMUNITY_REWARDS_VAULT|PROTOCOL_REVENUE_VAULT|CREATOR_REGISTRY|RISK_REGISTRY|GRADUATION_ORACLE|PERMANENT_LP_LOCKER|VOTE_TREASURY|LAUNCH_ROUTER|TOPAZ_ROUTER|TOPAZ_ROUTER_ADAPTER)_ADDRESS_(56|97)|VITE_TOPAZ_(FACTORY|FACTORY_REGISTRY|WBNB|POOL_IMPLEMENTATION)_ADDRESS_(56|97))$/;

function hasArg(name) {
  return process.argv.includes(name);
}

function resolveTarget(rawTarget) {
  const raw = String(rawTarget || process.env.HARDHAT_NETWORK || "bscTestnet").trim();
  if (NETWORK_BY_CHAIN_ID.has(raw)) return NETWORK_BY_CHAIN_ID.get(raw);
  return raw;
}

function parseEnv(content) {
  const pairs = [];
  const index = new Map();
  const lines = content ? content.split(/\r?\n/) : [];

  lines.forEach((raw, lineIndex) => {
    const trimmed = raw.trim();
    const eq = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    const item = { key, value, lineIndex };
    pairs.push(item);
    index.set(key, item);
  });

  return { lines, pairs, index };
}

function parsePairs(content, sourceLabel) {
  const out = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) throw new Error(`${sourceLabel}: invalid env line: ${rawLine}`);
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    out.set(key, value);
  }
  return out;
}

function validateGeneratedEnv(values, sourceLabel) {
  const errors = [];
  for (const [key, value] of values) {
    if (ADDRESS_ENV_RE.test(key) && !ADDRESS_RE.test(value)) {
      errors.push(`${sourceLabel}: ${key} must be a 20-byte 0x address, got ${value || "blank"}.`);
    }
    if (/PANCAKE/i.test(key)) {
      errors.push(`${sourceLabel}: remove stale ${key}; use Topaz router envs.`);
    }
  }
  if (!values.has("VITE_FACTORY_ADDRESS_97") && !values.has("VITE_FACTORY_ADDRESS_56")) {
    errors.push(`${sourceLabel}: generated env is missing VITE_FACTORY_ADDRESS_<chainId>.`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function renderUpdatedEnv(existingContent, updates) {
  const parsed = parseEnv(existingContent);
  const lines = parsed.lines.length ? [...parsed.lines] : [];
  const appended = [];

  for (const [key, value] of updates) {
    const existing = parsed.index.get(key);
    if (existing) {
      lines[existing.lineIndex] = `${key}=${value}`;
    } else {
      appended.push(`${key}=${value}`);
    }
  }

  if (appended.length) {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push("# Generated launchpad contract env - managed by npm run frontend:apply-env:bsc-testnet");
    lines.push(...appended);
  }

  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

function main() {
  const target = resolveTarget(process.argv[2]);
  const root = path.resolve(__dirname, "..");
  const generatedFile = process.env.FRONTEND_ENV_FILE
    ? path.resolve(process.env.FRONTEND_ENV_FILE)
    : path.join(root, "deployments", `${target}.frontend.env`);
  const localEnvFile = process.env.FRONTEND_LOCAL_ENV_FILE
    ? path.resolve(process.env.FRONTEND_LOCAL_ENV_FILE)
    : path.join(root, "frontend", ".env.local");
  const enableDirectDeploy = hasArg("--enable-direct-deploy");
  const disableDirectDeploy = hasArg("--disable-direct-deploy");

  if (enableDirectDeploy && disableDirectDeploy) {
    throw new Error("Choose only one of --enable-direct-deploy or --disable-direct-deploy.");
  }
  if (!fs.existsSync(generatedFile)) {
    throw new Error(`Generated frontend env not found: ${generatedFile}. Run npm run frontend:env:${target === "bscTestnet" ? "bsc-testnet" : target} first.`);
  }

  const generated = fs.readFileSync(generatedFile, "utf8");
  const generatedPairs = parsePairs(generated, generatedFile);
  validateGeneratedEnv(generatedPairs, generatedFile);

  const updates = new Map(generatedPairs);
  updates.set("VITE_ENABLE_DIRECT_BNB_DEPLOY", enableDirectDeploy ? "true" : "false");

  const existing = fs.existsSync(localEnvFile) ? fs.readFileSync(localEnvFile, "utf8") : "";
  if (existing && !hasArg("--no-backup")) {
    const backupFile = `${localEnvFile}.backup-${timestamp()}`;
    fs.copyFileSync(localEnvFile, backupFile);
    console.log(`[frontend-env-apply] Backup: ${backupFile}`);
  }

  fs.mkdirSync(path.dirname(localEnvFile), { recursive: true });
  fs.writeFileSync(localEnvFile, renderUpdatedEnv(existing, updates));

  console.log(`[frontend-env-apply] Source: ${generatedFile}`);
  console.log(`[frontend-env-apply] Target: ${localEnvFile}`);
  console.log(`[frontend-env-apply] Applied ${updates.size} value(s).`);
  console.log(`[frontend-env-apply] VITE_ENABLE_DIRECT_BNB_DEPLOY=${updates.get("VITE_ENABLE_DIRECT_BNB_DEPLOY")}`);
  if (!enableDirectDeploy) {
    console.log("[frontend-env-apply] Direct deploy remains locked. Re-run with --enable-direct-deploy after funded testnet QA/sign-off.");
  }
}

try {
  main();
} catch (error) {
  console.error(`[frontend-env-apply] error: ${error.message}`);
  process.exit(1);
}
