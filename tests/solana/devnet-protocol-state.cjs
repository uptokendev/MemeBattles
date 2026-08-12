"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const anchor = require("@coral-xyz/anchor");
const {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  Keypair,
  PublicKey,
  SystemProgram,
} = require("@solana/web3.js");

const { AnchorProvider, BN, Program, Wallet } = anchor;
const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_RPC = "https://api.devnet.solana.com";
const DEFAULT_MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v1.json");
const DEFAULT_IDL = path.join(ROOT, "target/idl/memewarzone_solana.json");
const DEFAULT_OUTPUT = path.join(ROOT, "deployments/solana-devnet.protocol-state.json");
const DEFAULT_ANCHOR_TOML = path.join(ROOT, "Anchor.toml");
const DEFAULT_PROGRAM_SOURCE = path.join(ROOT, "programs/memewarzone_solana/src/lib.rs");
const DEFAULT_PROGRAM_BINARY = path.join(ROOT, "target/deploy/memewarzone_solana.so");
const DEFAULT_FRONTEND_ENV = path.join(ROOT, "frontend/.env.local");

function fail(message) {
  throw new Error(`[solana-devnet-state] ${message}`);
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function readText(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} not found: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readText(filePath, label));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseEnvFile(content) {
  const values = new Map();
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, ""));
  }
  return values;
}

