"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey } = require("@solana/web3.js");
const { AnchorProvider, BN, Program, Wallet } = anchor;

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_RPC = "https://api.devnet.solana.com";
const DEFAULT_MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v3.json");
const DEFAULT_IDL = path.join(ROOT, "target/idl/memewarzone_solana.json");
const DEFAULT_OUTPUT = path.join(ROOT, "deployments/solana-devnet.protocol-state.json");
const DEFAULT_ANCHOR_TOML = path.join(ROOT, "Anchor.toml");
const DEFAULT_PROGRAM_SOURCE = path.join(ROOT, "programs/memewarzone_solana/src/lib.rs");
const DEFAULT_PROGRAM_BINARY = path.join(ROOT, "target/deploy/memewarzone_solana.so");
const DEFAULT_FRONTEND_ENV = path.join(ROOT, "frontend/.env.local");
const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

function fail(message) {
  throw new Error(`[solana-devnet-state] ${message}`);
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
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
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

function bigint(value) {
  if (typeof value === "bigint") return value;
  return BigInt(value.toString());
}

function normalizeHash(value, label) {
  const normalized = String(value || "").trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) fail(`${label} must be a 32-byte hex SHA-256 value`);
  return normalized;
}

function parseBool(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  fail(`Invalid boolean value: ${value}`);
}

function parseArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    idl: DEFAULT_IDL,
    output: DEFAULT_OUTPUT,
    frontendEnv: process.env.SOLANA_FRONTEND_ENV_FILE || DEFAULT_FRONTEND_ENV,
    backendEnv: process.env.SOLANA_BACKEND_ENV_FILE || null,
    authHealthUrl: process.env.SOLANA_AUTH_HEALTHCHECK_URL || "",
    skipAuthHealth: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") options.manifest = path.resolve(argv[++index]);
    else if (arg === "--idl") options.idl = path.resolve(argv[++index]);
    else if (arg === "--output") options.output = path.resolve(argv[++index]);
    else if (arg === "--frontend-env") options.frontendEnv = argv[++index];
    else if (arg === "--backend-env") options.backendEnv = argv[++index];
    else if (arg === "--auth-health-url") options.authHealthUrl = argv[++index];
    else if (arg === "--skip-auth-health") options.skipAuthHealth = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
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

function derivePda(programId, ...seeds) {
  return PublicKey.findProgramAddressSync(seeds.map((seed) => Buffer.from(seed)), programId)[0];
}

function generationArgs(manifest, sourceManifestHash) {
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
    sourceManifestHash: fixed32(sourceManifestHash),
  };
}

function resolveExpectedPauseFlags(manifestPauseFlags) {
  const expected = { ...manifestPauseFlags };
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

function expectedAuthority(global, envName, field) {
  const configured = firstNonEmpty(process.env[envName]);
  if (configured) sameKey(global[field], configured, `GlobalConfig.${field}`);
  return new PublicKey(configured || global[field]);
}

function verifyGenerationSemantics(generation, programId, generationConfig, args) {
  sameBytes(generation.generationId, args.generationId, "GenerationConfig.generationId");
  sameKey(generation.programId, programId, "GenerationConfig.programId");
  sameKey(generation.configPda, generationConfig, "GenerationConfig.configPda");
  for (const field of ["clusterKind", "allowedGraduationTierMask", "economicsVersion", "curveKind", "tokenDecimals", "curveSupplyBps", "liquidityTokenBps", "buyFeeBps", "sellFeeBps", "finalizeFeeBps", "creatorPostFinalizeBps", "liquidityPostFinalizeBps", "dexAdapter"]) {
    sameNumber(generation[field], args[field], `GenerationConfig.${field}`);
  }
  for (const field of ["tokenTotalSupply", "basePriceLamports", "priceSlopeLamports"]) {
    sameBigint(generation[field], args[field], `GenerationConfig.${field}`);
  }
  for (const field of ["tradeRouteProfile", "finalizeRouteProfile", "treasuryProfile", "dexProfile", "oracleProfile"]) {
    sameBytes(generation[field], args[field], `GenerationConfig.${field}`);
  }
  assert.equal(generation.activeCreation, args.activeCreation, "GenerationConfig.activeCreation mismatch");
  assert.equal(generation.supportEnabled, args.supportEnabled, "GenerationConfig.supportEnabled mismatch");
  assert.equal(generation.routeAuthorizationRequired, true, "generation route authorization must be required");
  assert.equal(generation.authorizedTradingRequired, true, "generation authorized trading must be required");
}

async function verifyAuthHealth(url, expected) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const bodyText = await response.text();
  if (!response.ok) fail(`backend auth health check ${url} returned ${response.status}`);
  let parsed = null;
  try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { parsed = null; }
  if (parsed && parsed.healthy === false) fail(`backend auth health check ${url} reported healthy=false`);
  const programId = firstNonEmpty(parsed?.programId, parsed?.solanaProgramId, parsed?.launchpadProgramId, parsed?.data?.programId);
  const routeSigner = firstNonEmpty(parsed?.routeSigner, parsed?.routeSignerPublicKey, parsed?.data?.routeSigner);
  const manifestHash = firstNonEmpty(parsed?.manifestHash, parsed?.generationManifestHash, parsed?.data?.manifestHash);
  if (programId) sameKey(programId, expected.programId, "backend health program ID");
  if (routeSigner) sameKey(routeSigner, expected.routeSigner, "backend health route signer");
  if (manifestHash) assert.equal(normalizeHash(manifestHash, "backend health manifest hash"), expected.onChainManifestHash, "backend health/on-chain manifest commitment mismatch");
  return { url, status: response.status, programId: programId || null, routeSigner: routeSigner || null, manifestHash: manifestHash ? normalizeHash(manifestHash, "backend health manifest hash") : null, json: Boolean(parsed) };
}

