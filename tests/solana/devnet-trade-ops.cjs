/**
 * Solana devnet trade operator helpers (plain-language ops for non-experts).
 *
 * Commands:
 *   status              Read pause flags, program, IDL trade ixs, print checklist
 *   checklist           Print smoke-test checklist only (no RPC)
 *   unpause-trade       buy_paused=false, sell_paused=false (grad/claims stay paused)
 *   pause-trade         Restore safe defaults: buy/sell paused again
 *   sync-creator <pk>   Init/update CreatorProfile + RiskProfile for a creator wallet
 *   sync-risk <pk>      Init/update RiskProfile only (use for buyer wallets)
 *
 * Required env (same family as devnet:bootstrap):
 *   SOLANA_OPERATOR_KEYPAIR   path to admin/pauser JSON keypair
 *   SOLANA_LAUNCHPAD_PROGRAM_ID  (optional if IDL address matches)
 *   SOLANA_RPC_URL            default https://api.devnet.solana.com
 *   SOLANA_ROUTE_SIGNER_PUBLIC_KEY  only needed for status notes (optional)
 *
 * Examples:
 *   npm --prefix tests/solana run devnet:trade-ops -- status
 *   npm --prefix tests/solana run devnet:trade-ops -- unpause-trade
 *   npm --prefix tests/solana run devnet:trade-ops -- sync-risk <BUYER_BASE58>
 *   npm --prefix tests/solana run devnet:trade-ops -- pause-trade
 *
 * Safety:
 *   - Never touches BNB / EVM.
 *   - Does not enable Railway flags (you set those in the Railway dashboard).
 *   - Canonical manifest still has buy/sell paused; re-running devnet:bootstrap
 *     will re-pause trading — do not re-bootstrap during a trade smoke window.
 */
"use strict";

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
const PROTOCOL_STATE = path.join(ROOT, "deployments/solana-devnet.protocol-state.json");
const EXPLORER = "https://explorer.solana.com";
const CREATOR_BUY_CAP_BPS = 1_000;

function fail(message) {
  throw new Error(`[devnet-trade-ops] ${message}`);
}

function log(message = "") {
  console.log(message);
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

function loadKeypair(filePath) {
  const secret = readJson(filePath, "operator keypair");
  if (!Array.isArray(secret)) fail("operator keypair must be a Solana JSON byte array");
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function hash32(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function fixed32(value) {
  const buffer = Buffer.from(value);
  if (buffer.length !== 32) fail("bytes32 value must contain 32 bytes");
  return Array.from(buffer);
}

function derivePda(programId, ...seeds) {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => (Buffer.isBuffer(seed) ? seed : Buffer.from(seed))),
    programId,
  )[0];
}

function parseArgs(argv) {
  const args = argv.slice(2).filter((a) => a !== "--");
  const command = String(args[0] || "status").trim().toLowerCase();
  const positionals = [];
  const options = {
    command,
    idl: DEFAULT_IDL,
    manifest: DEFAULT_MANIFEST,
    dryRun: false,
  };

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--idl") options.idl = path.resolve(args[++i]);
    else if (arg === "--manifest") options.manifest = path.resolve(args[++i]);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("-")) fail(`Unknown flag: ${arg}`);
    else positionals.push(arg);
  }

  options.wallet = positionals[0] || null;
  return options;
}

function explorerAccount(address, cluster = "devnet") {
  return `${EXPLORER}/address/${address}?cluster=${cluster}`;
}

function explorerTx(signature, cluster = "devnet") {
  return `${EXPLORER}/tx/${signature}?cluster=${cluster}`;
}

function idlInstructionNames(idl) {
  return new Set((idl.instructions || []).map((ix) => String(ix.name || "").replace(/_/g, "").toLowerCase()));
}

function hasTradeInstructions(idl) {
  const names = idlInstructionNames(idl);
  return {
    buy: names.has("buytokens"),
    sell: names.has("selltokens"),
  };
}

async function accountOrNull(fetcher, address) {
  try {
    return await fetcher(address);
  } catch (error) {
    if (/Account does not exist|could not find account|AccountNotFound/i.test(String(error?.message || error))) {
      return null;
    }
    throw error;
  }
}