function readEnvFileIfExists(filePath) {
  if (!filePath) return { exists: false, path: null, values: new Map() };
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return { exists: false, path: resolved, values: new Map() };
  return { exists: true, path: resolved, values: parseEnvFile(fs.readFileSync(resolved, "utf8")) };
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function hash32(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fixed32(value) {
  const buffer = Buffer.from(value);
  assert.equal(buffer.length, 32, "bytes32 value must contain 32 bytes");
  return Array.from(buffer);
}

function hex32(value) {
  return Buffer.from(value).toString("hex");
}

function bigint(value) {
  if (typeof value === "bigint") return value;
  return BigInt(value.toString());
}

function parseArgs(argv) {
  const options = {
    mode: "verify",
    manifest: DEFAULT_MANIFEST,
    idl: DEFAULT_IDL,
    output: DEFAULT_OUTPUT,
    allowPauseReset: false,
    frontendEnv: process.env.SOLANA_FRONTEND_ENV_FILE || DEFAULT_FRONTEND_ENV,
    backendEnv: process.env.SOLANA_BACKEND_ENV_FILE || null,
    authHealthUrl: process.env.SOLANA_AUTH_HEALTHCHECK_URL || "",
    skipAuthHealth: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "bootstrap" || arg === "verify") options.mode = arg;
    else if (arg === "--manifest") options.manifest = path.resolve(argv[++index]);
    else if (arg === "--idl") options.idl = path.resolve(argv[++index]);
    else if (arg === "--output") options.output = path.resolve(argv[++index]);
    else if (arg === "--allow-pause-reset") options.allowPauseReset = true;
    else if (arg === "--frontend-env") options.frontendEnv = argv[++index];
    else if (arg === "--backend-env") options.backendEnv = argv[++index];
    else if (arg === "--auth-health-url") options.authHealthUrl = argv[++index];
    else if (arg === "--skip-auth-health") options.skipAuthHealth = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function loadKeypair(filePath) {
  const secret = readJson(filePath, "operator keypair");
  if (!Array.isArray(secret)) fail("operator keypair must be a Solana JSON byte array");
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function publicKeyEnv(name, fallback) {
  const raw = String(process.env[name] || fallback || "").trim();
  if (!raw) fail(`${name} is required`);
  return new PublicKey(raw);
}

function derivePda(programId, ...seeds) {
  return PublicKey.findProgramAddressSync(seeds.map((seed) => Buffer.from(seed)), programId)[0];
}

function sameKey(actual, expected, label) {
  assert.ok(new PublicKey(actual).equals(new PublicKey(expected)), `${label} mismatch`);
}

function sameBytes(actual, expected, label) {
  assert.deepEqual(Buffer.from(actual), Buffer.from(expected), `${label} mismatch`);
}

function sameNumber(actual, expected, label) {
  assert.equal(Number(actual), Number(expected), `${label} mismatch`);
}

function sameBigint(actual, expected, label) {
  assert.equal(bigint(actual), BigInt(expected), `${label} mismatch`);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function parseBool(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  fail(`Invalid boolean value: ${value}`);
}

function parseSourceProgramId(source) {
  const match = source.match(/declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/);
  if (!match) fail("declare_id! program ID is missing");
  return match[1];
}

function parseAnchorProgramId(anchorToml, network) {
  const pattern = new RegExp(`\\[programs\\.${network}\\][\\s\\S]*?memewarzone_solana\\s*=\\s*\"([1-9A-HJ-NP-Za-km-z]+)\"`);
  const match = anchorToml.match(pattern);
  if (!match) fail(`Anchor.toml ${network} program ID is missing`);
  return match[1];
}

async function accountOrNull(fetcher, address) {
  try {
    return await fetcher(address);
  } catch (error) {
    if (/Account does not exist|could not find account|AccountNotFound/i.test(String(error?.message || error))) return null;
    throw error;
  }
}

function generationArgs(manifest, manifestHash) {
  const settings = manifest.settings;
  return {
    generationId: fixed32(hash32(manifest.generationIdSeed)),
    clusterKind: settings.clusterKind,
    allowedGraduationTierMask: settings.allowedGraduationTierMask,
    economicsVersion: settings.economicsVersion,
    curveKind: settings.curveKind,
    tokenTotalSupply: new BN(settings.tokenTotalSupply),
    tokenDecimals: settings.tokenDecimals,
    curveSupplyBps: settings.curveSupplyBps,
    liquidityTokenBps: settings.liquidityTokenBps,
    basePriceLamports: new BN(settings.basePriceLamports),
    priceSlopeLamports: new BN(settings.priceSlopeLamports),
    buyFeeBps: settings.buyFeeBps,
    sellFeeBps: settings.sellFeeBps,
    finalizeFeeBps: settings.finalizeFeeBps,
    creatorPostFinalizeBps: settings.creatorPostFinalizeBps,
    liquidityPostFinalizeBps: settings.liquidityPostFinalizeBps,
    dexAdapter: settings.dexAdapter,
    tradeRouteProfile: fixed32(hash32(settings.tradeRouteProfileSeed)),
    finalizeRouteProfile: fixed32(hash32(settings.finalizeRouteProfileSeed)),
    treasuryProfile: fixed32(hash32(settings.treasuryProfileSeed)),
    dexProfile: fixed32(hash32(settings.dexProfileSeed)),
    oracleProfile: fixed32(hash32(settings.oracleProfileSeed)),
    activeCreation: settings.activeCreation,
    supportEnabled: settings.supportEnabled,
    manifestHash: fixed32(manifestHash),
    routeAuthorizationRequired: settings.routeAuthorizationRequired,
    authorizedTradingRequired: settings.authorizedTradingRequired,
  };
}

function resolveExpectedPauseFlags(manifestPauseFlags) {
  const expected = { ...manifestPauseFlags };
  if (parseBool(process.env.SOLANA_CREATE_AUTH_ENABLED) === true || parseBool(process.env.DRAFT_PUSH_LIVE_ENABLED) === true) {
    expected.createPaused = false;
  }
  if (parseBool(process.env.SOLANA_TRADE_AUTH_ENABLED) === true) {
    expected.buyPaused = false;
    expected.sellPaused = false;
  }

  const overrides = {
    paused: process.env.SOLANA_EXPECT_PAUSED,
    createPaused: process.env.SOLANA_EXPECT_CREATE_PAUSED,
    buyPaused: process.env.SOLANA_EXPECT_BUY_PAUSED,
    sellPaused: process.env.SOLANA_EXPECT_SELL_PAUSED,
    graduationPaused: process.env.SOLANA_EXPECT_GRADUATION_PAUSED,
    claimsPaused: process.env.SOLANA_EXPECT_CLAIMS_PAUSED,
  };
  for (const [key, value] of Object.entries(overrides)) {
    const parsed = parseBool(value);
    if (parsed !== null) expected[key] = parsed;
  }
  return expected;
}

function verifyGlobal(global, authorities, pauseFlags) {
  sameKey(global.admin, authorities.admin, "GlobalConfig.admin");
  sameKey(global.pauser, authorities.pauser, "GlobalConfig.pauser");
  sameKey(global.tierAdmin, authorities.tierAdmin, "GlobalConfig.tierAdmin");
  sameKey(global.riskAdmin, authorities.riskAdmin, "GlobalConfig.riskAdmin");
  sameKey(global.routeSigner, authorities.routeSigner, "GlobalConfig.routeSigner");
  sameKey(global.rewardOperator, authorities.rewardOperator, "GlobalConfig.rewardOperator");
  sameKey(global.treasuryOperator, authorities.treasuryOperator, "GlobalConfig.treasuryOperator");
  sameKey(global.generationOperator, authorities.generationOperator, "GlobalConfig.generationOperator");
  assert.equal(global.securityDefaultsLocked, true, "security defaults must be locked");
  assert.equal(global.routeAuthorizationRequired, true, "route authorization must remain required");
  assert.equal(global.authorizedTradingRequired, true, "authorized trading must remain required");
  for (const [name, expected] of Object.entries(pauseFlags)) {
    assert.equal(global[name], expected, `GlobalConfig.${name} mismatch`);
  }
}

function verifyGeneration(generation, programId, generationConfig, args) {
  sameBytes(generation.generationId, args.generationId, "GenerationConfig.generationId");
  sameKey(generation.programId, programId, "GenerationConfig.programId");
  sameKey(generation.configPda, generationConfig, "GenerationConfig.configPda");
  for (const field of [
    "clusterKind",
    "allowedGraduationTierMask",
    "economicsVersion",
    "curveKind",
    "tokenDecimals",
    "curveSupplyBps",
    "liquidityTokenBps",
    "buyFeeBps",
    "sellFeeBps",
    "finalizeFeeBps",
    "creatorPostFinalizeBps",
    "liquidityPostFinalizeBps",
    "dexAdapter",
  ]) {
    sameNumber(generation[field], args[field], `GenerationConfig.${field}`);
  }
  for (const field of ["tokenTotalSupply", "basePriceLamports", "priceSlopeLamports"]) {
    sameBigint(generation[field], args[field], `GenerationConfig.${field}`);
  }
  for (const field of ["tradeRouteProfile", "finalizeRouteProfile", "treasuryProfile", "dexProfile", "oracleProfile", "manifestHash"]) {
    sameBytes(generation[field], args[field], `GenerationConfig.${field}`);
  }
  assert.equal(generation.activeCreation, args.activeCreation, "GenerationConfig.activeCreation mismatch");
  assert.equal(generation.supportEnabled, args.supportEnabled, "GenerationConfig.supportEnabled mismatch");
  assert.equal(generation.routeAuthorizationRequired, true, "generation route authorization must be required");
  assert.equal(generation.authorizedTradingRequired, true, "generation authorized trading must be required");
}

async function verifyProgramAccount(connection, programId) {
  const rpcVersion = await connection.getVersion();
  const info = await connection.getAccountInfo(programId, "confirmed");
  if (!info) fail(`Program account ${programId.toBase58()} is missing`);
  assert.equal(info.executable, true, "program account must be executable");
  sameKey(info.owner, BPF_LOADER_UPGRADEABLE_PROGRAM_ID, "program owner");
  return {
    rpcVersion,
    executable: info.executable,
    owner: info.owner.toBase58(),
    lamports: info.lamports,
  };
}

async function verifyAuthHealth(url, expected) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const bodyText = await response.text();
  if (!response.ok) fail(`backend auth health check ${url} returned ${response.status}`);

  let parsed = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }

  if (parsed && parsed.healthy === false) fail(`backend auth health check ${url} reported healthy=false`);

  const reportedProgramId = firstNonEmpty(
    parsed?.programId,
    parsed?.solanaProgramId,
    parsed?.launchpadProgramId,
    parsed?.data?.programId,
  );
  if (reportedProgramId) sameKey(reportedProgramId, expected.programId, "backend health program ID");

  const reportedRouteSigner = firstNonEmpty(
    parsed?.routeSigner,
    parsed?.routeSignerPublicKey,
    parsed?.data?.routeSigner,
  );
  if (reportedRouteSigner) sameKey(reportedRouteSigner, expected.routeSigner, "backend health route signer");

  const reportedManifestHash = firstNonEmpty(
    parsed?.manifestHash,
    parsed?.generationManifestHash,
    parsed?.data?.manifestHash,
  );
  if (reportedManifestHash) {
    assert.equal(reportedManifestHash.toLowerCase(), expected.manifestHash, "backend health manifest hash mismatch");
  }

  return {
    url,
    status: response.status,
    programId: reportedProgramId || null,
    routeSigner: reportedRouteSigner || null,
    manifestHash: reportedManifestHash ? reportedManifestHash.toLowerCase() : null,
    json: Boolean(parsed),
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const manifest = readJson(options.manifest, "generation manifest");
  const idlText = readText(options.idl, "generated IDL");
  const idl = JSON.parse(idlText);
  const manifestHash = hash32(canonicalJson(manifest));
  const manifestHashHex = manifestHash.toString("hex");
  const idlHashHex = sha256Hex(idlText);

  const anchorToml = readText(DEFAULT_ANCHOR_TOML, "Anchor.toml");
  const programSource = readText(DEFAULT_PROGRAM_SOURCE, "program source");
  const declaredProgramId = parseSourceProgramId(programSource);
  const anchorLocalnetProgramId = parseAnchorProgramId(anchorToml, "localnet");
  const anchorDevnetProgramId = parseAnchorProgramId(anchorToml, "devnet");

  const configuredProgramId = publicKeyEnv(
    "SOLANA_LAUNCHPAD_PROGRAM_ID",
    firstNonEmpty(idl.address, declaredProgramId),
  );
  sameKey(declaredProgramId, configuredProgramId, "declare_id! program ID");
  sameKey(anchorLocalnetProgramId, configuredProgramId, "Anchor.toml localnet program ID");
  sameKey(anchorDevnetProgramId, configuredProgramId, "Anchor.toml devnet program ID");
  if (idl.address) sameKey(idl.address, configuredProgramId, "IDL metadata address");

  const configuredManifestHash = firstNonEmpty(process.env.SOLANA_GENERATION_MANIFEST_HASH);
  if (configuredManifestHash) {
    assert.equal(configuredManifestHash.toLowerCase(), manifestHashHex, "configured manifest hash mismatch");
  }

  const configuredIdlHash = firstNonEmpty(process.env.SOLANA_LAUNCHPAD_IDL_SHA256);
  if (configuredIdlHash) {
    assert.equal(configuredIdlHash.toLowerCase(), idlHashHex, "configured IDL hash mismatch");
  }

  const configuredProgramHash = firstNonEmpty(process.env.SOLANA_LAUNCHPAD_PROGRAM_SHA256);
  let localProgramHash = null;
  if (fs.existsSync(DEFAULT_PROGRAM_BINARY)) {
    localProgramHash = sha256Hex(fs.readFileSync(DEFAULT_PROGRAM_BINARY));
  } else if (configuredProgramHash) {
    fail(`program binary not found: ${DEFAULT_PROGRAM_BINARY}`);
  }
  if (configuredProgramHash && localProgramHash) {
    assert.equal(configuredProgramHash.toLowerCase(), localProgramHash, "configured program binary hash mismatch");
  }

  const frontendEnv = readEnvFileIfExists(options.frontendEnv);
  const backendEnv = readEnvFileIfExists(options.backendEnv);

  const frontendProgramId = firstNonEmpty(
    process.env.VITE_SOLANA_LAUNCHPAD_PROGRAM_ID,
    process.env.SOLANA_FRONTEND_PROGRAM_ID,
    frontendEnv.values.get("VITE_SOLANA_LAUNCHPAD_PROGRAM_ID"),
  );
  if (frontendProgramId) sameKey(frontendProgramId, configuredProgramId, "frontend program ID");

  const backendProgramId = firstNonEmpty(
    process.env.SOLANA_BACKEND_PROGRAM_ID,
    backendEnv.values.get("SOLANA_LAUNCHPAD_PROGRAM_ID"),
  );
  if (backendProgramId) sameKey(backendProgramId, configuredProgramId, "backend program ID");

  const backendRouteSigner = firstNonEmpty(backendEnv.values.get("SOLANA_ROUTE_SIGNER_PUBLIC_KEY"));
  const backendManifestHash = firstNonEmpty(backendEnv.values.get("SOLANA_GENERATION_MANIFEST_HASH"));
  if (backendManifestHash) {
    assert.equal(backendManifestHash.toLowerCase(), manifestHashHex, "backend env manifest hash mismatch");
  }

  const rpcUrl = String(process.env.SOLANA_RPC_URL || DEFAULT_RPC).trim();
  const operatorPath = requiredEnv("SOLANA_OPERATOR_KEYPAIR");
  const operator = loadKeypair(operatorPath);
  const provider = new AnchorProvider(new anchor.web3.Connection(rpcUrl, "confirmed"), new Wallet(operator), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program(idl, provider);
  sameKey(program.programId, configuredProgramId, "Anchor Program program ID");

  const authorities = {
    admin: publicKeyEnv("SOLANA_ADMIN_PUBLIC_KEY", operator.publicKey),
    pauser: publicKeyEnv("SOLANA_PAUSER_PUBLIC_KEY", operator.publicKey),
    tierAdmin: publicKeyEnv("SOLANA_TIER_ADMIN_PUBLIC_KEY", operator.publicKey),
    riskAdmin: publicKeyEnv("SOLANA_RISK_ADMIN_PUBLIC_KEY", operator.publicKey),
    routeSigner: publicKeyEnv("SOLANA_ROUTE_SIGNER_PUBLIC_KEY"),
    rewardOperator: publicKeyEnv("SOLANA_REWARD_OPERATOR_PUBLIC_KEY", operator.publicKey),
    treasuryOperator: publicKeyEnv("SOLANA_TREASURY_OPERATOR_PUBLIC_KEY", operator.publicKey),
    generationOperator: publicKeyEnv("SOLANA_GENERATION_OPERATOR_PUBLIC_KEY", operator.publicKey),
  };
  sameKey(operator.publicKey, authorities.admin, "operator/admin");
  if (backendRouteSigner) sameKey(backendRouteSigner, authorities.routeSigner, "backend env route signer");

  const programAccount = await verifyProgramAccount(provider.connection, configuredProgramId);

  const generation = generationArgs(manifest, manifestHash);
  const generationId = Buffer.from(generation.generationId);
  const clusterId = hash32(manifest.riskClusterIdSeed);
  const globalConfig = derivePda(configuredProgramId, "global");
  const generationConfig = derivePda(configuredProgramId, "generation", generationId);
  const clusterProfile = derivePda(configuredProgramId, "cluster", clusterId);
  const signatures = [];
  const bootstrapPauseFlags = { ...manifest.pauseFlags };
  const verificationPauseFlags =
    options.mode === "bootstrap" ? bootstrapPauseFlags : resolveExpectedPauseFlags(bootstrapPauseFlags);

  let createdGlobal = false;
  let global = await accountOrNull((address) => program.account.globalConfig.fetch(address), globalConfig);
  if (!global) {
    if (options.mode !== "bootstrap") fail(`GlobalConfig ${globalConfig.toBase58()} is missing; run bootstrap`);
    signatures.push(
      await program.methods
        .initializeGlobalConfig(authorities)
        .accountsStrict({
          admin: operator.publicKey,
          globalConfig,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
    );
    global = await program.account.globalConfig.fetch(globalConfig);
    createdGlobal = true;
  }

  if (!global.securityDefaultsLocked) {
    if (options.mode !== "bootstrap") fail("security defaults are not locked; run bootstrap");
    signatures.push(
      await program.methods
        .lockSecurityDefaults()
        .accountsStrict({ globalConfig, admin: operator.publicKey })
        .rpc(),
    );
  }

  const bootstrapPauseMismatch = Object.entries(bootstrapPauseFlags).some(
    ([name, expected]) => global[name] !== expected,
  );
  if (bootstrapPauseMismatch) {
    if (options.mode !== "bootstrap") {
      // Defer to verifyGlobal so live trading expectations can differ from bootstrap defaults.
    } else if (!createdGlobal && !options.allowPauseReset) {
      fail(
        "pause flags differ from the canonical bootstrap manifest for an already initialized environment. Refusing to reset them automatically. Re-run bootstrap with --allow-pause-reset only when you intentionally want to restore the canonical paused bootstrap state.",
      );
    } else {
      signatures.push(
        await program.methods
          .setPauseFlags(bootstrapPauseFlags)
          .accountsStrict({ globalConfig, authority: operator.publicKey })
          .rpc(),
      );
    }
  }

  let generationState = await accountOrNull(
    (address) => program.account.generationConfig.fetch(address),
    generationConfig,
  );
  if (!generationState) {
    if (options.mode !== "bootstrap") fail(`GenerationConfig ${generationConfig.toBase58()} is missing; run bootstrap`);
    signatures.push(
      await program.methods
        .initializeGenerationConfig(generation)
        .accountsStrict({
          authority: operator.publicKey,
          globalConfig,
          generationConfig,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
    );
    generationState = await program.account.generationConfig.fetch(generationConfig);
  }

  let clusterState = await accountOrNull((address) => program.account.clusterProfile.fetch(address), clusterProfile);
  const clusterUpdate = { clusterId: fixed32(clusterId), ...manifest.clusterProfile };
  const clusterMismatch =
    !clusterState ||
    Buffer.compare(Buffer.from(clusterState.clusterId), clusterId) !== 0 ||
    Number(clusterState.size) !== Number(clusterUpdate.size) ||
    Number(clusterState.riskLevel) !== Number(clusterUpdate.riskLevel) ||
    clusterState.restricted !== clusterUpdate.restricted;
  if (clusterMismatch) {
    if (options.mode !== "bootstrap") {
      fail(`ClusterProfile ${clusterProfile.toBase58()} is missing or mismatched; run bootstrap`);
    }
    signatures.push(
      await program.methods
        .syncClusterProfile(clusterUpdate)
        .accountsStrict({
          authority: operator.publicKey,
          globalConfig,
          clusterProfile,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
    );
    clusterState = await program.account.clusterProfile.fetch(clusterProfile);
  }

  global = await program.account.globalConfig.fetch(globalConfig);
  generationState = await program.account.generationConfig.fetch(generationConfig);
  clusterState = await program.account.clusterProfile.fetch(clusterProfile);

  verifyGlobal(global, authorities, verificationPauseFlags);
  verifyGeneration(generationState, configuredProgramId, generationConfig, generation);
  sameBytes(global.activeGenerationId, generation.generationId, "GlobalConfig.activeGenerationId");
  sameBytes(clusterState.clusterId, clusterId, "ClusterProfile.clusterId");
  sameNumber(clusterState.size, clusterUpdate.size, "ClusterProfile.size");
  sameNumber(clusterState.riskLevel, clusterUpdate.riskLevel, "ClusterProfile.riskLevel");
  assert.equal(clusterState.restricted, clusterUpdate.restricted, "ClusterProfile.restricted mismatch");

  const authHealthUrl = firstNonEmpty(
    options.skipAuthHealth ? "" : options.authHealthUrl,
    backendEnv.values.get("SOLANA_AUTH_HEALTHCHECK_URL"),
    frontendEnv.values.get("SOLANA_AUTH_HEALTHCHECK_URL"),
  );
  const authHealth = authHealthUrl
    ? await verifyAuthHealth(authHealthUrl, {
        programId: configuredProgramId,
        routeSigner: authorities.routeSigner,
        manifestHash: manifestHashHex,
      })
    : null;

  const evidence = {
    schemaVersion: 2,
    status: "verified",
    mode: options.mode,
    verifiedAt: new Date().toISOString(),
    rpcUrl,
    rpcVersion: programAccount.rpcVersion,
    programId: configuredProgramId.toBase58(),
    operator: operator.publicKey.toBase58(),
    generationManifest: path.relative(ROOT, options.manifest),
    generationManifestSha256: manifestHashHex,
    idlSha256: idlHashHex,
    programSha256: localProgramHash,
    staticProgramIds: {
      declareId: declaredProgramId,
      anchorLocalnet: anchorLocalnetProgramId,
      anchorDevnet: anchorDevnetProgramId,
      idlAddress: firstNonEmpty(idl.address) || null,
    },
    accounts: {
      globalConfig: globalConfig.toBase58(),
      generationConfig: generationConfig.toBase58(),
      clusterProfile: clusterProfile.toBase58(),
    },
    programAccount: {
      executable: programAccount.executable,
      owner: programAccount.owner,
      lamports: programAccount.lamports,
    },
    authorities: Object.fromEntries(
      Object.entries(authorities).map(([name, key]) => [name, key.toBase58()]),
    ),
    generationIdHex: hex32(generation.generationId),
    clusterIdHex: clusterId.toString("hex"),
    bootstrapPauseFlags,
    expectedPauseFlags: verificationPauseFlags,
    securityDefaultsLocked: global.securityDefaultsLocked,
    envAgreement: {
      frontendEnvFile: frontendEnv.exists ? path.relative(ROOT, frontendEnv.path) : null,
      frontendProgramId: frontendProgramId || null,
      backendEnvFile: backendEnv.exists ? path.relative(ROOT, backendEnv.path) : null,
      backendProgramId: backendProgramId || null,
      backendManifestHash: backendManifestHash ? backendManifestHash.toLowerCase() : null,
      backendRouteSigner: backendRouteSigner || null,
    },
    authHealth,
    transactionSignatures: signatures,
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Solana devnet protocol state verified: ${options.output}`);
  console.log(`Program: ${evidence.programId}`);
  console.log(`GlobalConfig: ${evidence.accounts.globalConfig}`);
  console.log(`GenerationConfig: ${evidence.accounts.generationConfig}`);
  console.log(`Manifest SHA-256: ${evidence.generationManifestSha256}`);
  if (authHealth) console.log(`Auth health: ${authHealth.url} (${authHealth.status})`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
