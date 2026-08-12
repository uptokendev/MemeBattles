"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_IDL = path.join(ROOT, "target/idl/memewarzone_solana.json");
const DEFAULT_BINARY = path.join(ROOT, "target/deploy/memewarzone_solana.so");
const DEFAULT_FRONTEND_ENV = path.join(ROOT, "frontend/.env.local");

function fail(message) {
  throw new Error(`[solana-backend-artifacts] ${message}`);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function parseEnvFile(filePath) {
  const values = new Map();
  if (!filePath || !fs.existsSync(filePath)) return values;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, ""));
  }
  return values;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeHash(value, label) {
  const normalized = String(value || "").trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) fail(`${label} is missing or is not a 32-byte SHA-256 hex value`);
  return normalized;
}

async function main() {
  if (!fs.existsSync(DEFAULT_IDL)) fail(`generated IDL missing: ${DEFAULT_IDL}`);
  if (!fs.existsSync(DEFAULT_BINARY)) fail(`program binary missing: ${DEFAULT_BINARY}`);

  const frontendEnvPath = path.resolve(process.env.SOLANA_FRONTEND_ENV_FILE || DEFAULT_FRONTEND_ENV);
  const frontendEnv = parseEnvFile(frontendEnvPath);
  const backendEnv = process.env.SOLANA_BACKEND_ENV_FILE
    ? parseEnvFile(path.resolve(process.env.SOLANA_BACKEND_ENV_FILE))
    : new Map();
  const healthUrl = firstNonEmpty(
    process.env.SOLANA_AUTH_HEALTHCHECK_URL,
    frontendEnv.get("SOLANA_AUTH_HEALTHCHECK_URL"),
    backendEnv.get("SOLANA_AUTH_HEALTHCHECK_URL"),
  );
  if (!healthUrl) fail("SOLANA_AUTH_HEALTHCHECK_URL is required");

  const localIdlSha256 = sha256Hex(fs.readFileSync(DEFAULT_IDL, "utf8"));
  const localProgramSha256 = sha256Hex(fs.readFileSync(DEFAULT_BINARY));

  const response = await fetch(healthUrl, { headers: { accept: "application/json" } });
  const bodyText = await response.text();
  if (!response.ok) fail(`backend auth health ${healthUrl} returned HTTP ${response.status}`);
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    fail(`backend auth health ${healthUrl} did not return JSON`);
  }
  if (body?.healthy === false) {
    const details = Array.isArray(body?.missingOrInvalid) ? `: ${body.missingOrInvalid.join(", ")}` : "";
    fail(`backend auth health reported healthy=false${details}`);
  }

  const backendIdlSha256 = normalizeHash(
    firstNonEmpty(body?.idlSha256, body?.data?.idlSha256),
    "backend health idlSha256",
  );
  const backendProgramSha256 = normalizeHash(
    firstNonEmpty(body?.programSha256, body?.programBinarySha256, body?.data?.programSha256),
    "backend health programSha256",
  );

  assert.equal(backendIdlSha256, localIdlSha256, "Railway IDL SHA-256 does not match local generated IDL");
  assert.equal(backendProgramSha256, localProgramSha256, "Railway program SHA-256 does not match local program artifact");

  console.log("[solana-backend-artifacts] PASS");
  console.log(`Auth health: ${healthUrl}`);
  console.log(`IDL SHA-256: ${localIdlSha256}`);
  console.log(`Program SHA-256: ${localProgramSha256}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
