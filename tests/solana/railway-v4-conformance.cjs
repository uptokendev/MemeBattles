"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { Keypair, PublicKey } = require("@solana/web3.js");
const {
  buildCreateAuthorizationPayload: buildReferencePayload,
  createAuthorizationDigest: createReferenceDigest,
} = require("./authorization-v4.cjs");

function hash32(label) {
  return crypto.createHash("sha256").update(label, "utf8").digest();
}

function keypair(label) {
  return Keypair.fromSeed(hash32(`seed:${label}`));
}

function derive(programId, ...seeds) {
  return PublicKey.findProgramAddressSync(seeds.map((seed) => Buffer.from(seed)), programId);
}

describe("Railway Solana V4 serializer conformance", function () {
  let railway;

  before(async function () {
    const modulePath = path.resolve(
      __dirname,
      "../../frontend/api/dev-fix/solana-v4-primitives.js",
    );
    railway = await import(pathToFileURL(modulePath).href);
  });

  function fixture() {
    const programId = keypair("program").publicKey;
    const generationConfigKey = keypair("generation-config").publicKey;
    const creatorKeypair = keypair("creator");
    const campaignId = hash32("campaign-id");
    const [campaign, campaignBump] = derive(programId, "campaign", campaignId);
    const [mint, mintBump] = derive(programId, "campaign-mint", campaignId);
    const [tokenVault, tokenVaultBump] = derive(programId, "token-vault", campaignId);
    const [solVault, solVaultBump] = derive(programId, "sol-vault", campaignId);
    const nonce = hash32("nonce");
    const [createAuthorization, createAuthorizationBump] = derive(
      programId,
      "create-auth",
      creatorKeypair.publicKey.toBuffer(),
      nonce,
    );

    const input = {
      programId,
      generationConfigKey,
      generation: {
        generationId: hash32("generation-id"),
        programId,
        configPda: generationConfigKey,
        startSlot: 123_456n,
        clusterKind: 1,
        allowedGraduationTierMask: 1,
        economicsVersion: 1,
        curveKind: 1,
        tokenTotalSupply: 1_000_000_000_000n,
        tokenDecimals: 6,
        curveSupplyBps: 8_000,
        liquidityTokenBps: 1_000,
        basePriceLamports: 1_000n,
        priceSlopeLamports: 10n,
        buyFeeBps: 200,
        sellFeeBps: 200,
        finalizeFeeBps: 200,
        creatorPostFinalizeBps: 2_000,
        liquidityPostFinalizeBps: 8_000,
        dexAdapter: 1,
        tradeRouteProfile: hash32("trade-route-profile"),
        finalizeRouteProfile: hash32("finalize-route-profile"),
        treasuryProfile: hash32("treasury-profile"),
        dexProfile: hash32("dex-profile"),
        oracleProfile: hash32("oracle-profile"),
        manifestHash: hash32("manifest"),
        routeAuthorizationRequired: true,
        authorizedTradingRequired: true,
      },
      creator: creatorKeypair.publicKey,
      riskClusterId: hash32("risk-cluster"),
      creatorBuyLockSeconds: 86_400,
      creatorBuyCapBps: 1_000,
      campaign,
      mint,
      tokenVault,
      solVault,
      tokenProgram: new PublicKey(railway.TOKEN_PROGRAM_ID),
      args: {
        campaignId,
        metadataHash: hash32("metadata"),
        clusterHash: hash32("cluster"),
        tickerHash: hash32("ticker"),
        reservationIdHash: hash32("reservation"),
        reservationVersion: 9n,
        launchAt: 1_900_000_000n,
        graduationTargetUsdMicros: 6_000_000n,
        nonce,
        deadline: 1_899_999_900n,
      },
    };

    return {
      input,
      creatorKeypair,
      addresses: {
        campaign: [campaign, campaignBump],
        mint: [mint, mintBump],
        tokenVault: [tokenVault, tokenVaultBump],
        solVault: [solVault, solVaultBump],
        createAuthorization: [createAuthorization, createAuthorizationBump],
      },
    };
  }

  it("matches @solana/web3.js PDA derivation for every create account", function () {
    const { input, creatorKeypair, addresses } = fixture();
    const programId = input.programId.toBase58();
    const cases = [
      ["campaign", [Buffer.from("campaign"), input.args.campaignId]],
      ["mint", [Buffer.from("campaign-mint"), input.args.campaignId]],
      ["tokenVault", [Buffer.from("token-vault"), input.args.campaignId]],
      ["solVault", [Buffer.from("sol-vault"), input.args.campaignId]],
      [
        "createAuthorization",
        [Buffer.from("create-auth"), creatorKeypair.publicKey.toBuffer(), input.args.nonce],
      ],
    ];

    for (const [name, seeds] of cases) {
      const actual = railway.findProgramAddressSync(seeds, programId);
      assert.equal(actual.publicKey, addresses[name][0].toBase58(), `${name} public key`);
      assert.equal(actual.bump, addresses[name][1], `${name} bump`);
    }
  });

  it("matches the accepted validator V4 payload and digest byte-for-byte", function () {
    const { input } = fixture();
    const referencePayload = buildReferencePayload(input);
    const railwayPayload = railway.buildCreateAuthorizationPayload(input);
    assert.deepEqual(railwayPayload, referencePayload);
    assert.deepEqual(railway.createAuthorizationDigest(input), createReferenceDigest(input));
    assert.equal(railwayPayload.length > 500, true);
  });

  it("derives the same route-signer public key from a Solana seed", function () {
    const signerKeypair = keypair("route-signer");
    const signer = railway.createEd25519Signer(signerKeypair.secretKey.subarray(0, 32).toString("hex"));
    assert.equal(signer.publicKeyBase58, signerKeypair.publicKey.toBase58());

    const digest = createReferenceDigest(fixture().input);
    const signature = signer.sign(digest);
    assert.equal(signature.length, 64);
    assert.equal(signer.verify(digest, signature), true);
  });
});
