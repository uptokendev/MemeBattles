"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { inspectPrerequisites } = require("./devnet-verification-prereqs.cjs");

const ROOT = path.resolve(__dirname, "../..");
const COMPAT_PRELOAD = path.join(__dirname, "web3-loader-compat.cjs");
const IDENTITY_OUTPUT = path.join(ROOT, "deployments/solana-devnet.deployment-identity.json");
const PROTOCOL_OUTPUT = path.join(ROOT, "deployments/solana-devnet.protocol-state.json");
const CURRENT_OUTPUT = path.join(ROOT, "deployments/solana-devnet.current.json");
const GENERATION_MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v3.json");

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

function printPrerequisiteAudit(result) {
  console.log("\n[verify-solana-devnet] 0/2 prerequisite audit");
  if (result.blockers.length) {
    console.error("Blockers:");
    for (const blocker of result.blockers) console.error(`  - ${blocker}`);
  } else {
    console.log("Blockers: none");
  }
  if (result.warnings.length) {
    console.log("Warnings / stronger pins:");
    for (const warning of result.warnings) console.log(`  - ${warning}`);
  }
}

function collectFinalProofErrors(identity, protocol) {
  const errors = [];
  const frontendProgramId = protocol.envAgreement?.frontendProgramId || null;
  if (!frontendProgramId) {
    errors.push("frontend program ID was not verified; provide VITE_SOLANA_LAUNCHPAD_PROGRAM_ID or a frontend env file");
  } else if (String(frontendProgramId).toLowerCase() !== String(protocol.programId || "").toLowerCase()) {
    errors.push("frontend/program ID mismatch");
  }

  if (!protocol.authHealth) {
    errors.push("backend auth health was not verified; set SOLANA_AUTH_HEALTHCHECK_URL to a deployed Solana auth/status endpoint");
  }

  const backendProgramId = protocol.envAgreement?.backendProgramId || protocol.authHealth?.programId || null;
  if (!backendProgramId) {
    errors.push("backend program ID was not verified; provide SOLANA_BACKEND_PROGRAM_ID, SOLANA_BACKEND_ENV_FILE, or expose programId from auth health");
  } else if (String(backendProgramId).toLowerCase() !== String(protocol.programId || "").toLowerCase()) {
    errors.push("backend/program ID mismatch");
  }

  const backendRouteSigner = protocol.envAgreement?.backendRouteSigner || protocol.authHealth?.routeSigner || null;
  if (!backendRouteSigner) {
    errors.push("backend route signer was not verified; provide SOLANA_BACKEND_ENV_FILE with SOLANA_ROUTE_SIGNER_PUBLIC_KEY or expose routeSigner from auth health");
  } else if (String(backendRouteSigner).toLowerCase() !== String(protocol.authorities?.routeSigner || "").toLowerCase()) {
    errors.push("backend/route signer mismatch");
  }

  const backendManifestHash = protocol.envAgreement?.backendManifestHash || protocol.envAgreement?.configuredManifestHash || protocol.authHealth?.manifestHash || null;
  if (!backendManifestHash) {
    errors.push("backend generation commitment was not verified; provide SOLANA_GENERATION_MANIFEST_HASH, SOLANA_BACKEND_ENV_FILE, or expose manifestHash from auth health");
  }
  if (!protocol.onChainManifestHash) {
    errors.push("protocol evidence is missing the on-chain GenerationConfig.manifestHash commitment");
  } else if (backendManifestHash && String(backendManifestHash).toLowerCase() !== String(protocol.onChainManifestHash).toLowerCase()) {
    errors.push("backend/on-chain generation manifest commitment mismatch");
  }

  if (String(identity.programId || "").toLowerCase() !== String(protocol.programId || "").toLowerCase()) {
    errors.push("program ID differs across deployment/protocol evidence");
  }
  if (String(identity.localProgramSha256 || "").toLowerCase() !== String(protocol.programSha256 || "").toLowerCase()) {
    errors.push("local program SHA-256 differs across deployment/protocol evidence");
  }
  if (String(identity.deployedProgramSha256 || "").toLowerCase() !== String(protocol.programSha256 || "").toLowerCase()) {
    errors.push("deployed program SHA-256 differs from protocol evidence");
  }

  return errors;
}

function main() {
  const strictEnv = {
    ...process.env,
    SOLANA_EXPECT_PAUSED: "false",
    SOLANA_EXPECT_CREATE_PAUSED: "false",
    SOLANA_EXPECT_BUY_PAUSED: "false",
    SOLANA_EXPECT_SELL_PAUSED: "false",
  };

  const prerequisites = inspectPrerequisites(strictEnv);
  printPrerequisiteAudit(prerequisites);
  if (!prerequisites.ok) {
    fail(`prerequisite audit failed with ${prerequisites.blockers.length} blocker(s); resolve the complete list above before rerunning`);
  }

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

  requireSmokeReadyPauseFlags(protocol.expectedPauseFlags || {});
  assert.equal(protocol.semanticGenerationMatchesSource, true, "on-chain generation semantics must match the source manifest");

  const finalProofErrors = collectFinalProofErrors(identity, protocol);
  if (finalProofErrors.length) {
    console.error("\n[verify-solana-devnet] final proof blockers:");
    for (const error of finalProofErrors) console.error(`  - ${error}`);
    fail(`final evidence gate failed with ${finalProofErrors.length} blocker(s); resolve the complete list above before rerunning`);
  }

  const canonical = {
    schemaVersion: 2,
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
      sourceManifestSha256: protocol.sourceManifestSha256 || protocol.generationManifestSha256,
      onChainManifestHash: protocol.onChainManifestHash,
      manifestProvenance: protocol.manifestProvenance,
      semanticGenerationMatchesSource: protocol.semanticGenerationMatchesSource,
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
  console.log(`Source manifest SHA-256: ${canonical.protocol.sourceManifestSha256}`);
  console.log(`On-chain manifest commitment: ${canonical.protocol.onChainManifestHash}`);
  console.log(`Manifest provenance: ${canonical.protocol.manifestProvenance}`);
}

try {
  main();
} catch (error) {
  console.error(`\n\x1b[31m[verify-solana-devnet] FAIL\x1b[0m ${error?.message || error}`);
  process.exitCode = 1;
}
