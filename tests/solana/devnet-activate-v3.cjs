/**
 * Activate the immutable Solana Devnet Economics V3 generation AFTER the V3
 * program binary has been built, verified, and upgraded.
 *
 * This script does not deploy/upgrade the program. It only:
 *  1) deactivates the currently active creation generation when different,
 *  2) initializes the V3 GenerationConfig if missing,
 *  3) activates V3 for new creation.
 *
 * Existing V1/V2 Campaign accounts keep their stored economics forever.
 *
 * Usage:
 *   export SOLANA_RPC_URL=https://api.devnet.solana.com
 *   export SOLANA_OPERATOR_KEYPAIR=$HOME/.config/memewarzone/solana-devnet/deployer.json
 *   node tests/solana/devnet-activate-v3.cjs
 */
const anchor = require("@coral-xyz/anchor");
const { AnchorProvider, Program, Wallet, BN } = anchor;
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v3.json");
const IDL_PATH = path.join(ROOT, "target/idl/memewarzone_solana.json");
const EXPECTED_PROGRAM_ID = "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt";
const EXPECTED_ECONOMICS_VERSION = 3;
const EXPECTED_BASE = "1";
const EXPECTED_SLOPE = "850";

function loadKeypair(p) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}
function hash32(value) {
  return crypto.createHash("sha256").update(value).digest();
}
function fixed32(buf) {
  const b = Buffer.from(buf);
  if (b.length !== 32) throw new Error("expected 32 bytes");
  return Array.from(b);
}
function derivePda(programId, ...parts) {
  const seeds = parts.map((p) => (typeof p === "string" ? Buffer.from(p) : Buffer.from(p)));
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function main() {
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const operatorPath = process.env.SOLANA_OPERATOR_KEYPAIR || `${process.env.HOME}/.config/memewarzone/solana-devnet/deployer.json`;
  if (!fs.existsSync(operatorPath)) throw new Error(`operator keypair not found: ${operatorPath}`);
  if (!fs.existsSync(IDL_PATH)) throw new Error(`IDL not found: ${IDL_PATH}. Build V3 first.`);

  const operator = loadKeypair(operatorPath);
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const settings = manifest.settings;

  if (Number(settings.economicsVersion) !== EXPECTED_ECONOMICS_VERSION) {
    throw new Error(`manifest economicsVersion must be ${EXPECTED_ECONOMICS_VERSION}`);
  }
  if (String(settings.basePriceLamports) !== EXPECTED_BASE) {
    throw new Error(`manifest basePriceLamports must be ${EXPECTED_BASE}`);
  }
  if (String(settings.priceSlopeLamports) !== EXPECTED_SLOPE) {
    throw new Error(`manifest V3 fixed-point slope must be ${EXPECTED_SLOPE}`);
  }

  const provider = new AnchorProvider(new Connection(rpc, "confirmed"), new Wallet(operator), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program(idl, provider);
  const programId = program.programId;
  if (programId.toBase58() !== EXPECTED_PROGRAM_ID) {
    throw new Error(`IDL program mismatch: ${programId.toBase58()} != ${EXPECTED_PROGRAM_ID}`);
  }

  const generationId = hash32(manifest.generationIdSeed);
  const manifestHash = hash32(canonicalJson(manifest));
  const generation = {
    generationId: fixed32(generationId),
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
    activeCreation: false,
    supportEnabled: true,
    manifestHash: fixed32(manifestHash),
    routeAuthorizationRequired: true,
    authorizedTradingRequired: true,
  };

  const globalConfig = derivePda(programId, "global");
  const generationConfig = derivePda(programId, "generation", generationId);
  console.log("program", programId.toBase58());
  console.log("operator", operator.publicKey.toBase58());
  console.log("global", globalConfig.toBase58());
  console.log("generationConfig", generationConfig.toBase58());
  console.log("generationId", generationId.toString("hex"));
  console.log("manifestHash", manifestHash.toString("hex"));
  console.log("economicsVersion", settings.economicsVersion);
  console.log("basePriceLamports", settings.basePriceLamports);
  console.log("priceSlopeNanoLamports", settings.priceSlopeLamports);

  const global = await program.account.globalConfig.fetch(globalConfig);
  const activeId = Buffer.from(global.activeGenerationId);
  console.log("current activeGenerationId", activeId.toString("hex"));

  if (!activeId.equals(Buffer.alloc(32)) && !activeId.equals(generationId)) {
    const oldGen = derivePda(programId, "generation", activeId);
    console.log("deactivating old creation generation", oldGen.toBase58());
    const sig = await program.methods
      .setGenerationSupport(true, false)
      .accountsStrict({ authority: operator.publicKey, globalConfig, generationConfig: oldGen })
      .rpc();
    console.log("deactivated old", sig);
  }

  let genState;
  try {
    genState = await program.account.generationConfig.fetch(generationConfig);
    console.log("V3 generation already exists");
  } catch {
    console.log("initializing V3 generation");
    const sig = await program.methods
      .initializeGenerationConfig(generation)
      .accountsStrict({ authority: operator.publicKey, globalConfig, generationConfig, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("initialized", sig);
    genState = await program.account.generationConfig.fetch(generationConfig);
  }

  if (Number(genState.economicsVersion) !== EXPECTED_ECONOMICS_VERSION) {
    throw new Error(`existing generation economicsVersion is ${genState.economicsVersion}, expected 3`);
  }
  if (genState.basePriceLamports.toString() !== EXPECTED_BASE) {
    throw new Error(`existing generation base mismatch: ${genState.basePriceLamports}`);
  }
  if (genState.priceSlopeLamports.toString() !== EXPECTED_SLOPE) {
    throw new Error(`existing generation slope mismatch: ${genState.priceSlopeLamports}`);
  }

  console.log("activating V3 for new creation");
  const act = await program.methods
    .setGenerationSupport(true, true)
    .accountsStrict({ authority: operator.publicKey, globalConfig, generationConfig })
    .rpc();
  console.log("activated", act);

  const globalAfter = await program.account.globalConfig.fetch(globalConfig);
  const genAfter = await program.account.generationConfig.fetch(generationConfig);
  const activeAfter = Buffer.from(globalAfter.activeGenerationId);
  if (!activeAfter.equals(generationId)) throw new Error("GlobalConfig did not activate the V3 generation ID");
  if (!genAfter.activeCreation || !genAfter.supportEnabled) throw new Error("V3 generation not active/supported after activation");

  console.log("activeGenerationId", activeAfter.toString("hex"));
  console.log("gen economicsVersion", genAfter.economicsVersion);
  console.log("gen basePrice", genAfter.basePriceLamports.toString());
  console.log("gen fixedPointSlope", genAfter.priceSlopeLamports.toString());
  console.log("OK — V3 generation active for NEW campaigns only. Existing V1/V2 campaigns are unchanged.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
