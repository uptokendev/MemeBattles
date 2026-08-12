"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_FRONTEND_ENV = path.join(ROOT, "frontend/.env.local");
const DEFAULT_IDL = path.join(ROOT, "target/idl/memewarzone_solana.json");
const DEFAULT_BINARY = path.join(ROOT, "target/deploy/memewarzone_solana.so");
const DEFAULT_MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v1.json");

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function parseEnvFile(filePath) {
  const values = new Map();
  if (!filePath || !fs.existsSync(filePath)) return { exists: false, path: filePath || null, values };
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, ""));
  }
  return { exists: true, path: filePath, values };
}

function printList(label, items) {
  console.log(`\n${label}`);
  if (!items.length) {
    console.log("  (none)");
    return;
  }
  for (const item of items) console.log(`  - ${item}`);
}

function inspectPrerequisites(env = process.env) {
  const blockers = [];
  const warnings = [];
  const satisfied = [];

  const frontendEnvPath = path.resolve(env.SOLANA_FRONTEND_ENV_FILE || DEFAULT_FRONTEND_ENV);
  const backendEnvPath = env.SOLANA_BACKEND_ENV_FILE ? path.resolve(env.SOLANA_BACKEND_ENV_FILE) : null;
  const frontendEnv = parseEnvFile(frontendEnvPath);
  const backendEnv = parseEnvFile(backendEnvPath);

  for (const [label, filePath] of [
    ["generated IDL", DEFAULT_IDL],
    ["exact deployed program artifact", DEFAULT_BINARY],
    ["generation source manifest", DEFAULT_MANIFEST],
  ]) {
    if (fs.existsSync(filePath)) satisfied.push(`${label}: ${path.relative(ROOT, filePath)}`);
    else blockers.push(`${label} is missing: ${filePath}`);
  }

  const upgradeAuthority = firstNonEmpty(env.SOLANA_UPGRADE_AUTHORITY_PUBLIC_KEY);
  if (upgradeAuthority) satisfied.push("SOLANA_UPGRADE_AUTHORITY_PUBLIC_KEY is pinned");
  else blockers.push("SOLANA_UPGRADE_AUTHORITY_PUBLIC_KEY is required (public key only; use 'none' only for an intentionally immutable program)");

  const frontendProgramId = firstNonEmpty(
    env.VITE_SOLANA_LAUNCHPAD_PROGRAM_ID,
    env.SOLANA_FRONTEND_PROGRAM_ID,
    frontendEnv.values.get("VITE_SOLANA_LAUNCHPAD_PROGRAM_ID"),
  );
  if (frontendProgramId) satisfied.push(`frontend program ID proof is present (${frontendEnv.exists ? path.relative(ROOT, frontendEnv.path) : "process env"})`);
  else blockers.push(`frontend program ID proof is required: set VITE_SOLANA_LAUNCHPAD_PROGRAM_ID / SOLANA_FRONTEND_PROGRAM_ID or add VITE_SOLANA_LAUNCHPAD_PROGRAM_ID to ${frontendEnvPath}`);

  const authHealthUrl = firstNonEmpty(
    env.SOLANA_AUTH_HEALTHCHECK_URL,
    frontendEnv.values.get("SOLANA_AUTH_HEALTHCHECK_URL"),
    backendEnv.values.get("SOLANA_AUTH_HEALTHCHECK_URL"),
  );
  if (authHealthUrl) satisfied.push(`backend auth-health URL is configured: ${authHealthUrl}`);
  else blockers.push("SOLANA_AUTH_HEALTHCHECK_URL is required for deployed-backend verification; use the deployed Frontend API /api/solana/trade-status route after it contains the S0 public health fields");

  const backendProgramId = firstNonEmpty(
    env.SOLANA_BACKEND_PROGRAM_ID,
    backendEnv.values.get("SOLANA_LAUNCHPAD_PROGRAM_ID"),
  );
  const backendRouteSigner = firstNonEmpty(backendEnv.values.get("SOLANA_ROUTE_SIGNER_PUBLIC_KEY"));
  const backendManifestHash = firstNonEmpty(
    env.SOLANA_GENERATION_MANIFEST_HASH,
    backendEnv.values.get("SOLANA_GENERATION_MANIFEST_HASH"),
  );

  if (backendEnvPath && !backendEnv.exists) blockers.push(`SOLANA_BACKEND_ENV_FILE does not exist: ${backendEnvPath}`);
  if (backendProgramId) satisfied.push("backend program ID proof is available from local backend-public env evidence");
  else if (authHealthUrl) warnings.push("backend program ID must be exposed by the auth-health response as programId; the upgraded /api/solana/trade-status route does this");
  else blockers.push("backend program ID proof is missing");

  if (backendRouteSigner) satisfied.push("backend route-signer proof is available from SOLANA_BACKEND_ENV_FILE");
  else if (authHealthUrl) warnings.push("backend route signer must be exposed by the auth-health response as routeSigner; the upgraded /api/solana/trade-status route does this after Railway deploys the current branch");
  else blockers.push("backend route-signer proof is missing; provide SOLANA_BACKEND_ENV_FILE with SOLANA_ROUTE_SIGNER_PUBLIC_KEY or an auth-health endpoint that exposes routeSigner");

  if (backendManifestHash) satisfied.push("backend/on-chain manifest commitment proof is configured");
  else if (authHealthUrl) warnings.push("backend generation commitment must be exposed by the auth-health response as manifestHash; the upgraded /api/solana/trade-status route does this");
  else blockers.push("backend generation commitment proof is missing");

  if (!firstNonEmpty(env.SOLANA_RPC_URL)) warnings.push("SOLANA_RPC_URL is not pinned locally; verifier will fall back to https://api.devnet.solana.com");
  if (!firstNonEmpty(env.SOLANA_LAUNCHPAD_PROGRAM_ID)) warnings.push("SOLANA_LAUNCHPAD_PROGRAM_ID is not pinned locally; verifier will fall back to IDL/source identity");
  if (!firstNonEmpty(env.SOLANA_PROGRAMDATA_ADDRESS)) warnings.push("SOLANA_PROGRAMDATA_ADDRESS is not pinned (optional stronger deployment-identity lock)");
  if (!firstNonEmpty(env.SOLANA_DEPLOYMENT_SLOT)) warnings.push("SOLANA_DEPLOYMENT_SLOT is not pinned (optional stronger deployment-identity lock)");
  if (!firstNonEmpty(env.SOLANA_LAUNCHPAD_IDL_SHA256)) warnings.push("SOLANA_LAUNCHPAD_IDL_SHA256 is not pinned locally; copy the public Railway value to verify it against the local IDL");
  if (!firstNonEmpty(env.SOLANA_LAUNCHPAD_PROGRAM_SHA256)) warnings.push("SOLANA_LAUNCHPAD_PROGRAM_SHA256 is not pinned locally; copy the public Railway value to verify it against the exact deployed binary");
  if (!firstNonEmpty(env.SOLANA_ROUTE_SIGNER_PUBLIC_KEY) && !backendRouteSigner) warnings.push("SOLANA_ROUTE_SIGNER_PUBLIC_KEY is not pinned locally; on-chain route signer will be observed rather than compared to an explicit local public key");

  warnings.push("Railway live create/trade readiness requires SOLANA_CLUSTER, SOLANA_CREATE_AUTH_ENABLED=true, SOLANA_TRADE_AUTH_ENABLED=true, SOLANA_CLUSTER_HASH_HEX, SOLANA_ROUTE_SIGNER_SECRET_KEY matching SOLANA_ROUTE_SIGNER_PUBLIC_KEY, SOLANA_LAUNCHPAD_IDL_SHA256, and SOLANA_LAUNCHPAD_PROGRAM_SHA256. The upgraded public /api/solana/trade-status checks these without returning secret material. Never copy SOLANA_ROUTE_SIGNER_SECRET_KEY into this local verifier.");

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    satisfied,
    resolved: {
      frontendEnvPath,
      frontendEnvExists: frontendEnv.exists,
      backendEnvPath,
      backendEnvExists: backendEnv.exists,
      authHealthUrl: authHealthUrl || null,
    },
  };
}

function main() {
  const result = inspectPrerequisites(process.env);
  console.log("[verify-solana-devnet] prerequisite audit");
  printList("Satisfied", result.satisfied);
  printList("Blockers", result.blockers);
  printList("Warnings / stronger pins", result.warnings);
  if (!result.ok) {
    console.error(`\n[verify-solana-devnet] PRECHECK FAIL: ${result.blockers.length} blocker(s) must be resolved before live verification.`);
    process.exitCode = 1;
    return;
  }
  console.log("\n[verify-solana-devnet] PRECHECK PASS");
}

if (require.main === module) main();

module.exports = { inspectPrerequisites };