function printChecklist({ programId, globalConfig, tradeIxs, pause, railwayHints }) {
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("  Solana devnet trade smoke checklist (operator)");
  log("══════════════════════════════════════════════════════════════");
  log("");
  log("A) One-time / infrastructure");
  log("  [ ] DB migration applied: db/migrations/20260811_000001_solana_campaigns_address_case.sql");
  log("  [ ] Program upgraded with buy_tokens + sell_tokens (same program id)");
  log(`      Program: ${programId || "<SOLANA_LAUNCHPAD_PROGRAM_ID>"}`);
  log(
    `      IDL has buy/sell: buy=${tradeIxs?.buy ? "yes" : "NO"} sell=${tradeIxs?.sell ? "yes" : "NO"}`,
  );
  if (tradeIxs && (!tradeIxs.buy || !tradeIxs.sell)) {
    log("      → Rebuild + anchor deploy, then refresh Railway IDL/program hashes.");
  }
  log("  [ ] Railway create-auth env set; SOLANA_CREATE_AUTH_ENABLED=true for create smoke");
  log("  [ ] Frontend: VITE_SOLANA_LAUNCHPAD_PROGRAM_ID + VITE_DRAFT_PUSH_LIVE_ENABLED + API → Railway");
  log("");
  log("B) Wallets (devnet SOL)");
  log("  [ ] Creator wallet funded");
  log("  [ ] Buyer wallet funded (MUST be different from creator — 24h creator buy lock)");
  log("  [ ] sync-creator <CREATOR>");
  log("  [ ] sync-risk <BUYER>");
  log("");
  log("C) Create smoke");
  log("  [ ] Prepare Mode draft (chain 101) → publish → Push Live");
  log("  [ ] Wallet: Ed25519 + createCampaign succeeds");
  log("  [ ] Token page opens /token/<mint>?chainId=101");
  log("  [ ] campaigns.meta.solana has tokenVault / solVault / campaignIdHex (or re-Push Live)");
  log("");
  log("D) Trade window (on-chain + Railway)");
  if (pause) {
    log(
      `  Current pauses: global=${pause.paused} create=${pause.createPaused} buy=${pause.buyPaused} sell=${pause.sellPaused} grad=${pause.graduationPaused} claims=${pause.claimsPaused}`,
    );
  }
  log("  [ ] npm --prefix tests/solana run devnet:trade-ops -- unpause-trade");
  log("  [ ] Railway: SOLANA_TRADE_AUTH_ENABLED=true  (only AFTER unpause + program upgrade)");
  log("  [ ] Optional FE: VITE_SOLANA_TRADE_LIVE=true");
  log("  [ ] Buyer opens TokenDetails → buy ~0.01 SOL → explorer confirms buy_tokens");
  log("  [ ] Buyer sells some tokens → explorer confirms sell_tokens");
  log("");
  log("E) After smoke (restore safe posture)");
  log("  [ ] npm --prefix tests/solana run devnet:trade-ops -- pause-trade");
  log("  [ ] Optionally set SOLANA_TRADE_AUTH_ENABLED=false on Railway");
  log("  [ ] Do NOT re-run devnet:bootstrap during trade window (it re-pauses from manifest)");
  log("");
  log("F) BNB isolation");
  log("  [ ] Do not change BNB factory / Topaz env vars for this test");
  log("  [ ] Spot-check one BNB token page still loads after Solana work");
  log("");
  if (globalConfig) {
    log(`GlobalConfig: ${explorerAccount(globalConfig)}`);
  }
  if (railwayHints) {
    log("");
    log("Railway trade gate (server only — never VITE_):");
    log("  SOLANA_TRADE_AUTH_ENABLED=true");
    log("  (reuses SOLANA_RPC_URL, SOLANA_LAUNCHPAD_PROGRAM_ID, route signer secret/pubkey)");
  }
  log("══════════════════════════════════════════════════════════════");
  log("");
}

