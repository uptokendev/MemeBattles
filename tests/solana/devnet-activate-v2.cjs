/**
 * After program upgrade with ECONOMICS_VERSION_V2:
 * 1) Deactivate old active generation (if any)
 * 2) Initialize v2 BNB-parity generation from manifest
 * 3) Activate it
 * 4) Unpause buy/sell (via trade-ops)
 *
 * Usage:
 *   export SOLANA_RPC_URL=https://api.devnet.solana.com
 *   export SOLANA_LAUNCHPAD_PROGRAM_ID=3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt
 *   export SOLANA_OPERATOR_KEYPAIR=$HOME/.config/memewarzone/solana-devnet/deployer.json
 *   export SOLANA_ROUTE_SIGNER_PUBLIC_KEY=7hKQd798Z1ERmRUhm7shmstB1V13FQNnDLqtYjZBuJUz
 *   node tests/solana/devnet-activate-v2.cjs
 */
const anchor = require("@coral-xyz/anchor");
const { AnchorProvider, Program, Wallet, BN } = anchor;
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v1.json");
const IDL_PATH = path.join(ROOT, "target/idl/memewarzone_solana.json");

function loadKeypair(p) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}
function hash32(value) {
  // Match bootstrap / Railway: sha256 over bytes (Buffer or string).
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
/** Must stay stable: same as tests/solana/devnet-protocol-state.cjs */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function main() {
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const operator = loadKeypair(process.env.SOLANA_OPERATOR_KEYPAIR || `${process.env.HOME}/.config/memewarzone/solana-devnet/deployer.json`);
  const routeSigner = new PublicKey(
    process.env.SOLANA_ROUTE_SIGNER_PUBLIC_KEY || "7hKQd798Z1ERmRUhm7shmstB1V13FQNnDLqtYjZBuJUz",
  );
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const manifestHash = hash32(canonicalJson(manifest));

  const provider = new AnchorProvider(new Connection(rpc, "confirmed"), new Wallet(operator), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program(idl, provider);
  const programId = program.programId;
  console.log("program", programId.toBase58());
  console.log("operator", operator.publicKey.toBase58());

  const settings = manifest.settings;
  const generationId = hash32(manifest.generationIdSeed);
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
    // Init inactive first if another gen is active; activate after.
    activeCreation: false,
    supportEnabled: true,
    manifestHash: fixed32(manifestHash),
    routeAuthorizationRequired: true,
    authorizedTradingRequired: true,
  };

  const globalConfig = derivePda(programId, "global");
  const generationConfig = derivePda(programId, "generation", generationId);
  console.log("global", globalConfig.toBase58());
  console.log("generationConfig", generationConfig.toBase58());
  console.log("generationId", generationId.toString("hex"));
  console.log("economicsVersion", settings.economicsVersion);

  const global = await program.account.globalConfig.fetch(globalConfig);
  const activeId = Buffer.from(global.activeGenerationId);
  console.log("current activeGenerationId", activeId.toString("hex"));

  // Deactivate current active generation if different
  if (!activeId.equals(Buffer.alloc(32)) && !activeId.equals(generationId)) {
    const oldGen = derivePda(programId, "generation", activeId);
    try {
      console.log("deactivating old generation", oldGen.toBase58());
      const sig = await program.methods
        .setGenerationSupport(true, false)
        .accountsStrict({
          authority: operator.publicKey,
          globalConfig,
          generationConfig: oldGen,
        })
        .rpc();
      console.log("deactivated old:", sig);
    } catch (e) {
      console.warn("deactivate old failed (may already be inactive):", e.message || e);
    }
  }

  // Initialize new generation if missing
  let genState = null;
  try {
    genState = await program.account.generationConfig.fetch(generationConfig);
    console.log("generation already exists, economics", genState.economicsVersion);
  } catch {
    console.log("initializing generation config…");
    const sig = await program.methods
      .initializeGenerationConfig(generation)
      .accountsStrict({
        authority: operator.publicKey,
        globalConfig,
        generationConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("initialized:", sig);
    genState = await program.account.generationConfig.fetch(generationConfig);
  }

  // Activate new generation for creation
  console.log("activating v2 generation…");
  const act = await program.methods
    .setGenerationSupport(true, true)
    .accountsStrict({
      authority: operator.publicKey,
      globalConfig,
      generationConfig,
    })
    .rpc();
  console.log("activated:", act);

  const global2 = await program.account.globalConfig.fetch(globalConfig);
  const gen2 = await program.account.generationConfig.fetch(generationConfig);
  console.log("activeGenerationId", Buffer.from(global2.activeGenerationId).toString("hex"));
  console.log("gen economicsVersion", gen2.economicsVersion);
  console.log("gen activeCreation", gen2.activeCreation);
  console.log("gen supportEnabled", gen2.supportEnabled);
  console.log("gen basePrice", gen2.basePriceLamports.toString());
  console.log("gen slope", gen2.priceSlopeLamports.toString());
  console.log("gen supply", gen2.tokenTotalSupply.toString());
  console.log("gen decimals", gen2.tokenDecimals);

  if (Number(gen2.economicsVersion) !== 2) {
    throw new Error("Generation economicsVersion is not 2 — program may not be upgraded yet.");
  }
  console.log("\nOK — v2 generation active. Next: unpause-trade, then Direct-deploy a NEW mint.");
  void routeSigner;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
