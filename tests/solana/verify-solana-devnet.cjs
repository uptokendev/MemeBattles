"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const COMPAT_PRELOAD = path.join(__dirname, "web3-loader-compat.cjs");
const IDENTITY_OUTPUT = path.join(ROOT, "deployments/solana-devnet.deployment-identity.json");
const PROTOCOL_OUTPUT = path.join(ROOT, "deployments/solana-devnet.protocol-state.json");
const CURRENT_OUTPUT = path.join(ROOT, "deployments/solana-devnet.current.json");
const GENERATION_MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v1.json");

function fail(message) {
  throw new Error(`[verify-solana-devnet] ${message}`);
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} not found: ${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function runNodeScript(script, args, env, stdio = "inherit") {
  return spawnSync(process.execPath, ["-r", COMPAT_PRELOAD, script, ...args], {
    cwd: ROOT,
    env,
    stdio,
  });
}

function runCheck(label, script, args, env, options = {}) {
  console.log(`\n[verify-solana-devnet] ${label}`);
  const result = runNodeScript(script, args, env);
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    if (options.diagnosticScript) {
      const diagnostic = runNodeScript(options.diagnosticScript, [], env);
      if (diagnostic.error) {
        console.error(`[verify-solana-devnet] diagnostic could not start: ${diagnostic.error.message}`);
      }
    }
    fail(`${label} failed with exit code ${result.status}`);
  }
}

function sameText(actual, expected, label) {
  assert.equal(String(actual || "").toLowerCase(), String(expected || "").toLowerCase(), `${label} mismatch`);
}

function requireSmokeReadyPauseFlags(flags) {
  assert.equal(flags.paused, false, "global pause must be off");
  assert.equal(flags.createPaused, false, "create must be unpaused");
  assert.equal(flags.buyPaused, false, "buy must be unpaused");
  assert.equal(flags.sellPaused, false, "sell must be unpaused");
}