async function connect(options) {
  const idl = readJson(options.idl, "IDL");
  const manifest = readJson(options.manifest, "generation manifest");
  const rpcUrl = String(process.env.SOLANA_RPC_URL || DEFAULT_RPC).trim();
  const operatorPath = requiredEnv("SOLANA_OPERATOR_KEYPAIR");
  const operator = loadKeypair(operatorPath);
  const provider = new AnchorProvider(
    new anchor.web3.Connection(rpcUrl, "confirmed"),
    new Wallet(operator),
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = new Program(idl, provider);
  const configuredProgramId = String(
    process.env.SOLANA_LAUNCHPAD_PROGRAM_ID || program.programId.toBase58(),
  ).trim();
  if (program.programId.toBase58() !== configuredProgramId) {
    fail(
      `IDL program ${program.programId.toBase58()} != SOLANA_LAUNCHPAD_PROGRAM_ID ${configuredProgramId}`,
    );
  }

  const globalConfig = derivePda(program.programId, "global");
  const clusterId = hash32(manifest.riskClusterIdSeed);
  const clusterProfile = derivePda(program.programId, "cluster", clusterId);

  return {
    idl,
    manifest,
    rpcUrl,
    operator,
    provider,
    program,
    globalConfig,
    clusterId,
    clusterProfile,
    tradeIxs: hasTradeInstructions(idl),
  };
}

function readPauseFromGlobal(global) {
  return {
    paused: Boolean(global.paused),
    createPaused: Boolean(global.createPaused),
    buyPaused: Boolean(global.buyPaused),
    sellPaused: Boolean(global.sellPaused),
    graduationPaused: Boolean(global.graduationPaused),
    claimsPaused: Boolean(global.claimsPaused),
  };
}

async function cmdStatus(options) {
  const ctx = await connect(options);
  const global = await accountOrNull(
    (address) => ctx.program.account.globalConfig.fetch(address),
    ctx.globalConfig,
  );
  if (!global) {
    fail(`GlobalConfig missing at ${ctx.globalConfig.toBase58()}. Run: npm --prefix tests/solana run devnet:bootstrap`);
  }

  const pause = readPauseFromGlobal(global);
  let protocolState = null;
  if (fs.existsSync(PROTOCOL_STATE)) {
    try {
      protocolState = JSON.parse(fs.readFileSync(PROTOCOL_STATE, "utf8"));
    } catch {
      protocolState = null;
    }
  }

  log("Solana devnet trade-ops status");
  log(`  RPC:            ${ctx.rpcUrl}`);
  log(`  Program:        ${ctx.program.programId.toBase58()}`);
  log(`  Operator:       ${ctx.operator.publicKey.toBase58()}`);
  log(`  GlobalConfig:   ${ctx.globalConfig.toBase58()}`);
  log(`  ClusterProfile: ${ctx.clusterProfile.toBase58()}`);
  log(`  ClusterId hex:  ${ctx.clusterId.toString("hex")}`);
  log(`  Route signer:   ${global.routeSigner?.toBase58?.() || global.routeSigner || "?"}`);
  log(`  Security lock:  ${global.securityDefaultsLocked}`);
  log(`  IDL buy_tokens: ${ctx.tradeIxs.buy ? "present" : "MISSING — upgrade program"}`);
  log(`  IDL sell_tokens:${ctx.tradeIxs.sell ? " present" : " MISSING — upgrade program"}`);
  log("  Pause flags:");
  log(`    paused=${pause.paused} create=${pause.createPaused} buy=${pause.buyPaused} sell=${pause.sellPaused}`);
  log(`    graduation=${pause.graduationPaused} claims=${pause.claimsPaused}`);
  log(`  Explorer: ${explorerAccount(ctx.globalConfig.toBase58())}`);

  if (protocolState?.verifiedAt) {
    log(`  Last protocol-state evidence: ${protocolState.verifiedAt} (mode=${protocolState.mode})`);
  }

  const readyForTrade =
    ctx.tradeIxs.buy &&
    ctx.tradeIxs.sell &&
    !pause.paused &&
    !pause.buyPaused &&
    !pause.sellPaused;

  if (readyForTrade) {
    log("");
    log("On-chain trade window: OPEN (buy/sell unpaused, IDL has trade ixs).");
    log("Next: set Railway SOLANA_TRADE_AUTH_ENABLED=true, then smoke with a BUYER wallet.");
  } else {
    log("");
    log("On-chain trade window: CLOSED.");
    if (!ctx.tradeIxs.buy || !ctx.tradeIxs.sell) {
      log("  Blocker: rebuild+deploy program so IDL includes buy_tokens/sell_tokens.");
    }
    if (pause.buyPaused || pause.sellPaused || pause.paused) {
      log("  Blocker: run `unpause-trade` after program upgrade (or when ready for smoke).");
    }
  }

  printChecklist({
    programId: ctx.program.programId.toBase58(),
    globalConfig: ctx.globalConfig.toBase58(),
    tradeIxs: ctx.tradeIxs,
    pause,
    railwayHints: true,
  });
}

async function setPauseFlags(ctx, flags, label) {
  const before = await ctx.program.account.globalConfig.fetch(ctx.globalConfig);
  const current = readPauseFromGlobal(before);
  const same =
    current.paused === flags.paused &&
    current.createPaused === flags.createPaused &&
    current.buyPaused === flags.buyPaused &&
    current.sellPaused === flags.sellPaused &&
    current.graduationPaused === flags.graduationPaused &&
    current.claimsPaused === flags.claimsPaused;

  if (same) {
    log(`${label}: already set — no transaction sent.`);
    log(
      `  paused=${current.paused} create=${current.createPaused} buy=${current.buyPaused} sell=${current.sellPaused} grad=${current.graduationPaused} claims=${current.claimsPaused}`,
    );
    return null;
  }

  if (ctx.options?.dryRun) {
    log(`${label}: dry-run would set:`);
    log(JSON.stringify(flags, null, 2));
    return null;
  }

  const sig = await ctx.program.methods
    .setPauseFlags(flags)
    .accountsStrict({
      globalConfig: ctx.globalConfig,
      authority: ctx.operator.publicKey,
    })
    .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });

  const after = await ctx.program.account.globalConfig.fetch(ctx.globalConfig);
  const pause = readPauseFromGlobal(after);
  log(`${label}: ok`);
  log(`  tx: ${explorerTx(sig)}`);
  log(
    `  now: paused=${pause.paused} create=${pause.createPaused} buy=${pause.buyPaused} sell=${pause.sellPaused} grad=${pause.graduationPaused} claims=${pause.claimsPaused}`,
  );
  return sig;
}