async function main() {
  const options = parseArgs(process.argv);
  const manifest = readJson(options.manifest, "generation manifest");
  const idlText = readText(options.idl, "generated IDL");
  const idl = JSON.parse(idlText);
  const sourceManifestHash = hash32(canonicalJson(manifest));
  const sourceManifestHashHex = sourceManifestHash.toString("hex");
  const idlHashHex = sha256Hex(idlText);
  const anchorToml = readText(DEFAULT_ANCHOR_TOML, "Anchor.toml");
  const source = readText(DEFAULT_PROGRAM_SOURCE, "program source");
  const declaredProgramId = parseSourceProgramId(source);
  const anchorLocalnetProgramId = parseAnchorProgramId(anchorToml, "localnet");
  const anchorDevnetProgramId = parseAnchorProgramId(anchorToml, "devnet");
  const configuredProgramId = new PublicKey(firstNonEmpty(process.env.SOLANA_LAUNCHPAD_PROGRAM_ID, idl.address, declaredProgramId));
  sameKey(declaredProgramId, configuredProgramId, "declare_id! program ID");
  sameKey(anchorLocalnetProgramId, configuredProgramId, "Anchor.toml localnet program ID");
  sameKey(anchorDevnetProgramId, configuredProgramId, "Anchor.toml devnet program ID");
  if (idl.address) sameKey(idl.address, configuredProgramId, "IDL metadata address");

  const configuredManifestHash = firstNonEmpty(process.env.SOLANA_GENERATION_MANIFEST_HASH);
  const configuredIdlHash = firstNonEmpty(process.env.SOLANA_LAUNCHPAD_IDL_SHA256);
  if (configuredIdlHash) assert.equal(configuredIdlHash.toLowerCase(), idlHashHex, "configured IDL hash mismatch");
  if (!fs.existsSync(DEFAULT_PROGRAM_BINARY)) fail(`program binary not found: ${DEFAULT_PROGRAM_BINARY}`);
  const localProgramHash = sha256Hex(fs.readFileSync(DEFAULT_PROGRAM_BINARY));
  const configuredProgramHash = firstNonEmpty(process.env.SOLANA_LAUNCHPAD_PROGRAM_SHA256);
  if (configuredProgramHash) assert.equal(configuredProgramHash.toLowerCase(), localProgramHash, "configured program binary hash mismatch");

  const frontendEnv = readEnvFileIfExists(options.frontendEnv);
  const backendEnv = readEnvFileIfExists(options.backendEnv);
  const frontendProgramId = firstNonEmpty(process.env.VITE_SOLANA_LAUNCHPAD_PROGRAM_ID, process.env.SOLANA_FRONTEND_PROGRAM_ID, frontendEnv.values.get("VITE_SOLANA_LAUNCHPAD_PROGRAM_ID"));
  if (frontendProgramId) sameKey(frontendProgramId, configuredProgramId, "frontend program ID");
  const backendProgramId = firstNonEmpty(process.env.SOLANA_BACKEND_PROGRAM_ID, backendEnv.values.get("SOLANA_LAUNCHPAD_PROGRAM_ID"));
  if (backendProgramId) sameKey(backendProgramId, configuredProgramId, "backend program ID");
  const backendRouteSigner = firstNonEmpty(backendEnv.values.get("SOLANA_ROUTE_SIGNER_PUBLIC_KEY"));
  const backendManifestHash = firstNonEmpty(backendEnv.values.get("SOLANA_GENERATION_MANIFEST_HASH"));

  const rpcUrl = firstNonEmpty(process.env.SOLANA_RPC_URL, DEFAULT_RPC);
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed", preflightCommitment: "confirmed" });
  const program = new Program(idl, provider);
  sameKey(program.programId, configuredProgramId, "Anchor Program program ID");
  const rpcVersion = await connection.getVersion();
  const programInfo = await connection.getAccountInfo(configuredProgramId, "confirmed");
  if (!programInfo) fail(`Program account ${configuredProgramId.toBase58()} is missing`);
  assert.equal(programInfo.executable, true, "program account must be executable");
  sameKey(programInfo.owner, UPGRADEABLE_LOADER, "program owner");

  const generation = generationArgs(manifest, sourceManifestHash);
  const generationId = Buffer.from(generation.generationId);
  const clusterId = hash32(manifest.riskClusterIdSeed);
  const globalConfig = derivePda(configuredProgramId, "global");
  const generationConfig = derivePda(configuredProgramId, "generation", generationId);
  const clusterProfile = derivePda(configuredProgramId, "cluster", clusterId);
  const global = await program.account.globalConfig.fetch(globalConfig);
  const generationState = await program.account.generationConfig.fetch(generationConfig);
  const clusterState = await program.account.clusterProfile.fetch(clusterProfile);
  const onChainManifestHashHex = Buffer.from(generationState.manifestHash).toString("hex");

  if (configuredManifestHash) {
    assert.equal(normalizeHash(configuredManifestHash, "SOLANA_GENERATION_MANIFEST_HASH"), onChainManifestHashHex, "configured/on-chain generation manifest commitment mismatch");
  }
  if (backendManifestHash) {
    assert.equal(normalizeHash(backendManifestHash, "backend SOLANA_GENERATION_MANIFEST_HASH"), onChainManifestHashHex, "backend env/on-chain generation manifest commitment mismatch");
  }

  const authorities = {
    admin: expectedAuthority(global, "SOLANA_ADMIN_PUBLIC_KEY", "admin"),
    pauser: expectedAuthority(global, "SOLANA_PAUSER_PUBLIC_KEY", "pauser"),
    tierAdmin: expectedAuthority(global, "SOLANA_TIER_ADMIN_PUBLIC_KEY", "tierAdmin"),
    riskAdmin: expectedAuthority(global, "SOLANA_RISK_ADMIN_PUBLIC_KEY", "riskAdmin"),
    routeSigner: expectedAuthority(global, "SOLANA_ROUTE_SIGNER_PUBLIC_KEY", "routeSigner"),
    rewardOperator: expectedAuthority(global, "SOLANA_REWARD_OPERATOR_PUBLIC_KEY", "rewardOperator"),
    treasuryOperator: expectedAuthority(global, "SOLANA_TREASURY_OPERATOR_PUBLIC_KEY", "treasuryOperator"),
    generationOperator: expectedAuthority(global, "SOLANA_GENERATION_OPERATOR_PUBLIC_KEY", "generationOperator"),
  };
  if (backendRouteSigner) sameKey(backendRouteSigner, authorities.routeSigner, "backend env route signer");
  assert.equal(global.securityDefaultsLocked, true, "security defaults must be locked");
  assert.equal(global.routeAuthorizationRequired, true, "route authorization must remain required");
  assert.equal(global.authorizedTradingRequired, true, "authorized trading must remain required");
  const expectedPauseFlags = resolveExpectedPauseFlags(manifest.pauseFlags);
  for (const [name, expected] of Object.entries(expectedPauseFlags)) assert.equal(global[name], expected, `GlobalConfig.${name} mismatch`);
  verifyGenerationSemantics(generationState, configuredProgramId, generationConfig, generation);
  sameBytes(global.activeGenerationId, generation.generationId, "GlobalConfig.activeGenerationId");
  sameBytes(clusterState.clusterId, clusterId, "ClusterProfile.clusterId");
  sameNumber(clusterState.size, manifest.clusterProfile.size, "ClusterProfile.size");
  sameNumber(clusterState.riskLevel, manifest.clusterProfile.riskLevel, "ClusterProfile.riskLevel");
  assert.equal(clusterState.restricted, manifest.clusterProfile.restricted, "ClusterProfile.restricted mismatch");

  const authHealthUrl = firstNonEmpty(options.skipAuthHealth ? "" : options.authHealthUrl, backendEnv.values.get("SOLANA_AUTH_HEALTHCHECK_URL"), frontendEnv.values.get("SOLANA_AUTH_HEALTHCHECK_URL"));
  const authHealth = authHealthUrl ? await verifyAuthHealth(authHealthUrl, { programId: configuredProgramId, routeSigner: authorities.routeSigner, onChainManifestHash: onChainManifestHashHex }) : null;
  const semanticGenerationMatchesSource = true;
  const manifestProvenance = onChainManifestHashHex === sourceManifestHashHex
    ? "source_canonical_match"
    : "legacy_unreconstructed_commitment";

  const evidence = {
    schemaVersion: 4,
    status: "verified",
    mode: "verify",
    verifiedAt: new Date().toISOString(),
    rpcUrl,
    rpcVersion,
    programId: configuredProgramId.toBase58(),
    operator: null,
    generationManifest: path.relative(ROOT, options.manifest),
    generationManifestSha256: sourceManifestHashHex,
    sourceManifestSha256: sourceManifestHashHex,
    onChainManifestHash: onChainManifestHashHex,
    manifestProvenance,
    semanticGenerationMatchesSource,
    idlSha256: idlHashHex,
    programSha256: localProgramHash,
    staticProgramIds: { declareId: declaredProgramId, anchorLocalnet: anchorLocalnetProgramId, anchorDevnet: anchorDevnetProgramId, idlAddress: firstNonEmpty(idl.address) || null },
    accounts: { globalConfig: globalConfig.toBase58(), generationConfig: generationConfig.toBase58(), clusterProfile: clusterProfile.toBase58() },
    programAccount: { executable: programInfo.executable, owner: programInfo.owner.toBase58(), lamports: programInfo.lamports },
    authorities: Object.fromEntries(Object.entries(authorities).map(([name, key]) => [name, key.toBase58()])),
    generationIdHex: generationId.toString("hex"),
    clusterIdHex: clusterId.toString("hex"),
    bootstrapPauseFlags: { ...manifest.pauseFlags },
    expectedPauseFlags,
    securityDefaultsLocked: global.securityDefaultsLocked,
    envAgreement: {
      frontendEnvFile: frontendEnv.exists ? path.relative(ROOT, frontendEnv.path) : null,
      frontendProgramId: frontendProgramId || null,
      backendEnvFile: backendEnv.exists ? path.relative(ROOT, backendEnv.path) : null,
      backendProgramId: backendProgramId || null,
      configuredManifestHash: configuredManifestHash ? normalizeHash(configuredManifestHash, "SOLANA_GENERATION_MANIFEST_HASH") : null,
      backendManifestHash: backendManifestHash ? normalizeHash(backendManifestHash, "backend SOLANA_GENERATION_MANIFEST_HASH") : null,
      backendRouteSigner: backendRouteSigner || null,
    },
    authHealth,
    transactionSignatures: [],
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Solana devnet protocol state verified: ${options.output}`);
  console.log(`Program: ${evidence.programId}`);
  console.log(`GlobalConfig: ${evidence.accounts.globalConfig}`);
  console.log(`GenerationConfig: ${evidence.accounts.generationConfig}`);
  console.log(`Source manifest SHA-256: ${evidence.sourceManifestSha256}`);
  console.log(`On-chain manifest commitment: ${evidence.onChainManifestHash}`);
  console.log(`Manifest provenance: ${evidence.manifestProvenance}`);
  if (authHealth) console.log(`Auth health: ${authHealth.url} (${authHealth.status})`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
