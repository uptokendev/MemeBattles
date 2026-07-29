"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");

const { AnchorProvider, BN, Program, Wallet } = anchor;
const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_RPC = "https://api.devnet.solana.com";
const DEFAULT_MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v1.json");
const DEFAULT_IDL = path.join(ROOT, "target/idl/memewarzone_solana.json");
const DEFAULT_OUTPUT = path.join(ROOT, "deployments/solana-devnet.protocol-state.json");

function fail(message) {
  throw new Error(`[solana-devnet-state] ${message}`);
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} not found: ${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function hash32(value) {
  return crypto.createHash("sha256").update(value).digest();
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
  const options = { mode: "verify", manifest: DEFAULT_MANIFEST, idl: DEFAULT_IDL, output: DEFAULT_OUTPUT };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "bootstrap" || arg === "verify") options.mode = arg;
    else if (arg === "--manifest") options.manifest = path.resolve(argv[++index]);
    else if (arg === "--idl") options.idl = path.resolve(argv[++index]);
    else if (arg === "--output") options.output = path.resolve(argv[++index]);
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
  for (const [name, expected] of Object.entries(pauseFlags)) assert.equal(global[name], expected, `GlobalConfig.${name} mismatch`);
}

function verifyGeneration(generation, programId, generationConfig, args) {
  sameBytes(generation.generationId, args.generationId, "GenerationConfig.generationId");
  sameKey(generation.programId, programId, "GenerationConfig.programId");
  sameKey(generation.configPda, generationConfig, "GenerationConfig.configPda");
  for (const field of ["clusterKind", "allowedGraduationTierMask", "economicsVersion", "curveKind", "tokenDecimals", "curveSupplyBps", "liquidityTokenBps", "buyFeeBps", "sellFeeBps", "finalizeFeeBps", "creatorPostFinalizeBps", "liquidityPostFinalizeBps", "dexAdapter"]) sameNumber(generation[field], args[field], `GenerationConfig.${field}`);
  for (const field of ["tokenTotalSupply", "basePriceLamports", "priceSlopeLamports"]) sameBigint(generation[field], args[field], `GenerationConfig.${field}`);
  for (const field of ["tradeRouteProfile", "finalizeRouteProfile", "treasuryProfile", "dexProfile", "oracleProfile", "manifestHash"]) sameBytes(generation[field], args[field], `GenerationConfig.${field}`);
  assert.equal(generation.activeCreation, args.activeCreation, "GenerationConfig.activeCreation mismatch");
  assert.equal(generation.supportEnabled, args.supportEnabled, "GenerationConfig.supportEnabled mismatch");
  assert.equal(generation.routeAuthorizationRequired, true, "generation route authorization must be required");
  assert.equal(generation.authorizedTradingRequired, true, "generation authorized trading must be required");
}