async function cmdUnpauseTrade(options) {
  const ctx = await connect(options);
  ctx.options = options;
  if (!ctx.tradeIxs.buy || !ctx.tradeIxs.sell) {
    log("WARNING: current IDL does not list buy_tokens/sell_tokens.");
    log("Unpausing on-chain will not help until you upgrade the program binary.");
    log("Continue only if you already upgraded and this IDL is stale.");
  }

  await setPauseFlags(
    ctx,
    {
      paused: false,
      createPaused: false,
      buyPaused: false,
      sellPaused: false,
      graduationPaused: true,
      claimsPaused: true,
    },
    "unpause-trade",
  );

  log("");
  log("Next steps:");
  log("  1. Railway: SOLANA_TRADE_AUTH_ENABLED=true");
  log("  2. Optional FE: VITE_SOLANA_TRADE_LIVE=true");
  log("  3. sync-risk <BUYER_WALLET> if not done");
  log("  4. Buyer smoke: TokenDetails buy 0.01 SOL, then sell");
  log("  5. After smoke: pause-trade  (and optionally disable trade-auth on Railway)");
  log("");
  log("NOTE: Do not run devnet:bootstrap until after pause-trade — bootstrap re-applies manifest pauses.");
}

async function cmdUnpauseGraduation(options) {
  const ctx = await connect(options);
  ctx.options = options;
  await setPauseFlags(
    ctx,
    {
      paused: false,
      createPaused: false,
      buyPaused: false,
      sellPaused: false,
      graduationPaused: false,
      claimsPaused: true,
    },
    "unpause-graduation",
  );
  log("");
  log("Graduation is open. Create/buy/sell stay open. Claims stay paused.");
  log("Keeper can now submit begin+Meteora+confirm.");
}

async function cmdPauseTrade(options) {
  const ctx = await connect(options);
  ctx.options = options;
  await setPauseFlags(
    ctx,
    {
      paused: false,
      createPaused: false,
      buyPaused: true,
      sellPaused: true,
      graduationPaused: true,
      claimsPaused: true,
    },
    "pause-trade",
  );
  log("");
  log("Safe posture restored (create open; buy/sell/grad/claims paused).");
  log("Optional: set SOLANA_TRADE_AUTH_ENABLED=false on Railway.");
}

async function syncCreatorAndRisk(ctx, walletPk, { creator = true, risk = true } = {}) {
  const wallet = new PublicKey(walletPk);
  const creatorProfile = derivePda(ctx.program.programId, "creator", wallet.toBuffer());
  const riskProfile = derivePda(ctx.program.programId, "risk", wallet.toBuffer());
  const signatures = [];

  if (creator) {
    if (ctx.options?.dryRun) {
      log(`dry-run sync-creator ${wallet.toBase58()}`);
    } else {
      const sig = await ctx.program.methods
        .syncCreatorProfile({
          wallet,
          tier: 1,
          trustScore: 7_000,
          liveBondingCount: 0,
          lastLaunchTimestamp: new BN(0),
          totalLaunches: new BN(0),
          successfulGraduations: new BN(0),
          restricted: false,
          manualReviewRequired: false,
          creatorBuyCapBps: CREATOR_BUY_CAP_BPS,
        })
        .accountsStrict({
          authority: ctx.operator.publicKey,
          globalConfig: ctx.globalConfig,
          creatorProfile,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });
      signatures.push(sig);
      log(`sync-creator: ${wallet.toBase58()}`);
      log(`  CreatorProfile: ${explorerAccount(creatorProfile.toBase58())}`);
      log(`  tx: ${explorerTx(sig)}`);
    }
  }

  if (risk) {
    if (ctx.options?.dryRun) {
      log(`dry-run sync-risk ${wallet.toBase58()}`);
    } else {
      const sig = await ctx.program.methods
        .syncRiskProfile({
          wallet,
          riskLevel: 1,
          restricted: false,
          clusterId: fixed32(ctx.clusterId),
          manualReviewRequired: false,
        })
        .accountsStrict({
          authority: ctx.operator.publicKey,
          globalConfig: ctx.globalConfig,
          riskProfile,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });
      signatures.push(sig);
      log(`sync-risk: ${wallet.toBase58()}`);
      log(`  RiskProfile: ${explorerAccount(riskProfile.toBase58())}`);
      log(`  ClusterId:   ${ctx.clusterId.toString("hex")}`);
      log(`  tx: ${explorerTx(sig)}`);
    }
  }

  return signatures;
}

