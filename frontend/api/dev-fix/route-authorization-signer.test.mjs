import assert from "node:assert/strict";
import test from "node:test";
import { ethers } from "ethers";

import {
  buildCreateAuthorizationDigest,
  buildScheduledCreateAuthorizationDigest,
  hashCampaignRequest,
} from "./routeAuthorizationSigner.js";

const OBSOLETE_FACTORY = "0xe0FbBa4533513110Cec7e78aa3e48EC45301B5E6";
const CORRECTED_FACTORY = "0x1111111111111111111111111111111111111111";
const CREATOR = "0x2222222222222222222222222222222222222222";

const campaign = {
  name: "Corrected",
  symbol: "FIX",
  logoURI: "ipfs://fixed",
  xAccount: "",
  website: "",
  extraLink: "",
  graduationTarget: 6n * 10n ** 18n,
};

test("refuses immediate creation authorization for the obsolete BSC Testnet factory", () => {
  assert.throws(
    () => buildCreateAuthorizationDigest({
      chainId: 97,
      factoryAddress: OBSOLETE_FACTORY,
      creator: CREATOR,
      request: campaign,
      tradeRouteProfileId: 1,
      finalizeRouteProfileId: 1,
      deadline: 2_000_000_000,
    }),
    /support-only and cannot receive new creation authorizations/,
  );
});

test("refuses scheduled creation authorization for the obsolete BSC Testnet factory", () => {
  assert.throws(
    () => buildScheduledCreateAuthorizationDigest({
      chainId: 97,
      factoryAddress: OBSOLETE_FACTORY,
      creator: CREATOR,
      request: { campaign },
      launchAt: 1_900_000_000,
      draftReferenceHash: ethers.id("draft"),
      normalizedTickerHash: ethers.id("FIX"),
      metadataHash: ethers.id("metadata"),
      reservationVersion: 1,
      authorizationNonce: 1,
      tradeRouteProfileId: 1,
      finalizeRouteProfileId: 1,
      deadline: 2_000_000_000,
    }),
    /support-only and cannot receive new creation authorizations/,
  );
});

test("scheduled authorization defaults to factory generation 3 and campaign generation 2", () => {
  const input = {
    chainId: 97,
    factoryAddress: CORRECTED_FACTORY,
    creator: CREATOR,
    request: { campaign },
    launchAt: 1_900_000_000,
    draftReferenceHash: ethers.id("draft"),
    normalizedTickerHash: ethers.id("FIX"),
    metadataHash: ethers.id("metadata"),
    reservationVersion: 1,
    authorizationNonce: 7,
    tradeRouteProfileId: 1,
    finalizeRouteProfileId: 1,
    deadline: 2_000_000_000,
  };
  const digest = buildScheduledCreateAuthorizationDigest(input);
  const expected = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "string",
        "uint256",
        "address",
        "address",
        "bytes32",
        "uint64",
        "bytes32",
        "bytes32",
        "bytes32",
        "uint64",
        "uint256",
        "uint32",
        "uint32",
        "uint8",
        "uint8",
        "uint64",
      ],
      [
        "MWZ_CREATE_SCHEDULED_V2_AUTH",
        97,
        CORRECTED_FACTORY,
        CREATOR,
        hashCampaignRequest(campaign),
        input.launchAt,
        input.draftReferenceHash,
        input.normalizedTickerHash,
        input.metadataHash,
        input.reservationVersion,
        input.authorizationNonce,
        3,
        2,
        input.tradeRouteProfileId,
        input.finalizeRouteProfileId,
        input.deadline,
      ],
    ),
  );
  assert.equal(digest, expected);
});
