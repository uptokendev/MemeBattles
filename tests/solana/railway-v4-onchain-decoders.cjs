"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const anchor = require("@coral-xyz/anchor");
const {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} = require("@solana/web3.js");

const { AnchorProvider, BN, Program, setProvider } = anchor;

function hash32(label) {
  return crypto.createHash("sha256").update(label, "utf8").digest();
}

function fixed32(value) {
  return Array.from(Buffer.from(value));
}

function derive(programId, ...seeds) {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    programId,
  )[0];
}

function bigint(value) {
  return BigInt(value.toString());
}

function rawAccountData(accountInfo, label) {
  assert.ok(accountInfo, `${label} must exist`);
  return Buffer.from(accountInfo.data);
}

describe("Railway V4 on-chain account decoders", function () {
  this.timeout(180_000);

  const provider = AnchorProvider.env();
  setProvider(provider);
  const idl = require(path.resolve(__dirname, "../../target/idl/memewarzone_solana.json"));
  const program = new Program(idl, provider);
  const connection = provider.connection;
  const admin = provider.wallet.publicKey;
  const globalConfig = derive(program.programId, "global");
  const generationId = hash32("memewarzone-local-validator-generation-v4");
  const generationConfig = derive(program.programId, "generation", generationId);
  const riskClusterId = hash32("memewarzone-local-validator-risk-cluster");
  const clusterProfile = derive(program.programId, "cluster", riskClusterId);

  let railway;

  before(async function () {
    const modulePath = path.resolve(
      __dirname,
      "../../frontend/api/dev-fix/solana-v4-primitives.js",
    );
    railway = await import(pathToFileURL(modulePath).href);
  });

  it("decodes GlobalConfig and active GenerationConfig exactly", async function () {
    const [globalInfo, generationInfo] = await Promise.all([
      connection.getAccountInfo(globalConfig, "confirmed"),
      connection.getAccountInfo(generationConfig, "confirmed"),
    ]);
    const decodedGlobal = railway.decodeGlobalConfig(rawAccountData(globalInfo, "GlobalConfig"));
    const decodedGeneration = railway.decodeGenerationConfig(rawAccountData(generationInfo, "GenerationConfig"));
    const anchorGlobal = await program.account.globalConfig.fetch(globalConfig);
    const anchorGeneration = await program.account.generationConfig.fetch(generationConfig);

    assert.equal(decodedGlobal.admin, anchorGlobal.admin.toBase58());
    assert.equal(decodedGlobal.routeSigner, anchorGlobal.routeSigner.toBase58());
    assert.deepEqual(decodedGlobal.activeGenerationId, Buffer.from(anchorGlobal.activeGenerationId));
    assert.equal(decodedGlobal.securityDefaultsLocked, true);
    assert.equal(decodedGlobal.createPaused, false);

    assert.deepEqual(decodedGeneration.generationId, Buffer.from(anchorGeneration.generationId));
    assert.equal(decodedGeneration.programId, anchorGeneration.programId.toBase58());
    assert.equal(decodedGeneration.configPda, anchorGeneration.configPda.toBase58());
    assert.equal(decodedGeneration.startSlot, bigint(anchorGeneration.startSlot));
    assert.equal(decodedGeneration.tokenTotalSupply, bigint(anchorGeneration.tokenTotalSupply));
    assert.equal(decodedGeneration.activeCreation, true);
    assert.equal(decodedGeneration.supportEnabled, true);
    assert.equal(decodedGeneration.routeAuthorizationRequired, true);
    assert.equal(decodedGeneration.authorizedTradingRequired, true);
  });

  it("decodes creator, risk and cluster profiles used by Railway preflight", async function () {
    const creator = Keypair.generate();
    const funding = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin,
        toPubkey: creator.publicKey,
        lamports: LAMPORTS_PER_SOL,
      }),
    );
    await provider.sendAndConfirm(funding, []);

    const creatorProfile = derive(program.programId, "creator", creator.publicKey.toBuffer());
    const riskProfile = derive(program.programId, "risk", creator.publicKey.toBuffer());

    await program.methods
      .syncCreatorProfile({
        wallet: creator.publicKey,
        tier: 1,
        trustScore: 7_500,
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
        wallet: creator.publicKey,
        riskLevel: 1,
        restricted: false,
        clusterId: fixed32(riskClusterId),
        manualReviewRequired: false,
      })
      .accountsStrict({
        authority: admin,
        globalConfig,
        riskProfile,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", preflightCommitment: "confirmed" });

    const [creatorInfo, riskInfo, clusterInfo] = await Promise.all([
      connection.getAccountInfo(creatorProfile, "confirmed"),
      connection.getAccountInfo(riskProfile, "confirmed"),
      connection.getAccountInfo(clusterProfile, "confirmed"),
    ]);
    const decodedCreator = railway.decodeCreatorProfile(rawAccountData(creatorInfo, "CreatorProfile"));
    const decodedRisk = railway.decodeRiskProfile(rawAccountData(riskInfo, "RiskProfile"));
    const decodedCluster = railway.decodeClusterProfile(rawAccountData(clusterInfo, "ClusterProfile"));

    assert.equal(decodedCreator.wallet, creator.publicKey.toBase58());
    assert.equal(decodedCreator.tier, 1);
    assert.equal(decodedCreator.trustScore, 7_500);
    assert.equal(decodedCreator.restricted, false);
    assert.equal(decodedCreator.manualReviewRequired, false);
    assert.equal(decodedCreator.creatorBuyCapBps, 1_000);
    assert.equal(decodedCreator.creatorBuyLockSeconds, 86_400);

    assert.equal(decodedRisk.wallet, creator.publicKey.toBase58());
    assert.equal(decodedRisk.riskLevel, 1);
    assert.deepEqual(decodedRisk.clusterId, riskClusterId);
    assert.equal(decodedRisk.restricted, false);
    assert.equal(decodedRisk.manualReviewRequired, false);

    assert.deepEqual(decodedCluster.clusterId, riskClusterId);
    assert.equal(decodedCluster.size, 2);
    assert.equal(decodedCluster.riskLevel, 1);
    assert.equal(decodedCluster.restricted, false);
  });
});
