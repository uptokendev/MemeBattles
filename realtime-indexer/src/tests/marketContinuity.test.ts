import assert from "node:assert/strict";
import test from "node:test";
import { ethers } from "ethers";
import { LAUNCH_CAMPAIGN_ABI } from "../abis.js";
import { classifyTopazMarket, graduationEventSnapshot } from "../marketContinuity.js";

test("CampaignFinalized ABI matches the current full graduation event", () => {
  const iface = new ethers.Interface(LAUNCH_CAMPAIGN_ABI);
  const event = iface.getEvent("CampaignFinalized");
  assert.ok(event);
  assert.equal(event.inputs.length, 14);
  assert.deepEqual(
    event.inputs.map((input) => input.name),
    [
      "caller",
      "pair",
      "graduationBalance",
      "graduationOvershoot",
      "liquidityTokens",
      "liquidityBnb",
      "liquidityLp",
      "protocolFee",
      "creatorPayout",
      "burnedUnsoldTokens",
      "burnedUnusedLpTokens",
      "finalCurvePrice",
      "initialDexPrice",
      "postBurnTotalSupply",
    ],
  );
});

test("graduation snapshot preserves raw integer values", () => {
  const args = {
    caller: "0x0000000000000000000000000000000000000001",
    pair: "0x0000000000000000000000000000000000000002",
    graduationBalance: 100n,
    graduationOvershoot: 5n,
    liquidityTokens: 200n,
    liquidityBnb: 300n,
    liquidityLp: 400n,
    protocolFee: 10n,
    creatorPayout: 20n,
    burnedUnsoldTokens: 30n,
    burnedUnusedLpTokens: 40n,
    finalCurvePrice: 50n,
    initialDexPrice: 60n,
    postBurnTotalSupply: 70n,
  };

  const snapshot = graduationEventSnapshot(args);
  assert.equal(snapshot.pair, "0x0000000000000000000000000000000000000002");
  assert.equal(snapshot.liquidityBnbRaw, "300");
  assert.equal(snapshot.finalCurvePriceRaw, "50");
  assert.equal(snapshot.postBurnTotalSupplyRaw, "70");
});

test("Topaz market remains pending until a pair exists", () => {
  assert.deepEqual(
    classifyTopazMarket({
      pairPresent: false,
      pairMatchesFactory: false,
      tokenPairValid: false,
      volatile: false,
      reservesPresent: false,
      feeVerified: false,
    }),
    {
      routeVerified: false,
      marketStage: "TOPAZ_PENDING",
      reason: "Graduation pair is not available yet.",
    },
  );
});

test("Topaz market only becomes active after every route invariant passes", () => {
  assert.deepEqual(
    classifyTopazMarket({
      pairPresent: true,
      pairMatchesFactory: true,
      tokenPairValid: true,
      volatile: true,
      reservesPresent: true,
      feeVerified: true,
    }),
    { routeVerified: true, marketStage: "TOPAZ_ACTIVE", reason: null },
  );
});

test("a mismatched pool fails closed", () => {
  const result = classifyTopazMarket({
    pairPresent: true,
    pairMatchesFactory: false,
    tokenPairValid: true,
    volatile: true,
    reservesPresent: true,
    feeVerified: true,
  });

  assert.equal(result.routeVerified, false);
  assert.equal(result.marketStage, "TOPAZ_DEGRADED");
  assert.match(String(result.reason), /factory pair mismatch/);
});