async function main() {
  const options = parseArgs(process.argv);
  const manifest = readJson(options.manifest, "generation manifest");
  const idl = readJson(options.idl, "generated IDL");
  const manifestHash = hash32(canonicalJson(manifest));
  const rpcUrl = String(process.env.SOLANA_RPC_URL || DEFAULT_RPC).trim();
  const operatorPath = requiredEnv("SOLANA_OPERATOR_KEYPAIR");
  const operator = loadKeypair(operatorPath);
  const provider = new AnchorProvider(new anchor.web3.Connection(rpcUrl, "confirmed"), new Wallet(operator), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program(idl, provider);
  const configuredProgramId = publicKeyEnv("SOLANA_LAUNCHPAD_PROGRAM_ID", program.programId.toBase58());
  sameKey(program.programId, configuredProgramId, "IDL program ID");

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

  const generation = generationArgs(manifest, manifestHash);
  const generationId = Buffer.from(generation.generationId);
  const clusterId = hash32(manifest.riskClusterIdSeed);
  const globalConfig = derivePda(program.programId, "global");
  const generationConfig = derivePda(program.programId, "generation", generationId);
  const clusterProfile = derivePda(program.programId, "cluster", clusterId);
  const signatures = [];

  let global = await accountOrNull((address) => program.account.globalConfig.fetch(address), globalConfig);
  if (!global) {
    if (options.mode !== "bootstrap") fail(`GlobalConfig ${globalConfig} is missing; run bootstrap`);
    signatures.push(await program.methods.initializeGlobalConfig(authorities).accountsStrict({ admin: operator.publicKey, globalConfig, systemProgram: SystemProgram.programId }).rpc());
    global = await program.account.globalConfig.fetch(globalConfig);
  }

  if (!global.securityDefaultsLocked) {
    if (options.mode !== "bootstrap") fail("security defaults are not locked; run bootstrap");
    signatures.push(await program.methods.lockSecurityDefaults().accountsStrict({ globalConfig, admin: operator.publicKey }).rpc());
  }

  const pauseFlags = manifest.pauseFlags;
  const pauseMismatch = Object.entries(pauseFlags).some(([name, expected]) => global[name] !== expected);
  if (pauseMismatch) {
    if (options.mode !== "bootstrap") fail("pause flags do not match the canonical manifest; run bootstrap");
    signatures.push(await program.methods.setPauseFlags(pauseFlags).accountsStrict({ globalConfig, authority: operator.publicKey }).rpc());
  }

  let generationState = await accountOrNull((address) => program.account.generationConfig.fetch(address), generationConfig);
  if (!generationState) {
    if (options.mode !== "bootstrap") fail(`GenerationConfig ${generationConfig} is missing; run bootstrap`);
    signatures.push(await program.methods.initializeGenerationConfig(generation).accountsStrict({ authority: operator.publicKey, globalConfig, generationConfig, systemProgram: SystemProgram.programId }).rpc());
    generationState = await program.account.generationConfig.fetch(generationConfig);
  }

  let clusterState = await accountOrNull((address) => program.account.clusterProfile.fetch(address), clusterProfile);
  const clusterUpdate = { clusterId: fixed32(clusterId), ...manifest.clusterProfile };
  const clusterMismatch = !clusterState || Buffer.compare(Buffer.from(clusterState.clusterId), clusterId) !== 0 || Number(clusterState.size) !== Number(clusterUpdate.size) || Number(clusterState.riskLevel) !== Number(clusterUpdate.riskLevel) || clusterState.restricted !== clusterUpdate.restricted;
  if (clusterMismatch) {
    if (options.mode !== "bootstrap") fail(`ClusterProfile ${clusterProfile} is missing or mismatched; run bootstrap`);
    signatures.push(await program.methods.syncClusterProfile(clusterUpdate).accountsStrict({ authority: operator.publicKey, globalConfig, clusterProfile, systemProgram: SystemProgram.programId }).rpc());
    clusterState = await program.account.clusterProfile.fetch(clusterProfile);
  }

  global = await program.account.globalConfig.fetch(globalConfig);
  generationState = await program.account.generationConfig.fetch(generationConfig);
  clusterState = await program.account.clusterProfile.fetch(clusterProfile);
  verifyGlobal(global, authorities, pauseFlags);
  verifyGeneration(generationState, program.programId, generationConfig, generation);
  sameBytes(global.activeGenerationId, generation.generationId, "GlobalConfig.activeGenerationId");
  sameBytes(clusterState.clusterId, clusterId, "ClusterProfile.clusterId");
  sameNumber(clusterState.size, clusterUpdate.size, "ClusterProfile.size");
  sameNumber(clusterState.riskLevel, clusterUpdate.riskLevel, "ClusterProfile.riskLevel");
  assert.equal(clusterState.restricted, clusterUpdate.restricted, "ClusterProfile.restricted mismatch");

  const evidence = {
    schemaVersion: 1,
    status: "verified",
    mode: options.mode,
    verifiedAt: new Date().toISOString(),
    rpcUrl,
    programId: program.programId.toBase58(),
    operator: operator.publicKey.toBase58(),
    generationManifest: path.relative(ROOT, options.manifest),
    generationManifestSha256: manifestHash.toString("hex"),
    accounts: {
      globalConfig: globalConfig.toBase58(),
      generationConfig: generationConfig.toBase58(),
      clusterProfile: clusterProfile.toBase58(),
    },
    authorities: Object.fromEntries(Object.entries(authorities).map(([name, key]) => [name, key.toBase58()])),
    generationIdHex: hex32(generation.generationId),
    clusterIdHex: clusterId.toString("hex"),
    pauseFlags,
    securityDefaultsLocked: global.securityDefaultsLocked,
    transactionSignatures: signatures,
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Solana devnet protocol state verified: ${options.output}`);
  console.log(`Program: ${evidence.programId}`);
  console.log(`GlobalConfig: ${evidence.accounts.globalConfig}`);
  console.log(`GenerationConfig: ${evidence.accounts.generationConfig}`);
  console.log(`Manifest SHA-256: ${evidence.generationManifestSha256}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
