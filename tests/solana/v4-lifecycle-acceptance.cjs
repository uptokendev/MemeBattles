"use strict";

/**
 * Local-validator bonding lifecycle against the compiled SBF binary.
 * Does not touch mainnet. Run after:
 *   solana-test-validator --reset --bpf-program 3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt target/deploy/memewarzone_solana.so
 *
 *   npm --prefix tests/solana run test:lifecycle
 *
 * Mainnet GlobalConfig is NOT cloned: create/trade Ed25519 needs a test route
 * signer we control. Generation economics here copy mainnet fees/supply/v3,
 * with cluster_kind=devnet + $6 mask so the threshold-crossing buy is affordable.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const anchor = require("@coral-xyz/anchor");
const {
  ComputeBudgetProgram,
  Ed25519Program,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} = require("@solana/spl-token");

const {
  CREATE_AUTH_SCHEMA_VERSION,
  buildCreateAuthorizationPayload,
  createAuthorizationDigest,
} = require("./authorization-v4.cjs");
const { decodeCampaign } = require("./decode-campaign.cjs");

const { AnchorProvider, BN, Program, setProvider } = anchor;

const PROGRAM_ID = "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt";
const SO_PATH = path.resolve(__dirname, "../../target/deploy/memewarzone_solana.so");
const TRADE_AUTH_DOMAIN = Buffer.from("MEMEWARZONE_SOLANA_TRADE_V1", "utf8");
const TRADE_AUTH_SCHEMA_VERSION = 2;
const TRADE_SIDE_BUY = 1;
const TRADE_SIDE_SELL = 2;
const TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000n;
const TOKEN_DECIMALS = 6;
const CURVE_SUPPLY_BPS = 8_000;
const LIQUIDITY_SUPPLY_BPS = 1_000;
const BUY_FEE_BPS = 200;
const SELL_FEE_BPS = 200;
const GRADUATION_TARGET_6_USD_MICROS = 6_000_000n;
const BUY_LAMPORTS = 10_000_000n; // 0.01 SOL
const CLOSE_TARGET_LAMPORTS = 40_000_000n; // 0.04 SOL net-raised close
const CLOSE_BUY_LAMPORTS = 50_000_000n;
const METEORA_CP_AMM = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const GRADUATION_AUTH_DOMAIN = Buffer.from("MEMEWARZONE_SOLANA_GRADUATION_V1", "utf8");
const GRADUATION_AUTH_SCHEMA_VERSION = 1;

function hash32(label) {
  return crypto.createHash("sha256").update(label, "utf8").digest();
}

function fixed32(value) {
  const buffer = Buffer.from(value);
  assert.equal(buffer.length, 32);
  return Array.from(buffer);
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function derivePda(programId, ...seeds) {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    programId,
  )[0];
}

function u16le(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u64le(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

function i64le(n) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n), 0);
  return b;
}

function tradeDigest({
  programId,
  campaign,
  mint,
  trader,
  side,
  amountIn,
  minOut,
  deadline,
  nonce,
  nativeTargetLamports,
}) {
  return crypto
    .createHash("sha256")
    .update(
      Buffer.concat([
        TRADE_AUTH_DOMAIN,
        u16le(TRADE_AUTH_SCHEMA_VERSION),
        new PublicKey(programId).toBuffer(),
        new PublicKey(campaign).toBuffer(),
        new PublicKey(mint).toBuffer(),
        new PublicKey(trader).toBuffer(),
        Buffer.from([side]),
        u64le(amountIn),
        u64le(minOut),
        i64le(deadline),
        Buffer.from(nonce),
        u64le(nativeTargetLamports),
      ]),
    )
    .digest();
}

async function chainUnixTimestamp(connection) {
  const slot = await connection.getSlot("confirmed");
  const blockTime = await connection.getBlockTime(slot);
  return blockTime ?? Math.floor(Date.now() / 1_000);
}

describe("MemeWarzone Solana V4 local-validator bonding lifecycle", function () {
  this.timeout(1_000_000);

  const provider = AnchorProvider.env();
  setProvider(provider);
  const idl = require(path.resolve(__dirname, "../../target/idl/memewarzone_solana.json"));
  const program = new Program(idl, provider);
  const connection = provider.connection;
  const admin = provider.wallet.publicKey;
  const routeSigner = Keypair.generate();

  const globalConfig = derivePda(program.programId, "global");
  const generationId = hash32("memewarzone-local-lifecycle-generation-v3");
  const generationConfig = derivePda(program.programId, "generation", generationId);
  const emptyClusterId = Buffer.alloc(32);
  const clusterProfile = derivePda(program.programId, "cluster", emptyClusterId);

  let creator;
  let buyer;
  let campaignAccounts;
  let createArgs;

  async function simulateThenSend(tx, label, signers) {
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = signers[0].publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.sign(...signers);

    const simulated = await connection.simulateTransaction(tx);
    const logs = simulated.value.logs || [];
    if (simulated.value.err) {
      throw new Error(
        `${label} simulation failed: ${JSON.stringify(simulated.value.err)}\n${logs.join("\n")}`,
      );
    }
    assert.equal(
      logs.some((line) => /Access violation/i.test(line)),
      false,
      `${label} hit BPF stack overflow:\n${logs.join("\n")}`,
    );

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    const confirmation = await connection.confirmTransaction(
      { signature, ...latest },
      "confirmed",
    );
    if (confirmation.value.err) {
      throw new Error(`${label} landed with error: ${JSON.stringify(confirmation.value.err)}`);
    }
    return { signature, logs };
  }

  async function fund(pubkey, sol) {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  }

  before(async function () {
    assert.equal(program.programId.toBase58(), PROGRAM_ID);
    const soHash = sha256File(SO_PATH);
    if (soHash) {
      console.log(`[sbf-gate] memewarzone_solana.so sha256=${soHash} bytes=${fs.statSync(SO_PATH).size}`);
    } else {
      console.warn(`[sbf-gate] ${SO_PATH} missing — hash the binary you actually deploy`);
    }

    const min = 50 * LAMPORTS_PER_SOL;
    if ((await connection.getBalance(admin, "confirmed")) < min) {
      const sig = await connection.requestAirdrop(admin, 100 * LAMPORTS_PER_SOL);
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
    }
    assert.ok(
      (await connection.getBalance(admin, "confirmed")) >= min,
      `admin ${admin.toBase58()} has no SOL on the local validator`,
    );

    const existingGlobal = await connection.getAccountInfo(globalConfig, "confirmed");
    if (existingGlobal) {
      throw new Error(
        "GlobalConfig already exists. Restart solana-test-validator --reset so lifecycle can init its own route signer (the gate script does this between suites).",
      );
    }

    await program.methods
      .initializeGlobalConfig({
        admin,
        pauser: admin,
        tierAdmin: admin,
        riskAdmin: admin,
        routeSigner: routeSigner.publicKey,
        rewardOperator: admin,
        treasuryOperator: admin,
        generationOperator: admin,
      })
      .accountsStrict({ admin, globalConfig, systemProgram: SystemProgram.programId })
      .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });

    await program.methods
      .lockSecurityDefaults()
      .accountsStrict({ globalConfig, admin })
      .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });

    await program.methods
      .setPauseFlags({
        paused: false,
        createPaused: false,
        buyPaused: false,
        sellPaused: false,
        graduationPaused: true,
        claimsPaused: true,
      })
      .accountsStrict({ globalConfig, authority: admin })
      .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });

    await program.methods
      .initializeGenerationConfig({
        generationId: fixed32(generationId),
        clusterKind: 1,
        allowedGraduationTierMask: 1,
        economicsVersion: 3,
        curveKind: 1,
        tokenTotalSupply: new BN(TOKEN_TOTAL_SUPPLY.toString()),
        tokenDecimals: TOKEN_DECIMALS,
        curveSupplyBps: CURVE_SUPPLY_BPS,
        liquidityTokenBps: LIQUIDITY_SUPPLY_BPS,
        basePriceLamports: new BN(1_000),
        priceSlopeLamports: new BN(10),
        buyFeeBps: BUY_FEE_BPS,
        sellFeeBps: SELL_FEE_BPS,
        finalizeFeeBps: 200,
        creatorPostFinalizeBps: 2_000,
        liquidityPostFinalizeBps: 8_000,
        dexAdapter: 1,
        tradeRouteProfile: fixed32(hash32("trade-route-profile-v1")),
        finalizeRouteProfile: fixed32(hash32("finalize-route-profile-v1")),
        treasuryProfile: fixed32(hash32("treasury-profile-v1")),
        dexProfile: fixed32(hash32("dex-profile-v1")),
        oracleProfile: fixed32(hash32("oracle-profile-v1")),
        activeCreation: true,
        supportEnabled: true,
        manifestHash: fixed32(hash32("generation-manifest-lifecycle-v3")),
        routeAuthorizationRequired: true,
        authorizedTradingRequired: true,
      })
      .accountsStrict({
        authority: admin,
        globalConfig,
        generationConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });
  });

  async function setupWallet(label) {
    const keypair = Keypair.generate();
    await fund(keypair.publicKey, 5);
    const creatorProfile = derivePda(program.programId, "creator", keypair.publicKey.toBuffer());
    const riskProfile = derivePda(program.programId, "risk", keypair.publicKey.toBuffer());
    await program.methods
      .syncCreatorProfile({
        wallet: keypair.publicKey,
        tier: 1,
        trustScore: 7_000,
        liveBondingCount: 0,
        lastLaunchTimestamp: new BN(0),
        totalLaunches: new BN(0),
        successfulGraduations: new BN(0),
        restricted: false,
        manualReviewRequired: false,
        creatorBuyCapBps: 1_000,
      })
      .accountsStrict({
        authority: admin,
        globalConfig,
        creatorProfile,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });
    await program.methods
      .syncRiskProfile({
        wallet: keypair.publicKey,
        riskLevel: 0,
        restricted: false,
        clusterId: Array.from(emptyClusterId),
        manualReviewRequired: false,
      })
      .accountsStrict({
        authority: admin,
        globalConfig,
        riskProfile,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });
    return { keypair, creatorProfile, riskProfile, label };
  }

  async function sendCreate() {
    const now = await chainUnixTimestamp(connection);
    createArgs = {
      campaignId: fixed32(hash32("campaign:lifecycle")),
      metadataHash: fixed32(hash32("metadata:lifecycle")),
      clusterHash: fixed32(hash32("solana-local-validator-devnet-policy")),
      tickerHash: fixed32(hash32("ticker:lifecycle")),
      reservationIdHash: fixed32(hash32("reservation:lifecycle")),
      reservationVersion: new BN(1),
      launchAt: new BN(0),
      graduationTargetUsdMicros: new BN(GRADUATION_TARGET_6_USD_MICROS.toString()),
      deadline: new BN(now + 3_600),
      nonce: fixed32(hash32("nonce:lifecycle")),
    };
    campaignAccounts = {
      campaign: derivePda(program.programId, "campaign", Buffer.from(createArgs.campaignId)),
      mint: derivePda(program.programId, "campaign-mint", Buffer.from(createArgs.campaignId)),
      tokenVault: derivePda(program.programId, "token-vault", Buffer.from(createArgs.campaignId)),
      solVault: derivePda(program.programId, "sol-vault", Buffer.from(createArgs.campaignId)),
      createAuthorization: derivePda(
        program.programId,
        "create-auth",
        creator.keypair.publicKey.toBuffer(),
        Buffer.from(createArgs.nonce),
      ),
    };

    const generation = await program.account.generationConfig.fetch(generationConfig);
    const profile = await program.account.creatorProfile.fetch(creator.creatorProfile);
    const digest = createAuthorizationDigest({
      programId: program.programId,
      generationConfigKey: generationConfig,
      generation,
      creator: creator.keypair.publicKey,
      riskClusterId: emptyClusterId,
      creatorBuyLockSeconds: profile.creatorBuyLockSeconds,
      creatorBuyCapBps: profile.creatorBuyCapBps,
      campaign: campaignAccounts.campaign,
      mint: campaignAccounts.mint,
      tokenVault: campaignAccounts.tokenVault,
      solVault: campaignAccounts.solVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      args: createArgs,
    });
    const ed25519 = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: routeSigner.secretKey,
      message: digest,
    });
    const createIx = await program.methods
      .createCampaign(createArgs)
      .accountsStrict({
        creator: creator.keypair.publicKey,
        globalConfig,
        generationConfig,
        creatorProfile: creator.creatorProfile,
        riskProfile: creator.riskProfile,
        clusterProfile,
        campaign: campaignAccounts.campaign,
        mint: campaignAccounts.mint,
        tokenVault: campaignAccounts.tokenVault,
        solVault: campaignAccounts.solVault,
        createAuthorization: campaignAccounts.createAuthorization,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ed25519,
      createIx,
    );
    return simulateThenSend(tx, "createCampaign", [creator.keypair]);
  }

  async function ensureBuyerAta() {
    const ata = getAssociatedTokenAddressSync(campaignAccounts.mint, buyer.keypair.publicKey);
    const info = await connection.getAccountInfo(ata, "confirmed");
    if (info) return ata;
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        buyer.keypair.publicKey,
        ata,
        buyer.keypair.publicKey,
        campaignAccounts.mint,
      ),
    );
    await simulateThenSend(tx, "createBuyerAta", [buyer.keypair]);
    return ata;
  }

  async function sendBuy(lamportsIn, nativeTargetLamports = 0n) {
    const now = await chainUnixTimestamp(connection);
    const nonce = hash32(`buy:${Date.now()}:${lamportsIn}:${Math.random()}`);
    const deadline = now + 3_600;
    const minOut = 1n;
    const digest = tradeDigest({
      programId: program.programId,
      campaign: campaignAccounts.campaign,
      mint: campaignAccounts.mint,
      trader: buyer.keypair.publicKey,
      side: TRADE_SIDE_BUY,
      amountIn: lamportsIn,
      minOut,
      deadline,
      nonce,
      nativeTargetLamports,
    });
    const ed25519 = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: routeSigner.secretKey,
      message: digest,
    });
    const ata = await ensureBuyerAta();
    const tradeAuth = derivePda(
      program.programId,
      "trade-auth",
      buyer.keypair.publicKey.toBuffer(),
      nonce,
    );
    const buyIx = await program.methods
      .buyTokens({
        lamportsIn: new BN(lamportsIn.toString()),
        minTokensOut: new BN(minOut.toString()),
        deadline: new BN(deadline),
        nonce: Array.from(nonce),
        nativeTargetLamports: new BN(nativeTargetLamports.toString()),
      })
      .accountsStrict({
        trader: buyer.keypair.publicKey,
        globalConfig,
        campaign: campaignAccounts.campaign,
        mint: campaignAccounts.mint,
        tokenVault: campaignAccounts.tokenVault,
        solVault: campaignAccounts.solVault,
        traderTokenAccount: ata,
        riskProfile: buyer.riskProfile,
        tradeAuthorization: tradeAuth,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ed25519,
      buyIx,
    );
    return simulateThenSend(tx, `buy_tokens ${lamportsIn}`, [buyer.keypair]);
  }

  async function sendSell(tokensIn) {
    const now = await chainUnixTimestamp(connection);
    const nonce = hash32(`sell:${Date.now()}:${tokensIn}:${Math.random()}`);
    const deadline = now + 3_600;
    const minOut = 1n;
    const digest = tradeDigest({
      programId: program.programId,
      campaign: campaignAccounts.campaign,
      mint: campaignAccounts.mint,
      trader: buyer.keypair.publicKey,
      side: TRADE_SIDE_SELL,
      amountIn: tokensIn,
      minOut,
      deadline,
      nonce,
      nativeTargetLamports: 0n,
    });
    const ed25519 = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: routeSigner.secretKey,
      message: digest,
    });
    const ata = getAssociatedTokenAddressSync(campaignAccounts.mint, buyer.keypair.publicKey);
    const tradeAuth = derivePda(
      program.programId,
      "trade-auth",
      buyer.keypair.publicKey.toBuffer(),
      nonce,
    );
    const sellIx = await program.methods
      .sellTokens({
        tokensIn: new BN(tokensIn.toString()),
        minLamportsOut: new BN(minOut.toString()),
        deadline: new BN(deadline),
        nonce: Array.from(nonce),
      })
      .accountsStrict({
        trader: buyer.keypair.publicKey,
        globalConfig,
        campaign: campaignAccounts.campaign,
        mint: campaignAccounts.mint,
        tokenVault: campaignAccounts.tokenVault,
        solVault: campaignAccounts.solVault,
        traderTokenAccount: ata,
        riskProfile: buyer.riskProfile,
        tradeAuthorization: tradeAuth,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ed25519,
      sellIx,
    );
    return simulateThenSend(tx, `sell_tokens ${tokensIn}`, [buyer.keypair]);
  }

  it("create → buy → buy → sell → buy → sell → close curve on the compiled SBF", async function () {
    creator = await setupWallet("creator");
    buyer = await setupWallet("buyer");
    assert.notEqual(creator.keypair.publicKey.toBase58(), buyer.keypair.publicKey.toBase58());

    const created = await sendCreate();
    const afterCreateInfo = await connection.getAccountInfo(campaignAccounts.campaign, "confirmed");
    assert.ok(afterCreateInfo, "campaign account missing after create");
    const afterCreate = decodeCampaign(afterCreateInfo.data);
    assert.equal(afterCreate.mintAuthorityRevoked, true);
    assert.equal(afterCreate.curveClosed, false);
    assert.equal(afterCreate.soldTokens.toString(), "0");
    assert.ok(created.logs.some((line) => /Instruction: CreateCampaign/i.test(line)));

    async function snapshot() {
      const info = await connection.getAccountInfo(campaignAccounts.campaign, "confirmed");
      assert.ok(info, "campaign account missing");
      const campaign = decodeCampaign(info.data);
      const ata = getAssociatedTokenAddressSync(campaignAccounts.mint, buyer.keypair.publicKey);
      const token = await getAccount(connection, ata, "confirmed").catch(() => null);
      const vault = await connection.getBalance(campaignAccounts.solVault, "confirmed");
      return { campaign, tokenAmount: token ? BigInt(token.amount.toString()) : 0n, vault };
    }

    let before = await snapshot();
    await sendBuy(BUY_LAMPORTS);
    let after = await snapshot();
    assert.ok(BigInt(after.campaign.soldTokens.toString()) > BigInt(before.campaign.soldTokens.toString()));
    assert.ok(BigInt(after.campaign.netRaisedLamports.toString()) > BigInt(before.campaign.netRaisedLamports.toString()));
    assert.ok(after.tokenAmount > before.tokenAmount);
    assert.ok(after.vault > before.vault);
    const net1 = BigInt(after.campaign.netRaisedLamports.toString()) - BigInt(before.campaign.netRaisedLamports.toString());
    const spent1 = BigInt(after.vault) - BigInt(before.vault);
    const fee1 = spent1 - net1;
    assert.ok(fee1 * 10000n >= net1 * BigInt(BUY_FEE_BPS) - 10_000n, "buy fee should be ~2% of curve cost");

    before = after;
    await sendBuy(BUY_LAMPORTS);
    after = await snapshot();
    assert.ok(after.tokenAmount > before.tokenAmount);

    const sellAmount = after.tokenAmount / 4n;
    assert.ok(sellAmount > 0n);
    before = after;
    await sendSell(sellAmount);
    after = await snapshot();
    assert.ok(after.tokenAmount < before.tokenAmount);
    assert.ok(BigInt(after.campaign.soldTokens.toString()) < BigInt(before.campaign.soldTokens.toString()));
    assert.ok(BigInt(after.campaign.netRaisedLamports.toString()) < BigInt(before.campaign.netRaisedLamports.toString()));

    before = after;
    await sendBuy(BUY_LAMPORTS);
    after = await snapshot();
    const sellAmount2 = after.tokenAmount / 5n;
    await sendSell(sellAmount2);
    after = await snapshot();
    assert.equal(after.campaign.curveClosed, false);

    await sendBuy(CLOSE_BUY_LAMPORTS, CLOSE_TARGET_LAMPORTS);
    after = await snapshot();
    assert.equal(after.campaign.curveClosed, true);

    let closedBuyFailed = false;
    try {
      await sendBuy(BUY_LAMPORTS, CLOSE_TARGET_LAMPORTS);
    } catch (error) {
      closedBuyFailed = /CurveClosed|simulation failed|custom program error/i.test(String(error));
    }
    assert.equal(closedBuyFailed, true, "buy after curve close must fail");
  });

  function orderedPubkeys(a, b) {
    return Buffer.compare(a.toBuffer(), b.toBuffer()) > 0 ? [a, b] : [b, a];
  }

  function deriveMeteoraPool(launchMint) {
    const [first, second] = orderedPubkeys(launchMint, NATIVE_MINT);
    return PublicKey.findProgramAddressSync(
      [Buffer.from("cpool"), first.toBuffer(), second.toBuffer()],
      METEORA_CP_AMM,
    )[0];
  }

  function deriveMeteoraPosition(nftMint) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), nftMint.toBuffer()],
      METEORA_CP_AMM,
    )[0];
  }

  function graduationDigest(input) {
    return crypto
      .createHash("sha256")
      .update(
        Buffer.concat([
          GRADUATION_AUTH_DOMAIN,
          u16le(GRADUATION_AUTH_SCHEMA_VERSION),
          program.programId.toBuffer(),
          input.campaign.toBuffer(),
          input.mint.toBuffer(),
          input.authority.toBuffer(),
          u64le(input.graduationTargetUsdMicros),
          u64le(input.nativeTargetLamports),
          u64le(input.oraclePriceUsdMicros),
          input.pool.toBuffer(),
          input.position.toBuffer(),
          input.nftMint.toBuffer(),
          i64le(input.deadline),
          input.nonce,
        ]),
      )
      .digest();
  }

  async function simulateUnsigned(tx, label, signers) {
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = signers[0].publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.partialSign(...signers);
    const simulated = await connection.simulateTransaction(tx);
    const logs = simulated.value.logs || [];
    assert.equal(
      logs.some((line) => /Access violation/i.test(line)),
      false,
      `${label} hit BPF stack overflow:\n${logs.join("\n")}`,
    );
    return { err: simulated.value.err, logs };
  }

  it("begin_graduation our-side simulates without stack overflow (no Meteora LP)", async function () {
    assert.ok(campaignAccounts, "bonding lifecycle must create+close a campaign first");
    const adminKeypair = provider.wallet.payer;
    assert.ok(adminKeypair?.secretKey, "Anchor wallet must expose a local Keypair payer");

    await program.methods
      .setPauseFlags({
        paused: false,
        createPaused: false,
        buyPaused: false,
        sellPaused: false,
        graduationPaused: false,
        claimsPaused: true,
      })
      .accountsStrict({ globalConfig, authority: admin })
      .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });

    const nftMint = Keypair.generate();
    const pool = deriveMeteoraPool(campaignAccounts.mint);
    const position = deriveMeteoraPosition(nftMint.publicKey);
    const graduationState = derivePda(program.programId, "graduation", campaignAccounts.campaign.toBuffer());
    const authorityAta = getAssociatedTokenAddressSync(campaignAccounts.mint, admin);
    if (!(await connection.getAccountInfo(authorityAta, "confirmed"))) {
      const ataTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(admin, authorityAta, admin, campaignAccounts.mint),
      );
      await simulateThenSend(ataTx, "createAuthorityAta", [adminKeypair]);
    }

    const campaign = decodeCampaign(
      (await connection.getAccountInfo(campaignAccounts.campaign, "confirmed")).data,
    );
    const now = await chainUnixTimestamp(connection);
    const deadline = now + 3_600;
    const nonce = hash32("graduation:lifecycle");
    const nativeTarget = CLOSE_TARGET_LAMPORTS;
    const oraclePrice = 150_000_000n; // $150 / SOL, unused except in digest
    const digest = graduationDigest({
      campaign: campaignAccounts.campaign,
      mint: campaignAccounts.mint,
      authority: admin,
      graduationTargetUsdMicros: campaign.graduationTargetUsdMicros,
      nativeTargetLamports: nativeTarget,
      oraclePriceUsdMicros: oraclePrice,
      pool,
      position,
      nftMint: nftMint.publicKey,
      deadline,
      nonce,
    });

    const ed25519 = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: routeSigner.secretKey,
      message: digest,
    });
    const beginIx = await program.methods
      .beginGraduation({
        nativeTargetLamports: new BN(nativeTarget.toString()),
        oraclePriceUsdMicros: new BN(oraclePrice.toString()),
        deadline: new BN(deadline),
        nonce: Array.from(nonce),
        positionNftMint: nftMint.publicKey,
      })
      .accountsStrict({
        authority: admin,
        globalConfig,
        generationConfig,
        campaign: campaignAccounts.campaign,
        mint: campaignAccounts.mint,
        tokenVault: campaignAccounts.tokenVault,
        solVault: campaignAccounts.solVault,
        authorityTokenAccount: authorityAta,
        meteoraPool: pool,
        meteoraPosition: position,
        positionNftMint: nftMint.publicKey,
        graduationState,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const beginOnly = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
      ed25519,
      beginIx,
    );
    const atomic = await simulateUnsigned(beginOnly, "begin_graduation without Meteora follow-up", [
      adminKeypair,
      nftMint,
    ]);
    assert.ok(atomic.err, "begin_graduation must refuse to run without atomic Meteora+confirm");
    assert.ok(
      atomic.logs.some((line) => /BeginGraduation|GraduationAtomicity|custom program error/i.test(line)),
      `expected our graduation handler, got:\n${atomic.logs.join("\n")}`,
    );

    const creatorAta = getAssociatedTokenAddressSync(campaignAccounts.mint, creator.keypair.publicKey);
    if (!(await connection.getAccountInfo(creatorAta, "confirmed"))) {
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          admin,
          creatorAta,
          creator.keypair.publicKey,
          campaignAccounts.mint,
        ),
      );
      await simulateThenSend(tx, "createCreatorAta", [adminKeypair]);
    }

    const confirmIx = await program.methods
      .confirmGraduation()
      .accountsStrict({
        authority: admin,
        globalConfig,
        campaign: campaignAccounts.campaign,
        mint: campaignAccounts.mint,
        tokenVault: campaignAccounts.tokenVault,
        solVault: campaignAccounts.solVault,
        authorityTokenAccount: authorityAta,
        creator: creator.keypair.publicKey,
        creatorTokenAccount: creatorAta,
        creatorProfile: creator.creatorProfile,
        graduationState,
        meteoraPool: pool,
        meteoraPosition: position,
        meteoraTokenVault: derivePda(METEORA_CP_AMM, "token_vault", campaignAccounts.mint.toBuffer(), pool.toBuffer()),
        meteoraNativeVault: derivePda(METEORA_CP_AMM, "token_vault", NATIVE_MINT.toBuffer(), pool.toBuffer()),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const dummyMeteora = new TransactionInstruction({
      programId: METEORA_CP_AMM,
      keys: [],
      data: Buffer.from([0]),
    });
    const full = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 }),
      ed25519,
      beginIx,
      dummyMeteora,
      confirmIx,
    );
    const withMeteoraSlot = await simulateUnsigned(
      full,
      "begin_graduation + placeholder Meteora + confirm",
      [adminKeypair, nftMint],
    );
    assert.ok(
      withMeteoraSlot.logs.some((line) => /Instruction: BeginGraduation/i.test(line))
        || /Attempt to load a program that does not exist|InvalidMeteora|Graduation/i.test(
          JSON.stringify(withMeteoraSlot.err) + withMeteoraSlot.logs.join("\n"),
        ),
      `our graduation path never ran:\n${withMeteoraSlot.logs.join("\n")}\n${JSON.stringify(withMeteoraSlot.err)}`,
    );
  });
});