async function cmdSyncCreator(options) {
  if (!options.wallet) fail("Usage: sync-creator <WALLET_BASE58>");
  const ctx = await connect(options);
  ctx.options = options;
  await syncCreatorAndRisk(ctx, options.wallet, { creator: true, risk: true });
  log("");
  log("Creator can Push Live after Railway create-auth is enabled.");
  log("Remember: creator cannot buy for ~24h after create — use a separate buyer + sync-risk.");
}

async function cmdSyncRisk(options) {
  if (!options.wallet) fail("Usage: sync-risk <WALLET_BASE58>");
  const ctx = await connect(options);
  ctx.options = options;
  await syncCreatorAndRisk(ctx, options.wallet, { creator: false, risk: true });
  log("");
  log("Buyer RiskProfile ready for trade-authorize + buy_tokens/sell_tokens.");
}

function cmdChecklistOnly() {
  let programId = String(process.env.SOLANA_LAUNCHPAD_PROGRAM_ID || "").trim();
  let tradeIxs = { buy: false, sell: false };
  if (fs.existsSync(DEFAULT_IDL)) {
    try {
      const idl = JSON.parse(fs.readFileSync(DEFAULT_IDL, "utf8"));
      tradeIxs = hasTradeInstructions(idl);
      if (!programId) programId = idl.address || idl.metadata?.address || "";
    } catch {
      // ignore
    }
  }
  if (fs.existsSync(PROTOCOL_STATE) && !programId) {
    try {
      programId = JSON.parse(fs.readFileSync(PROTOCOL_STATE, "utf8")).programId || "";
    } catch {
      // ignore
    }
  }
  printChecklist({
    programId: programId || "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt",
    globalConfig: null,
    tradeIxs,
    pause: null,
    railwayHints: true,
  });
}

function printUsage() {
  log(`Usage:
  npm --prefix tests/solana run devnet:trade-ops -- <command> [args]

Commands:
  status                 On-chain pause flags + IDL trade ixs + full checklist
  checklist              Print checklist only (no keypair / no RPC)
  unpause-trade          Open buy/sell (keep graduation + claims paused)
  unpause-graduation     Open graduation (keep create/buy/sell open; claims paused)
  pause-trade            Re-pause buy/sell (safe default)
  sync-creator <wallet>  CreatorProfile + RiskProfile for Push Live
  sync-risk <wallet>     RiskProfile only (buyer wallets)

Env:
  SOLANA_OPERATOR_KEYPAIR   path to admin JSON keypair (required for chain commands)
  SOLANA_RPC_URL            default https://api.devnet.solana.com
  SOLANA_LAUNCHPAD_PROGRAM_ID  must match IDL address

Flags:
  --idl <path>           default target/idl/memewarzone_solana.json
  --manifest <path>      default config/solana/devnet-generation-v1.json
  --dry-run              Print actions without sending transactions
`);
}

async function main() {
  const options = parseArgs(process.argv);
  switch (options.command) {
    case "help":
    case "-h":
    case "--help":
      printUsage();
      return;
    case "checklist":
      cmdChecklistOnly();
      return;
    case "status":
      await cmdStatus(options);
      return;
    case "unpause-trade":
    case "unpause":
      await cmdUnpauseTrade(options);
      return;
    case "unpause-graduation":
    case "unpause-grad":
      await cmdUnpauseGraduation(options);
      return;
    case "pause-trade":
    case "pause":
      await cmdPauseTrade(options);
      return;
    case "sync-creator":
    case "creator":
      await cmdSyncCreator(options);
      return;
    case "sync-risk":
    case "risk":
      await cmdSyncRisk(options);
      return;
    default:
      fail(`Unknown command: ${options.command}. Run with --help`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