function main() {
  const strictEnv = {
    ...process.env,
    SOLANA_EXPECT_PAUSED: "false",
    SOLANA_EXPECT_CREATE_PAUSED: "false",
    SOLANA_EXPECT_BUY_PAUSED: "false",
    SOLANA_EXPECT_SELL_PAUSED: "false",
  };

  runCheck(
    "1/2 deployed program identity",
    path.join(__dirname, "devnet-deployment-identity.cjs"),
    [],
    strictEnv,
  );
  runCheck(
    "2/2 protocol/generation state",
    path.join(__dirname, "devnet-protocol-verify.cjs"),
    [],
    strictEnv,
    { diagnosticScript: path.join(__dirname, "devnet-generation-manifest-diagnose.cjs") },
  );

  const identity = readJson(IDENTITY_OUTPUT, "deployment identity evidence");
  const protocol = readJson(PROTOCOL_OUTPUT, "protocol state evidence");
  const generation = readJson(GENERATION_MANIFEST, "generation manifest");

  sameText(identity.programId, protocol.programId, "program ID across deployment/protocol evidence");
  sameText(identity.localProgramSha256, protocol.programSha256, "program SHA-256 across deployment/protocol evidence");
  sameText(identity.deployedProgramSha256, protocol.programSha256, "deployed program SHA-256");
  requireSmokeReadyPauseFlags(protocol.expectedPauseFlags || {});

  const frontendProgramId = protocol.envAgreement?.frontendProgramId || null;
  if (!frontendProgramId) {
    fail("frontend program ID was not verified; provide VITE_SOLANA_LAUNCHPAD_PROGRAM_ID or a frontend env file");
  }
  sameText(frontendProgramId, protocol.programId, "frontend/program ID");

  if (!protocol.authHealth) {
    fail("backend auth health was not verified; set SOLANA_AUTH_HEALTHCHECK_URL to the deployed Solana auth/status endpoint");
  }
  const backendProgramId = protocol.envAgreement?.backendProgramId || protocol.authHealth?.programId || null;
  if (!backendProgramId) {
    fail("backend program ID was not verified; provide a backend env file or expose programId from the auth health endpoint");
  }
  sameText(backendProgramId, protocol.programId, "backend/program ID");

  const backendRouteSigner = protocol.envAgreement?.backendRouteSigner || protocol.authHealth?.routeSigner || null;
  if (!backendRouteSigner) {
    fail("backend route signer was not verified; provide a backend env file or expose routeSigner from the auth health endpoint");
  }
  sameText(backendRouteSigner, protocol.authorities?.routeSigner, "backend/route signer");

  const backendManifestHash = protocol.envAgreement?.backendManifestHash || protocol.authHealth?.manifestHash || null;
  if (!backendManifestHash) {
    fail("backend generation manifest hash was not verified; provide a backend env file or expose manifestHash from the auth health endpoint");
  }
  sameText(backendManifestHash, protocol.generationManifestSha256, "backend/generation manifest hash");

  const canonical = {
    schemaVersion: 1,
    status: "verified_smoke_ready",
    network: "solana-devnet",
    cluster: "devnet",
    verifiedAt: new Date().toISOString(),
    rpc: {
      url: protocol.rpcUrl,
      version: protocol.rpcVersion,
    },
    program: {
      id: protocol.programId,
      sha256: identity.deployedProgramSha256,
      idlSha256: protocol.idlSha256,
      executable: identity.executable,
      loader: identity.loader,
      programDataAddress: identity.programDataAddress,
      deploymentSlot: identity.deploymentSlot,
      upgradeAuthority: identity.upgradeAuthority,
      localArtifactBytes: identity.localProgramBytes,
      programDataCapacityBytes: identity.programDataCapacityBytes,
    },
    protocol: {
      globalConfig: protocol.accounts?.globalConfig || null,
      generationConfig: protocol.accounts?.generationConfig || null,
      clusterProfile: protocol.accounts?.clusterProfile || null,
      generationIdHex: protocol.generationIdHex,
      generationManifest: protocol.generationManifest,
      generationManifestSha256: protocol.generationManifestSha256,
      securityDefaultsLocked: protocol.securityDefaultsLocked,
      pauseFlags: protocol.expectedPauseFlags,
    },
    generation: {
      name: generation.name || null,
      generationIdSeed: generation.generationIdSeed,
      riskClusterIdSeed: generation.riskClusterIdSeed,
      settings: generation.settings,
      clusterProfile: generation.clusterProfile,
    },
    authorities: protocol.authorities,
    operator: protocol.operator,
    envAgreement: protocol.envAgreement,
    authHealth: protocol.authHealth,
    evidence: {
      deploymentIdentity: path.relative(ROOT, IDENTITY_OUTPUT),
      protocolState: path.relative(ROOT, PROTOCOL_OUTPUT),
      generationManifest: path.relative(ROOT, GENERATION_MANIFEST),
    },
  };

  fs.mkdirSync(path.dirname(CURRENT_OUTPUT), { recursive: true });
  fs.writeFileSync(CURRENT_OUTPUT, `${JSON.stringify(canonical, null, 2)}\n`, "utf8");

  console.log("\n\x1b[32m[verify-solana-devnet] PASS\x1b[0m");
  console.log(`Canonical deployment manifest: ${CURRENT_OUTPUT}`);
  console.log(`Program: ${canonical.program.id}`);
  console.log(`ProgramData: ${canonical.program.programDataAddress}`);
  console.log(`Deployment slot: ${canonical.program.deploymentSlot}`);
  console.log(`GenerationConfig: ${canonical.protocol.generationConfig}`);
}

try {
  main();
} catch (error) {
  console.error(`\n\x1b[31m[verify-solana-devnet] FAIL\x1b[0m ${error?.message || error}`);
  process.exitCode = 1;
}
